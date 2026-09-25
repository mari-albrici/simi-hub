BEGIN;

-- Prevent invoice writes racing the initial backfill and trigger installation.
LOCK TABLE public.invoices IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.management_allocations IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id uuid REFERENCES public.legal_entities(id),
  source_type text NOT NULL CHECK (source_type IN ('invoice', 'manual')),
  source_id uuid,
  cost_date date NOT NULL,
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  supplier_id uuid REFERENCES public.companies(id),
  cost_category_id uuid REFERENCES public.management_cost_categories(id),
  amount numeric(14,2) NOT NULL CHECK (amount <> 0 AND amount <> 'NaN'::numeric),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'excluded')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_type = 'invoice' AND source_id IS NOT NULL)
    OR (source_type = 'manual' AND source_id IS NULL))
);
CREATE UNIQUE INDEX cost_entries_invoice_source_key
  ON public.cost_entries(source_type, source_id) WHERE source_type = 'invoice';
CREATE INDEX cost_entries_date_idx ON public.cost_entries(cost_date DESC, id);
CREATE INDEX cost_entries_category_idx ON public.cost_entries(cost_category_id);

ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cost_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cost_entries TO authenticated;
CREATE POLICY cost_entries_read ON public.cost_entries FOR SELECT TO authenticated
  USING (public.app_has_permission('management.read'));
CREATE POLICY cost_entries_insert ON public.cost_entries FOR INSERT TO authenticated
  WITH CHECK (public.app_has_permission('management.update') AND source_type = 'manual');
CREATE POLICY cost_entries_update ON public.cost_entries FOR UPDATE TO authenticated
  USING (public.app_has_permission('management.update') AND source_type = 'manual')
  WITH CHECK (public.app_has_permission('management.update') AND source_type = 'manual');

CREATE FUNCTION public.cost_entry_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.source_type = 'manual' THEN
    NEW.created_by := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.source_type, NEW.source_id) IS DISTINCT FROM (OLD.source_type, OLD.source_id) THEN
      RAISE EXCEPTION 'La fonte del costo non può essere modificata.' USING ERRCODE = '23514';
    END IF;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cost_entry_identity() FROM PUBLIC;
CREATE TRIGGER cost_entries_identity BEFORE INSERT OR UPDATE ON public.cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.cost_entry_identity();
CREATE TRIGGER cost_entries_updated_at BEFORE UPDATE ON public.cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cost_entries_category BEFORE INSERT OR UPDATE OF cost_category_id ON public.cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.check_management_allocation_category();
-- Invoice changes are already audited at their source; only manual costs need a new audit event.
CREATE TRIGGER audit_cost_entries AFTER INSERT OR UPDATE ON public.cost_entries
  FOR EACH ROW WHEN (NEW.source_type = 'manual') EXECUTE FUNCTION public.audit_mutation();

ALTER TABLE public.management_allocations
  ADD COLUMN cost_entry_id uuid REFERENCES public.cost_entries(id);
CREATE INDEX management_allocations_cost_entry_idx ON public.management_allocations(cost_entry_id);

-- Internal helper shared by live synchronization, backfill and legacy allocation writes.
-- Not exposed to API users. Preserve the signed invoice amount; never infer a category.
CREATE FUNCTION public.sync_invoice_cost_entry(p_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE i public.invoices; entry_id uuid; entry_status text;
BEGIN
  SELECT * INTO i FROM public.invoices WHERE id = p_invoice_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  entry_status := CASE WHEN i.archived_at IS NOT NULL OR i.status IN ('archived', 'cancelled')
    THEN 'excluded' ELSE 'active' END;
  -- Zero invoices have no economic cost. Once a cost exists, explicitly reject
  -- zeroing its source, preserving both source coherence and the nonzero constraint.
  IF i.amount_total = 0 THEN
    IF EXISTS (SELECT 1 FROM public.cost_entries WHERE source_type = 'invoice' AND source_id = i.id) THEN
      RAISE EXCEPTION 'Non è possibile azzerare una fattura con un costo gestionale esistente.' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;
  INSERT INTO public.cost_entries AS existing
    (source_type, source_id, legal_entity_id, supplier_id, cost_date, description, amount, currency, status, created_by)
  VALUES ('invoice', i.id, i.legal_entity_id, i.supplier_id,
    COALESCE(i.registration_date, i.received_date, i.invoice_date, (i.created_at AT TIME ZONE 'UTC')::date),
    'Fattura ' || i.invoice_number, i.amount_total, i.currency, entry_status, i.created_by)
  ON CONFLICT (source_type, source_id) WHERE source_type = 'invoice' DO UPDATE SET
    legal_entity_id = EXCLUDED.legal_entity_id, supplier_id = EXCLUDED.supplier_id,
    cost_date = EXCLUDED.cost_date, description = EXCLUDED.description,
    amount = EXCLUDED.amount, currency = EXCLUDED.currency, status = EXCLUDED.status
  WHERE (existing.legal_entity_id, existing.supplier_id, existing.cost_date, existing.description,
    existing.amount, existing.currency, existing.status) IS DISTINCT FROM
    (EXCLUDED.legal_entity_id, EXCLUDED.supplier_id, EXCLUDED.cost_date, EXCLUDED.description,
    EXCLUDED.amount, EXCLUDED.currency, EXCLUDED.status);
  SELECT id INTO entry_id FROM public.cost_entries WHERE source_type = 'invoice' AND source_id = i.id;
  RETURN entry_id;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_invoice_cost_entry(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.sync_invoice_cost_entry_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.cost_entries SET status = 'excluded'
      WHERE source_type = 'invoice' AND source_id = OLD.id AND status <> 'excluded';
    RETURN OLD;
  END IF;
  PERFORM public.sync_invoice_cost_entry(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_invoice_cost_entry_trigger() FROM PUBLIC;
CREATE TRIGGER invoices_cost_entry_sync AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_cost_entry_trigger();

-- Include archived invoices with allocations so every historical allocation can
-- be linked. Other archived invoices are not part of the initial active register.
DO $$
DECLARE invoice_id uuid;
BEGIN
  FOR invoice_id IN SELECT i.id FROM public.invoices i
    WHERE i.amount_total <> 0 AND (
      (i.archived_at IS NULL AND i.status NOT IN ('archived', 'cancelled'))
      OR EXISTS (SELECT 1 FROM public.management_allocations a WHERE a.invoice_id = i.id))
    ORDER BY i.id
  LOOP
    PERFORM public.sync_invoice_cost_entry(invoice_id);
  END LOOP;
END;
$$;

UPDATE public.management_allocations a SET cost_entry_id = c.id
  FROM public.cost_entries c
  WHERE c.source_type = 'invoice' AND c.source_id = a.invoice_id
    AND a.cost_entry_id IS DISTINCT FROM c.id;

CREATE FUNCTION public.link_allocation_cost_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry public.cost_entries;
BEGIN
  -- P0.3 keeps invoice_id NOT NULL. Manual costs can be recorded, but allocating
  -- them is not exposed in this compatibility phase.
  IF NEW.cost_entry_id IS NOT NULL THEN
    SELECT * INTO entry FROM public.cost_entries WHERE id = NEW.cost_entry_id;
    IF NOT FOUND OR entry.source_type <> 'invoice' THEN
      RAISE EXCEPTION 'Allocazione non compatibile con la fonte fattura.' USING ERRCODE = '23514';
    END IF;
    IF NEW.invoice_id IS NULL THEN NEW.invoice_id := entry.source_id; END IF;
    IF NEW.invoice_id IS DISTINCT FROM entry.source_id THEN
      RAISE EXCEPTION 'Costo e fattura non corrispondono.' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.cost_entry_id := public.sync_invoice_cost_entry(NEW.invoice_id);
  IF NEW.cost_entry_id IS NULL THEN
    RAISE EXCEPTION 'La fattura non ha un costo allocabile.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.link_allocation_cost_entry() FROM PUBLIC;
-- Runs before the existing lock trigger, also allowing cost_entry_id-first callers
-- to have invoice_id resolved before the unchanged P0.1 checks.
CREATE TRIGGER management_allocations_cost_entry BEFORE INSERT OR UPDATE ON public.management_allocations
  FOR EACH ROW EXECUTE FUNCTION public.link_allocation_cost_entry();

CREATE FUNCTION public.check_cost_entry_allocation_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry_limit numeric; allocated numeric;
BEGIN
  SELECT abs(amount) INTO entry_limit FROM public.cost_entries WHERE id = NEW.cost_entry_id;
  SELECT COALESCE(sum(allocated_amount), 0) INTO allocated FROM public.management_allocations
    WHERE cost_entry_id = NEW.cost_entry_id;
  IF allocated > entry_limit THEN
    RAISE EXCEPTION 'Il totale allocato supera il valore assoluto del costo.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_cost_entry_allocation_total() FROM PUBLIC;
CREATE TRIGGER management_allocations_cost_total AFTER INSERT OR UPDATE ON public.management_allocations
  FOR EACH ROW EXECUTE FUNCTION public.check_cost_entry_allocation_total();

-- Compute balances from allocations without storing a duplicate total. Invoker
-- security retains the RLS of both underlying tables, including management.read.
CREATE VIEW public.cost_entry_balances WITH (security_invoker = true) AS
  SELECT c.*, COALESCE(a.allocated_total, 0) AS allocated_total,
    abs(c.amount) - COALESCE(a.allocated_total, 0) AS residual
  FROM public.cost_entries c LEFT JOIN LATERAL (
    SELECT sum(allocated_amount) AS allocated_total
    FROM public.management_allocations WHERE cost_entry_id = c.id
  ) a ON true;
REVOKE ALL ON public.cost_entry_balances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cost_entry_balances TO authenticated;

COMMIT;
