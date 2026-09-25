BEGIN;

CREATE TABLE public.management_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.management_cost_centers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.management_cost_centers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.management_cost_centers TO authenticated;
CREATE POLICY management_cost_centers_read ON public.management_cost_centers
  FOR SELECT TO authenticated USING (public.app_has_permission('management.read'));
CREATE POLICY management_cost_centers_insert ON public.management_cost_centers
  FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('management.update'));
CREATE POLICY management_cost_centers_update ON public.management_cost_centers
  FOR UPDATE TO authenticated USING (public.app_has_permission('management.update'))
  WITH CHECK (public.app_has_permission('management.update'));
CREATE TRIGGER management_cost_centers_updated_at BEFORE UPDATE ON public.management_cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_management_cost_centers AFTER INSERT OR UPDATE ON public.management_cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();

INSERT INTO public.management_cost_centers(code, name, sort_order) VALUES
  ('small_equipment', 'Piccola attrezzatura', 10),
  ('warehouse', 'Magazzino', 20),
  ('administration', 'Amministrazione', 30),
  ('technical_office', 'Ufficio tecnico', 40),
  ('vehicles', 'Parco mezzi', 50),
  ('containers_logistics', 'Container e logistica', 60);

ALTER TABLE public.cost_entries
  ADD COLUMN cost_center_id uuid REFERENCES public.management_cost_centers(id);
CREATE INDEX cost_entries_cost_center_idx ON public.cost_entries(cost_center_id);

CREATE FUNCTION public.check_cost_entry_center()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE center_active boolean;
BEGIN
  IF NEW.cost_center_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cost_center_id IS NOT DISTINCT FROM OLD.cost_center_id THEN RETURN NEW; END IF;
  END IF;
  SELECT is_active INTO center_active FROM public.management_cost_centers
    WHERE id = NEW.cost_center_id FOR SHARE;
  IF center_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Il centro di costo deve esistere ed essere attivo.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_cost_entry_center() FROM PUBLIC;
CREATE TRIGGER cost_entries_center BEFORE INSERT OR UPDATE OF cost_center_id ON public.cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.check_cost_entry_center();

-- Retain the existing manual-only UPDATE policy. This narrow RPC is the only
-- authenticated route to invoice cost classification; no financial fields accepted.
CREATE FUNCTION public.update_cost_entry_classification(
  p_id uuid, p_cost_category_id uuid, p_cost_center_id uuid, p_notes text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry_id uuid;
BEGIN
  IF NOT public.app_has_permission('management.update') THEN
    RAISE EXCEPTION 'Accesso negato.' USING ERRCODE = '42501';
  END IF;
  IF length(COALESCE(p_notes, '')) > 2000 THEN
    RAISE EXCEPTION 'Note troppo lunghe.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.cost_entries SET cost_category_id = p_cost_category_id,
    cost_center_id = p_cost_center_id, notes = NULLIF(btrim(p_notes), '')
    WHERE id = p_id RETURNING id INTO entry_id;
  IF entry_id IS NULL THEN
    RAISE EXCEPTION 'Costo non trovato.' USING ERRCODE = '22023';
  END IF;
  RETURN entry_id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_cost_entry_classification(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_cost_entry_classification(uuid,uuid,uuid,text) TO authenticated;

-- Manual costs already have audit_cost_entries. Audit invoice classification only,
-- so synchronization of source financial fields does not duplicate invoice logs.
CREATE TRIGGER audit_invoice_cost_classification AFTER UPDATE ON public.cost_entries
  FOR EACH ROW WHEN (NEW.source_type = 'invoice' AND
    (NEW.cost_category_id, NEW.cost_center_id, NEW.notes) IS DISTINCT FROM
    (OLD.cost_category_id, OLD.cost_center_id, OLD.notes))
  EXECUTE FUNCTION public.audit_mutation();

-- Preserve the old view's column order, appending the new fields. Inactive centers
-- stay visible, and allocation state takes precedence over center classification.
CREATE OR REPLACE VIEW public.cost_entry_balances WITH (security_invoker = true) AS
  SELECT c.id, c.legal_entity_id, c.source_type, c.source_id, c.cost_date, c.description,
    c.supplier_id, c.cost_category_id, c.amount, c.currency, c.status, c.notes,
    c.created_by, c.created_at, c.updated_at,
    COALESCE(a.allocated_total, 0) AS allocated_total,
    abs(c.amount) - COALESCE(a.allocated_total, 0) AS residual,
    c.cost_center_id, center.name AS cost_center_name, center.code AS cost_center_code,
    category.name AS cost_category_name, supplier.business_name AS supplier_name,
    CASE
      WHEN c.status = 'excluded' THEN 'excluded'
      WHEN COALESCE(a.allocated_total, 0) = abs(c.amount) THEN 'allocated'
      WHEN a.allocated_total > 0 AND a.allocated_total < abs(c.amount) THEN 'partially_allocated'
      WHEN c.cost_center_id IS NOT NULL THEN 'in_cost_center'
      ELSE 'to_manage'
    END AS management_status
  FROM public.cost_entries c
  LEFT JOIN public.management_cost_centers center ON center.id = c.cost_center_id
  LEFT JOIN public.management_cost_categories category ON category.id = c.cost_category_id
  LEFT JOIN public.companies supplier ON supplier.id = c.supplier_id
  LEFT JOIN LATERAL (
    SELECT sum(allocated_amount) AS allocated_total
    FROM public.management_allocations WHERE cost_entry_id = c.id
  ) a ON true;

COMMIT;
