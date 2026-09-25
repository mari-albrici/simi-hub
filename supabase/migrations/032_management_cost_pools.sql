BEGIN;

CREATE TABLE public.management_cost_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  cost_center_id uuid NOT NULL REFERENCES public.management_cost_centers(id),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  driver_type text NOT NULL CHECK (driver_type IN ('labor_hours', 'worker_days')),
  planned_driver_quantity numeric(14,2) CHECK (planned_driver_quantity >= 0 AND planned_driver_quantity <> 'NaN'::numeric),
  -- P1.1 supports calculated rates only. The read view derives the effective rate.
  standard_rate numeric(14,6) CHECK (standard_rate IS NULL),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code, period_start, period_end)
);
ALTER TABLE public.management_cost_pools ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.management_cost_pools FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.management_cost_pools TO authenticated;
CREATE POLICY management_cost_pools_read ON public.management_cost_pools FOR SELECT TO authenticated
  USING (public.app_has_permission('management.read'));
CREATE POLICY management_cost_pools_insert ON public.management_cost_pools FOR INSERT TO authenticated
  WITH CHECK (public.app_has_permission('management.update'));
CREATE POLICY management_cost_pools_update ON public.management_cost_pools FOR UPDATE TO authenticated
  USING (public.app_has_permission('management.update')) WITH CHECK (public.app_has_permission('management.update'));
CREATE TRIGGER management_cost_pools_updated_at BEFORE UPDATE ON public.management_cost_pools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_management_cost_pools AFTER INSERT OR UPDATE ON public.management_cost_pools
  FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();

ALTER TABLE public.cost_entries ADD COLUMN cost_pool_id uuid REFERENCES public.management_cost_pools(id);
CREATE INDEX cost_entries_pool_idx ON public.cost_entries(cost_pool_id);

CREATE FUNCTION public.check_management_cost_pool()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE center_active boolean; center_changed boolean;
BEGIN
  center_changed := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN
    center_changed := NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id;
    NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
    IF (NEW.cost_center_id, NEW.currency) IS DISTINCT FROM (OLD.cost_center_id, OLD.currency) THEN
      IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'Pool updates require READ COMMITTED isolation' USING ERRCODE='40001';
      END IF;
      IF EXISTS (SELECT 1 FROM public.cost_entries WHERE cost_pool_id=OLD.id) THEN
        RAISE EXCEPTION 'Scollega i costi prima di cambiare centro o valuta del pool.' USING ERRCODE='22023';
      END IF;
    END IF;
  ELSE NEW.created_by := auth.uid();
  END IF;
  IF center_changed THEN
    SELECT is_active INTO center_active FROM public.management_cost_centers WHERE id=NEW.cost_center_id FOR SHARE;
    IF center_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Il centro di costo deve esistere ed essere attivo.' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_management_cost_pool() FROM PUBLIC;
CREATE TRIGGER management_cost_pools_check BEFORE INSERT OR UPDATE ON public.management_cost_pools
  FOR EACH ROW EXECUTE FUNCTION public.check_management_cost_pool();

CREATE FUNCTION public.check_cost_entry_pool()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pool public.management_cost_pools; assigning boolean; center_active boolean;
BEGIN
  IF NEW.cost_pool_id IS NULL THEN RETURN NEW; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Pool assignment requires READ COMMITTED isolation' USING ERRCODE='40001';
  END IF;
  assigning := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN assigning := NEW.cost_pool_id IS DISTINCT FROM OLD.cost_pool_id; END IF;
  SELECT * INTO pool FROM public.management_cost_pools WHERE id=NEW.cost_pool_id FOR SHARE;
  IF NOT FOUND OR (assigning AND pool.status='closed') THEN
    RAISE EXCEPTION 'Pool non trovato o chiuso.' USING ERRCODE='22023';
  END IF;
  IF NEW.cost_center_id IS NULL THEN NEW.cost_center_id := pool.cost_center_id; END IF;
  IF NEW.cost_center_id IS DISTINCT FROM pool.cost_center_id THEN
    RAISE EXCEPTION 'Il centro del costo è diverso dal centro del pool.' USING ERRCODE='22023';
  END IF;
  IF NEW.currency IS DISTINCT FROM pool.currency THEN
    RAISE EXCEPTION 'La valuta del costo è diversa dalla valuta del pool.' USING ERRCODE='22023';
  END IF;
  IF assigning THEN
    SELECT is_active INTO center_active FROM public.management_cost_centers WHERE id=pool.cost_center_id FOR SHARE;
    IF center_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Il centro del pool non è attivo.' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_cost_entry_pool() FROM PUBLIC;
-- Runs before the existing center validator; setting a pool can fill an empty center.
CREATE TRIGGER cost_entries_00_pool BEFORE INSERT OR UPDATE OF cost_pool_id,cost_center_id,currency ON public.cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.check_cost_entry_pool();

-- Preserve the four-argument classification RPC for previous callers.
CREATE FUNCTION public.update_cost_entry_classification(
  p_id uuid, p_cost_category_id uuid, p_cost_center_id uuid, p_notes text, p_cost_pool_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry_id uuid;
BEGIN
  IF NOT public.app_has_permission('management.update') THEN
    RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501';
  END IF;
  IF length(COALESCE(p_notes,'')) > 2000 THEN RAISE EXCEPTION 'Note troppo lunghe.' USING ERRCODE='22023'; END IF;
  UPDATE public.cost_entries SET cost_category_id=p_cost_category_id, cost_center_id=p_cost_center_id,
    cost_pool_id=p_cost_pool_id, notes=NULLIF(btrim(p_notes),'') WHERE id=p_id RETURNING id INTO entry_id;
  IF entry_id IS NULL THEN RAISE EXCEPTION 'Costo non trovato.' USING ERRCODE='22023'; END IF;
  RETURN entry_id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_cost_entry_classification(uuid,uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_cost_entry_classification(uuid,uuid,uuid,text,uuid) TO authenticated;
DROP TRIGGER audit_invoice_cost_classification ON public.cost_entries;
CREATE TRIGGER audit_invoice_cost_classification AFTER UPDATE ON public.cost_entries
  FOR EACH ROW WHEN (NEW.source_type='invoice' AND
    (NEW.cost_category_id,NEW.cost_center_id,NEW.cost_pool_id,NEW.notes) IS DISTINCT FROM
    (OLD.cost_category_id,OLD.cost_center_id,OLD.cost_pool_id,OLD.notes))
  EXECUTE FUNCTION public.audit_mutation();

CREATE VIEW public.management_cost_pool_summaries WITH (security_invoker=true) AS
  SELECT p.id,p.code,p.name,p.description,p.cost_center_id,center.name AS cost_center_name,
    p.period_start,p.period_end,p.driver_type,p.planned_driver_quantity,p.currency,p.status,p.notes,
    p.created_by,p.created_at,p.updated_at,
    COALESCE(costs.actual_cost,0) AS actual_cost,
    COALESCE(costs.linked_count,0) AS linked_cost_entries_count,
    CASE WHEN p.planned_driver_quantity > 0
      THEN round(COALESCE(costs.actual_cost,0)/p.planned_driver_quantity,6) ELSE NULL END AS standard_rate
  FROM public.management_cost_pools p
  LEFT JOIN public.management_cost_centers center ON center.id=p.cost_center_id
  LEFT JOIN LATERAL (
    SELECT sum(amount) FILTER (WHERE status='active') AS actual_cost, count(*) AS linked_count
    FROM public.cost_entries WHERE cost_pool_id=p.id
  ) costs ON true;
REVOKE ALL ON public.management_cost_pool_summaries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.management_cost_pool_summaries TO authenticated;

CREATE OR REPLACE VIEW public.cost_entry_balances WITH (security_invoker=true) AS
  SELECT c.id,c.legal_entity_id,c.source_type,c.source_id,c.cost_date,c.description,
    c.supplier_id,c.cost_category_id,c.amount,c.currency,c.status,c.notes,c.created_by,c.created_at,c.updated_at,
    COALESCE(a.allocated_total,0) AS allocated_total,abs(c.amount)-COALESCE(a.allocated_total,0) AS residual,
    c.cost_center_id,center.name AS cost_center_name,center.code AS cost_center_code,
    category.name AS cost_category_name,supplier.business_name AS supplier_name,
    CASE WHEN c.status='excluded' THEN 'excluded'
      WHEN COALESCE(a.allocated_total,0)=abs(c.amount) THEN 'allocated'
      WHEN a.allocated_total>0 AND a.allocated_total<abs(c.amount) THEN 'partially_allocated'
      WHEN c.cost_center_id IS NOT NULL THEN 'cost_center' ELSE 'unallocated' END AS management_status,
    COALESCE(a.allocated_total,0) AS allocated_amount,abs(c.amount)-COALESCE(a.allocated_total,0) AS remaining_amount,
    c.cost_pool_id,pool.name AS cost_pool_name
  FROM public.cost_entries c
  LEFT JOIN public.management_cost_centers center ON center.id=c.cost_center_id
  LEFT JOIN public.management_cost_categories category ON category.id=c.cost_category_id
  LEFT JOIN public.companies supplier ON supplier.id=c.supplier_id
  LEFT JOIN public.management_cost_pools pool ON pool.id=c.cost_pool_id
  LEFT JOIN LATERAL (SELECT sum(allocated_amount) AS allocated_total FROM public.management_allocations WHERE cost_entry_id=c.id) a ON true;

-- No seeded period: the user chooses dates when creating the first small_equipment pool.
COMMIT;
