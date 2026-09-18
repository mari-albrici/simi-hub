-- Fase 1E: anagrafica commesse e fascicolo operativo.
-- Additive: le colonne legacy restano valide e non vengono rinumerati record esistenti.
BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS planned_start_date date,
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS customer_contact_id uuid REFERENCES public.company_contacts(id);

CREATE INDEX IF NOT EXISTS idx_projects_customer_contact_id ON public.projects(customer_contact_id);
CREATE INDEX IF NOT EXISTS idx_projects_planned_start_date ON public.projects(planned_start_date);
CREATE INDEX IF NOT EXISTS idx_projects_expected_closing_date ON public.projects(expected_closing_date);
CREATE INDEX IF NOT EXISTS idx_projects_country ON public.projects(country);

CREATE OR REPLACE FUNCTION public.validate_project_contact() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.customer_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_contacts c WHERE c.id=NEW.customer_contact_id AND c.company_id=NEW.customer_id
  ) THEN RAISE EXCEPTION 'Referente cliente non appartenente alla controparte' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_project_contact ON public.projects;
CREATE TRIGGER validate_project_contact BEFORE INSERT OR UPDATE OF customer_id,customer_contact_id ON public.projects FOR EACH ROW EXECUTE FUNCTION public.validate_project_contact();

-- Only the checked RPC may archive or restore a project.
CREATE OR REPLACE FUNCTION public.restore_project(project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.app_has_permission('project.delete') THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
  END IF;
  UPDATE public.projects SET archived_at=NULL WHERE id=project_id AND archived_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non disponibile' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.restore_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_project(uuid) TO authenticated;

-- Aggregate counters stay server-side and preserve currency separation.
CREATE OR REPLACE FUNCTION public.project_operational_summary(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.app_has_permission('project.read') OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id=p_project_id) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'documents', (SELECT count(*) FROM public.document_projects dp JOIN public.documents d ON d.id=dp.document_id WHERE dp.project_id=p_project_id AND d.archived_at IS NULL),
    'invoices', (SELECT count(DISTINCT ip.invoice_id) FROM public.invoice_projects ip JOIN public.invoices i ON i.id=ip.invoice_id WHERE ip.project_id=p_project_id AND i.archived_at IS NULL),
    'supplier_invoices', (SELECT count(DISTINCT ip.invoice_id) FROM public.invoice_projects ip JOIN public.invoices i ON i.id=ip.invoice_id WHERE ip.project_id=p_project_id AND i.archived_at IS NULL AND i.invoice_type='purchase'),
    'customer_invoices', (SELECT count(DISTINCT ip.invoice_id) FROM public.invoice_projects ip JOIN public.invoices i ON i.id=ip.invoice_id WHERE ip.project_id=p_project_id AND i.archived_at IS NULL AND i.invoice_type='sale'),
    'open_deadlines', (SELECT count(*) FROM public.operational_deadlines d WHERE p_project_id=ANY(d.project_ids) AND d.archived_at IS NULL AND NOT d.completed),
    'overdue_deadlines', (SELECT count(*) FROM public.operational_deadlines d WHERE p_project_id=ANY(d.project_ids) AND d.archived_at IS NULL AND NOT d.completed AND d.due_date<CURRENT_DATE),
    'financial', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',x.kind,'currency',x.currency,'original',x.original,'settled',x.settled,'residual',x.residual)) FROM (
      SELECT CASE WHEN i.invoice_type='purchase' THEN 'payment' ELSE 'receipt' END kind, i.currency,
        sum(l.amount_total) original,
        sum(greatest(l.amount_total - COALESCE((SELECT sum(a.amount) FROM public.financial_allocations a JOIN public.financial_movements m ON m.id=a.movement_id AND m.archived_at IS NULL WHERE a.invoice_id=i.id),0),0)) residual,
        sum(least(l.amount_total,COALESCE((SELECT sum(a.amount) FROM public.financial_allocations a JOIN public.financial_movements m ON m.id=a.movement_id AND m.archived_at IS NULL WHERE a.invoice_id=i.id),0))) settled
      FROM public.invoice_lines l JOIN public.invoices i ON i.id=l.invoice_id WHERE l.project_id=p_project_id AND i.archived_at IS NULL GROUP BY kind,i.currency
    ) x), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.project_operational_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_operational_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.project_activity_events(p_project_id uuid)
RETURNS TABLE(id uuid, user_id uuid, action text, entity_type text, entity_id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT a.id,a.user_id,a.action,a.entity_type,a.entity_id,a.created_at
  FROM public.activity_logs a
  WHERE public.app_has_permission('project.read')
    AND a.entity_id=p_project_id
  ORDER BY a.created_at DESC
  LIMIT 100
$$;
REVOKE ALL ON FUNCTION public.project_activity_events(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_activity_events(uuid) TO authenticated;

COMMIT;
