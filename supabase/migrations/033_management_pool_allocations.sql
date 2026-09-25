BEGIN;

CREATE TABLE public.management_pool_driver_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.management_cost_pools(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  driver_quantity numeric(14,2) NOT NULL CHECK (driver_quantity >= 0 AND driver_quantity <> 'NaN'::numeric),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type = 'manual'),
  period_start date,
  period_end date CHECK (period_end >= period_start),
  notes text CHECK (length(notes) <= 2000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pool_id,project_id)
);

-- Secondary distributions: never change direct cost-entry allocations or coverage.
CREATE TABLE public.management_pool_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.management_cost_pools(id),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  driver_quantity numeric(14,2) NOT NULL CHECK (driver_quantity >= 0 AND driver_quantity <> 'NaN'::numeric),
  rate numeric(14,6) NOT NULL CHECK (rate > 0 AND rate <> 'NaN'::numeric),
  allocated_amount numeric(14,2) NOT NULL CHECK (allocated_amount >= 0 AND allocated_amount <> 'NaN'::numeric),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(pool_id,project_id)
);
CREATE INDEX management_pool_allocations_project_idx ON public.management_pool_allocations(project_id);
ALTER TABLE public.management_pool_driver_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_pool_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.management_pool_driver_entries,public.management_pool_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.management_pool_driver_entries TO authenticated;
-- Generated rows are only writable through the checked SECURITY DEFINER RPC/reset trigger.
GRANT SELECT ON public.management_pool_allocations TO authenticated;
CREATE POLICY pool_driver_read ON public.management_pool_driver_entries FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
CREATE POLICY pool_driver_insert ON public.management_pool_driver_entries FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY pool_driver_update ON public.management_pool_driver_entries FOR UPDATE TO authenticated USING(public.app_has_permission('management.update')) WITH CHECK(public.app_has_permission('management.update'));
CREATE POLICY pool_driver_delete ON public.management_pool_driver_entries FOR DELETE TO authenticated USING(public.app_has_permission('management.update'));
CREATE POLICY pool_allocation_read ON public.management_pool_allocations FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));

CREATE FUNCTION public.check_pool_driver_entry() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; pool_status text; removed numeric;
BEGIN
  IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'Pool mutations require READ COMMITTED' USING ERRCODE='40001'; END IF;
  IF TG_OP='DELETE' THEN target:=OLD.pool_id; ELSE target:=NEW.pool_id; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.pool_id,NEW.project_id) IS DISTINCT FROM (OLD.pool_id,OLD.project_id) THEN
      RAISE EXCEPTION 'Pool e commessa del driver non sono modificabili.' USING ERRCODE='22023';
    END IF;
    NEW.created_by:=OLD.created_by; NEW.created_at:=OLD.created_at;
  ELSIF TG_OP='INSERT' THEN NEW.created_by:=auth.uid(); END IF;
  SELECT status INTO pool_status FROM public.management_cost_pools WHERE id=target FOR NO KEY UPDATE;
  IF NOT FOUND OR pool_status='closed' THEN RAISE EXCEPTION 'Pool non trovato o chiuso.' USING ERRCODE='22023'; END IF;
  IF TG_OP='INSERT' THEN
    PERFORM 1 FROM public.projects WHERE id=NEW.project_id AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non disponibile.' USING ERRCODE='22023'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN
    -- Explicit removal is a per-project reset, including its generated snapshot.
    DELETE FROM public.management_pool_allocations WHERE pool_id=target AND project_id=OLD.project_id RETURNING allocated_amount INTO removed;
    IF FOUND THEN
      INSERT INTO public.activity_logs(user_id,entity_type,entity_id,action,old_data,new_data)
      VALUES(auth.uid(),'management_cost_pools',target,'reset_pool_allocation',
        jsonb_build_object('project_id',OLD.project_id,'allocated_amount',removed),NULL);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_pool_driver_entry() FROM PUBLIC;
CREATE TRIGGER pool_driver_check BEFORE INSERT OR UPDATE OR DELETE ON public.management_pool_driver_entries FOR EACH ROW EXECUTE FUNCTION public.check_pool_driver_entry();
CREATE TRIGGER pool_driver_updated_at BEFORE UPDATE ON public.management_pool_driver_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_pool_drivers AFTER INSERT OR UPDATE OR DELETE ON public.management_pool_driver_entries FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();

CREATE FUNCTION public.protect_pool_distribution_metadata() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'Pool mutations require READ COMMITTED' USING ERRCODE='40001'; END IF;
  IF OLD.status='closed' THEN RAISE EXCEPTION 'Il pool chiuso è in sola lettura.' USING ERRCODE='22023'; END IF;
  IF (NEW.driver_type,NEW.currency,NEW.cost_center_id) IS DISTINCT FROM (OLD.driver_type,OLD.currency,OLD.cost_center_id)
    AND (EXISTS(SELECT 1 FROM public.management_pool_driver_entries WHERE pool_id=OLD.id)
      OR EXISTS(SELECT 1 FROM public.management_pool_allocations WHERE pool_id=OLD.id)) THEN
    RAISE EXCEPTION 'Rimuovi i driver prima di cambiare unità, valuta o centro del pool.' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_pool_distribution_metadata() FROM PUBLIC;
CREATE TRIGGER pool_distribution_metadata BEFORE UPDATE ON public.management_cost_pools FOR EACH ROW EXECUTE FUNCTION public.protect_pool_distribution_metadata();

CREATE FUNCTION public.generate_cost_pool_allocations(p_pool_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pool public.management_cost_pools; effective_rate numeric(14,6); result jsonb; previous jsonb;
BEGIN
  IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'Pool generation requires READ COMMITTED' USING ERRCODE='40001'; END IF;
  SELECT * INTO pool FROM public.management_cost_pools WHERE id=p_pool_id FOR NO KEY UPDATE;
  IF NOT FOUND OR pool.status='closed' THEN RAISE EXCEPTION 'Pool non trovato o chiuso.' USING ERRCODE='22023'; END IF;
  SELECT round(COALESCE(sum(amount),0)/NULLIF(pool.planned_driver_quantity,0),6) INTO effective_rate
    FROM public.cost_entries WHERE cost_pool_id=p_pool_id AND status='active';
  IF effective_rate IS NULL OR effective_rate<=0 THEN RAISE EXCEPTION 'Tariffa standard non disponibile o non positiva.' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('count',count(*),'total_allocated',COALESCE(sum(allocated_amount),0)) INTO previous
    FROM public.management_pool_allocations WHERE pool_id=p_pool_id;
  DELETE FROM public.management_pool_allocations a WHERE a.pool_id=p_pool_id
    AND NOT EXISTS(SELECT 1 FROM public.management_pool_driver_entries d WHERE d.pool_id=a.pool_id AND d.project_id=a.project_id);
  INSERT INTO public.management_pool_allocations(pool_id,project_id,driver_quantity,rate,allocated_amount,currency,generated_at,created_by)
    SELECT pool_id,project_id,driver_quantity,effective_rate,round(driver_quantity*effective_rate,2),pool.currency,now(),auth.uid()
    FROM public.management_pool_driver_entries WHERE pool_id=p_pool_id
    ON CONFLICT(pool_id,project_id) DO UPDATE SET driver_quantity=EXCLUDED.driver_quantity,rate=EXCLUDED.rate,
      allocated_amount=EXCLUDED.allocated_amount,currency=EXCLUDED.currency,generated_at=EXCLUDED.generated_at,created_by=EXCLUDED.created_by;
  SELECT jsonb_build_object('count',count(*),'total_driver_quantity',COALESCE(sum(driver_quantity),0),
    'rate',effective_rate,'total_allocated',COALESCE(sum(allocated_amount),0),'currency',pool.currency) INTO result
    FROM public.management_pool_allocations WHERE pool_id=p_pool_id;
  INSERT INTO public.activity_logs(user_id,entity_type,entity_id,action,old_data,new_data)
    VALUES(auth.uid(),'management_cost_pools',p_pool_id,'generate_pool_allocations',previous,result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_cost_pool_allocations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_cost_pool_allocations(uuid) TO authenticated;

CREATE VIEW public.management_pool_driver_details WITH(security_invoker=true) AS
 SELECT d.*,p.project_code,p.name AS project_name,s.standard_rate,
   CASE WHEN s.standard_rate>0 THEN round(d.driver_quantity*s.standard_rate,2) END AS calculated_amount,
   a.rate AS generated_rate,a.driver_quantity AS generated_quantity,a.allocated_amount,a.generated_at
 FROM public.management_pool_driver_entries d
 JOIN public.projects p ON p.id=d.project_id
 JOIN public.management_cost_pool_summaries s ON s.id=d.pool_id
 LEFT JOIN public.management_pool_allocations a ON a.pool_id=d.pool_id AND a.project_id=d.project_id;

CREATE VIEW public.management_pool_distribution_summaries WITH(security_invoker=true) AS
 SELECT p.id,p.currency,p.actual_cost,COALESCE(d.total_driver_quantity,0) AS total_driver_quantity,
   COALESCE(d.project_count,0) AS project_count,COALESCE(d.calculated_total,0) AS calculated_total,
   COALESCE(a.total_allocated,0) AS total_allocated,COALESCE(a.allocation_count,0) AS allocation_count,
   p.actual_cost-COALESCE(a.total_allocated,0) AS pool_variance
 FROM public.management_cost_pool_summaries p
 LEFT JOIN LATERAL(SELECT sum(driver_quantity) AS total_driver_quantity,count(*) AS project_count,
   sum(round(driver_quantity*p.standard_rate,2)) AS calculated_total FROM public.management_pool_driver_entries WHERE pool_id=p.id) d ON true
 LEFT JOIN LATERAL(SELECT sum(allocated_amount) AS total_allocated,count(*) AS allocation_count
   FROM public.management_pool_allocations WHERE pool_id=p.id) a ON true;
REVOKE ALL ON public.management_pool_driver_details,public.management_pool_distribution_summaries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.management_pool_driver_details,public.management_pool_distribution_summaries TO authenticated;

CREATE FUNCTION public.management_pool_reconciliation_summary()
RETURNS TABLE(currency text,actual_cost numeric,total_allocated numeric,pool_variance numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT currency,sum(actual_cost),sum(total_allocated),sum(pool_variance)
 FROM public.management_pool_distribution_summaries GROUP BY currency ORDER BY currency;
$$;
REVOKE ALL ON FUNCTION public.management_pool_reconciliation_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.management_pool_reconciliation_summary() TO authenticated;

CREATE OR REPLACE VIEW public.project_management_allocations WITH(security_invoker=true) AS
 SELECT a.id,a.project_id,a.cost_entry_id,c.cost_date,c.description,c.source_type,c.source_id,
   COALESCE(a.invoice_id,CASE WHEN c.source_type='invoice' THEN c.source_id END) AS invoice_id,
   COALESCE(a.cost_category_id,c.cost_category_id) AS cost_category_id,
   COALESCE(category.name,'Non classificato') AS category_name,c.supplier_id,supplier.business_name AS supplier_name,c.currency,
   CASE WHEN c.amount<0 THEN -a.allocated_amount ELSE a.allocated_amount END AS economic_amount
 FROM public.management_allocations a
 JOIN public.cost_entries c ON c.id=a.cost_entry_id AND c.status='active'
 JOIN public.projects p ON p.id=a.project_id AND p.archived_at IS NULL
 LEFT JOIN public.management_cost_categories category ON category.id=COALESCE(a.cost_category_id,c.cost_category_id)
 LEFT JOIN public.companies supplier ON supplier.id=c.supplier_id
 WHERE public.app_has_permission('management.read') AND public.app_has_permission('project.read')
 UNION ALL
 SELECT a.id,a.project_id,NULL::uuid,pool.period_end,pool.name,'pool'::text,pool.id,
   NULL::uuid,category.id,COALESCE(category.name,center.name,pool.name),NULL::uuid,NULL::text,a.currency,a.allocated_amount
 FROM public.management_pool_allocations a
 JOIN public.management_cost_pools pool ON pool.id=a.pool_id
 JOIN public.management_cost_centers center ON center.id=pool.cost_center_id
 LEFT JOIN public.management_cost_categories category ON category.code=center.code
 JOIN public.projects p ON p.id=a.project_id AND p.archived_at IS NULL
 WHERE public.app_has_permission('management.read') AND public.app_has_permission('project.read');
-- Existing project summary now consumes both sources; primary reconciliation is unchanged.
COMMIT;
