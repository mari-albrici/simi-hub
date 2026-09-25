BEGIN;

ALTER TABLE public.management_allocations ALTER COLUMN invoice_id DROP NOT NULL;
ALTER TABLE public.management_allocations ADD CONSTRAINT management_allocations_source_required
  CHECK (cost_entry_id IS NOT NULL OR invoice_id IS NOT NULL);
CREATE UNIQUE INDEX management_allocations_cost_project_key
  ON public.management_allocations(cost_entry_id, project_id) WHERE cost_entry_id IS NOT NULL;

-- Resolve legacy invoice-only requests, but never overwrite an explicit cost source.
CREATE OR REPLACE FUNCTION public.link_allocation_cost_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry public.cost_entries;
BEGIN
  IF NEW.cost_entry_id IS NULL AND NEW.invoice_id IS NOT NULL THEN
    NEW.cost_entry_id := public.sync_invoice_cost_entry(NEW.invoice_id);
  END IF;
  SELECT * INTO entry FROM public.cost_entries WHERE id = NEW.cost_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Costo gestionale non trovato.' USING ERRCODE = '23514';
  END IF;
  IF entry.source_type = 'invoice' THEN
    IF NEW.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM entry.source_id THEN
      RAISE EXCEPTION 'Costo e fattura non corrispondono.' USING ERRCODE = '23514';
    END IF;
    NEW.invoice_id := entry.source_id;
  ELSIF NEW.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un costo manuale non può avere una fattura sorgente.' USING ERRCODE = '23514';
  END IF;
  -- Editing an allocation changes its fields, not its economic source.
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.cost_entry_id IS NOT NULL AND NEW.cost_entry_id IS DISTINCT FROM OLD.cost_entry_id)
      OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
      RAISE EXCEPTION 'La fonte dell''allocazione non può essere modificata.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Invoice -> cost lock order matches source synchronization. All allocation writes,
-- including DELETE, serialize on the cost row. READ COMMITTED is the P0.1 contract.
CREATE OR REPLACE FUNCTION public.lock_management_allocation_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE parent_invoice uuid; parent_cost uuid; cost_status text;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Management allocations require READ COMMITTED isolation' USING ERRCODE = '40001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    parent_invoice := OLD.invoice_id; parent_cost := OLD.cost_entry_id;
  ELSE
    parent_invoice := NEW.invoice_id; parent_cost := NEW.cost_entry_id;
  END IF;
  PERFORM id FROM public.invoices WHERE id = parent_invoice FOR NO KEY UPDATE;
  SELECT status INTO cost_status FROM public.cost_entries WHERE id = parent_cost FOR NO KEY UPDATE;
  IF TG_OP <> 'DELETE' AND (NOT FOUND OR cost_status <> 'active') THEN
    RAISE EXCEPTION 'Il costo non esiste o è escluso.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_management_allocation_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE allocation_limit numeric; allocated numeric;
BEGIN
  IF NEW.cost_entry_id IS NOT NULL THEN
    SELECT abs(amount) INTO allocation_limit FROM public.cost_entries WHERE id = NEW.cost_entry_id;
    SELECT COALESCE(sum(allocated_amount), 0) INTO allocated FROM public.management_allocations
      WHERE cost_entry_id = NEW.cost_entry_id;
  ELSE
    SELECT abs(amount_total) INTO allocation_limit FROM public.invoices WHERE id = NEW.invoice_id;
    SELECT COALESCE(sum(allocated_amount), 0) INTO allocated FROM public.management_allocations
      WHERE invoice_id = NEW.invoice_id;
  END IF;
  IF allocation_limit IS NULL OR allocation_limit = 'NaN'::numeric OR allocated > allocation_limit THEN
    RAISE EXCEPTION 'Il totale allocato supera il valore assoluto del costo.'
      USING ERRCODE = '23514', CONSTRAINT = 'management_allocations_total_limit';
  END IF;
  RETURN NEW;
END;
$$;
-- The single check above now covers cost and legacy sources.
DROP TRIGGER management_allocations_cost_total ON public.management_allocations;
DROP FUNCTION public.check_cost_entry_allocation_total();

-- Also guard manual cost reductions; UPDATE already holds the same parent row lock.
CREATE FUNCTION public.check_cost_entry_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE allocated numeric;
BEGIN
  IF NEW.amount IS NOT DISTINCT FROM OLD.amount THEN RETURN NEW; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Cost allocation validation requires READ COMMITTED isolation' USING ERRCODE = '40001';
  END IF;
  SELECT COALESCE(sum(allocated_amount), 0) INTO allocated
    FROM public.management_allocations WHERE cost_entry_id = NEW.id;
  IF allocated > abs(NEW.amount) THEN
    RAISE EXCEPTION 'L''importo del costo è inferiore al totale già allocato.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_cost_entry_capacity() FROM PUBLIC;
CREATE TRIGGER cost_entries_allocation_capacity BEFORE UPDATE OF amount ON public.cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.check_cost_entry_capacity();

CREATE OR REPLACE VIEW public.cost_entry_balances WITH (security_invoker = true) AS
  SELECT c.id, c.legal_entity_id, c.source_type, c.source_id, c.cost_date, c.description,
    c.supplier_id, c.cost_category_id, c.amount, c.currency, c.status, c.notes,
    c.created_by, c.created_at, c.updated_at,
    COALESCE(a.allocated_total, 0) AS allocated_total,
    abs(c.amount) - COALESCE(a.allocated_total, 0) AS residual,
    c.cost_center_id, center.name AS cost_center_name, center.code AS cost_center_code,
    category.name AS cost_category_name, supplier.business_name AS supplier_name,
    CASE WHEN c.status = 'excluded' THEN 'excluded'
      WHEN COALESCE(a.allocated_total, 0) = abs(c.amount) THEN 'allocated'
      WHEN a.allocated_total > 0 AND a.allocated_total < abs(c.amount) THEN 'partially_allocated'
      WHEN c.cost_center_id IS NOT NULL THEN 'cost_center'
      ELSE 'unallocated' END AS management_status,
    COALESCE(a.allocated_total, 0) AS allocated_amount,
    abs(c.amount) - COALESCE(a.allocated_total, 0) AS remaining_amount
  FROM public.cost_entries c
  LEFT JOIN public.management_cost_centers center ON center.id = c.cost_center_id
  LEFT JOIN public.management_cost_categories category ON category.id = c.cost_category_id
  LEFT JOIN public.companies supplier ON supplier.id = c.supplier_id
  LEFT JOIN LATERAL (
    SELECT sum(allocated_amount) AS allocated_total
    FROM public.management_allocations WHERE cost_entry_id = c.id
  ) a ON true;

COMMIT;
