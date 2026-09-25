BEGIN;
CREATE TABLE public.employee_management_rates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
 valid_from date NOT NULL,valid_to date CHECK(valid_to>=valid_from),
 hourly_cost numeric(14,6) NOT NULL CHECK(hourly_cost>=0 AND hourly_cost<>'NaN'::numeric),
 currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),notes text CHECK(length(notes)<=2000),
 created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_management_rates_employee_idx ON public.employee_management_rates(employee_id,valid_from);
CREATE TABLE public.project_labor_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid NOT NULL REFERENCES public.employees(id),
 project_id uuid NOT NULL REFERENCES public.projects(id),work_date date NOT NULL,
 hours numeric(8,2) NOT NULL CHECK(hours>0 AND hours<>'NaN'::numeric),
 hour_type text NOT NULL DEFAULT 'ordinary' CHECK(hour_type IN ('ordinary','overtime','travel','other')),
 hourly_cost_snapshot numeric(14,6) NOT NULL CHECK(hourly_cost_snapshot>=0 AND hourly_cost_snapshot<>'NaN'::numeric),
 amount numeric(14,2) NOT NULL CHECK(amount>=0 AND amount<>'NaN'::numeric),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),notes text CHECK(length(notes)<=2000),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
 created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_labor_entries_project_idx ON public.project_labor_entries(project_id,work_date);
CREATE INDEX project_labor_entries_period_idx ON public.project_labor_entries(work_date) WHERE status='active';
ALTER TABLE public.employee_management_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_labor_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_management_rates,public.project_labor_entries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.employee_management_rates,public.project_labor_entries TO authenticated;
CREATE POLICY management_rates_read ON public.employee_management_rates FOR SELECT TO authenticated USING(public.app_has_permission('employee.hr.read'));
CREATE POLICY labor_entries_read ON public.project_labor_entries FOR SELECT TO authenticated USING(public.app_has_permission('management.read'));
-- Writes exclusively through RPC: HR rates and management hours have distinct permissions.
CREATE TRIGGER management_rates_updated BEFORE UPDATE ON public.employee_management_rates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER labor_entries_updated BEFORE UPDATE ON public.project_labor_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_management_rates AFTER INSERT OR UPDATE ON public.employee_management_rates FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_labor_entries AFTER INSERT OR UPDATE ON public.project_labor_entries FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();

CREATE FUNCTION public.save_employee_management_rate(p_id uuid,p_employee uuid,p_from date,p_to date,p_cost numeric,p_currency text,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF NOT public.app_has_permission('employee.hr.read') OR NOT public.app_has_permission('employee.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Management rates require READ COMMITTED' USING ERRCODE='40001'; END IF;
 IF p_from IS NULL OR p_to<p_from OR p_cost IS NULL OR p_cost<0 OR p_cost>=1e8 OR p_cost='NaN'::numeric OR p_cost<>round(p_cost,6)
 OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Tariffa o periodo non valido.' USING ERRCODE='22023'; END IF;
 PERFORM id FROM public.employees WHERE id=p_employee FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dipendente non disponibile.' USING ERRCODE='22023'; END IF;
 IF p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.employee_management_rates WHERE id=p_id AND employee_id=p_employee) THEN RAISE EXCEPTION 'Tariffa non trovata.' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.employee_management_rates WHERE employee_id=p_employee AND id IS DISTINCT FROM p_id
 AND daterange(valid_from,valid_to,'[]') && daterange(p_from,p_to,'[]')) THEN RAISE EXCEPTION 'Il periodo si sovrappone a una tariffa esistente.' USING ERRCODE='22023'; END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.employee_management_rates(employee_id,valid_from,valid_to,hourly_cost,currency,notes,created_by)
  VALUES(p_employee,p_from,p_to,p_cost,p_currency,NULLIF(btrim(p_notes),''),auth.uid()) RETURNING id INTO result;
 ELSE
  UPDATE public.employee_management_rates SET valid_from=p_from,valid_to=p_to,hourly_cost=p_cost,currency=p_currency,notes=NULLIF(btrim(p_notes),'') WHERE id=p_id RETURNING id INTO result;
 END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.save_employee_management_rate(uuid,uuid,date,date,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_employee_management_rate(uuid,uuid,date,date,numeric,text,text) TO authenticated;

-- Minimal names-only directory for management. Employee/HR table policies are unchanged.
CREATE FUNCTION public.management_labor_employees() RETURNS TABLE(employee_id uuid,employee_name text,is_available boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT id,last_name || ' ' || first_name,archived_at IS NULL AND status<>'archived'
 FROM public.employees WHERE public.app_has_permission('management.read');
$$;
REVOKE ALL ON FUNCTION public.management_labor_employees() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.management_labor_employees() TO authenticated;

CREATE FUNCTION public.save_project_labor_entry(p_id uuid,p_employee uuid,p_project uuid,p_date date,p_hours numeric,p_type text,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.project_labor_entries; applied_rate numeric(14,6); applied_currency text; result uuid;
BEGIN
 IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Labor entries require READ COMMITTED' USING ERRCODE='40001'; END IF;
 IF p_date IS NULL OR p_hours IS NULL OR p_hours<=0 OR p_hours>=1e6 OR p_hours='NaN'::numeric OR p_hours<>round(p_hours,2)
 OR p_type IS NULL OR p_type NOT IN ('ordinary','overtime','travel','other') OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Ore o data non valide.' USING ERRCODE='22023'; END IF;
 -- Employee lock serializes rate selection with HR writes. Rate rows never update historical hours.
 PERFORM id FROM public.employees WHERE id=p_employee AND archived_at IS NULL AND status<>'archived' FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dipendente non disponibile.' USING ERRCODE='22023'; END IF;
 PERFORM id FROM public.projects WHERE id=p_project AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non disponibile.' USING ERRCODE='22023'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO previous FROM public.project_labor_entries WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR previous.status='cancelled' THEN RAISE EXCEPTION 'Riga ore non trovata o annullata.' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_id IS NOT NULL AND (previous.employee_id,previous.work_date) IS NOT DISTINCT FROM (p_employee,p_date) THEN
  applied_rate:=previous.hourly_cost_snapshot; applied_currency:=previous.currency;
 ELSE
  SELECT hourly_cost,currency INTO applied_rate,applied_currency FROM public.employee_management_rates
   WHERE employee_id=p_employee AND valid_from<=p_date AND (valid_to IS NULL OR valid_to>=p_date);
  IF NOT FOUND THEN RAISE EXCEPTION 'Nessun costo gestionale valido per il dipendente alla data selezionata.' USING ERRCODE='22023'; END IF;
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.project_labor_entries(employee_id,project_id,work_date,hours,hour_type,hourly_cost_snapshot,amount,currency,notes,created_by)
   VALUES(p_employee,p_project,p_date,p_hours,p_type,applied_rate,round(p_hours*applied_rate,2),applied_currency,NULLIF(btrim(p_notes),''),auth.uid()) RETURNING id INTO result;
 ELSE
  UPDATE public.project_labor_entries SET employee_id=p_employee,project_id=p_project,work_date=p_date,hours=p_hours,hour_type=p_type,
   hourly_cost_snapshot=applied_rate,amount=round(p_hours*applied_rate,2),currency=applied_currency,notes=NULLIF(btrim(p_notes),'') WHERE id=p_id RETURNING id INTO result;
 END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.save_project_labor_entry(uuid,uuid,uuid,date,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_project_labor_entry(uuid,uuid,uuid,date,numeric,text,text) TO authenticated;
CREATE FUNCTION public.cancel_project_labor_entry(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
 UPDATE public.project_labor_entries SET status='cancelled' WHERE id=p_id AND status='active' RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'Riga ore non trovata o annullata.' USING ERRCODE='22023'; END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.cancel_project_labor_entry(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_project_labor_entry(uuid) TO authenticated;

CREATE VIEW public.project_labor_details WITH(security_invoker=true) AS
 SELECT l.*,e.employee_name FROM public.project_labor_entries l JOIN public.management_labor_employees() e ON e.employee_id=l.employee_id;
REVOKE ALL ON public.project_labor_details FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_labor_details TO authenticated;
CREATE FUNCTION public.management_labor_summary(p_project uuid DEFAULT NULL)
RETURNS TABLE(currency text,total_hours numeric,total_cost numeric) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT currency,sum(hours),sum(amount) FROM public.project_labor_entries WHERE status='active' AND (p_project IS NULL OR project_id=p_project) GROUP BY currency ORDER BY currency;
$$;
REVOKE ALL ON FUNCTION public.management_labor_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.management_labor_summary(uuid) TO authenticated;

ALTER TABLE public.management_pool_driver_entries DROP CONSTRAINT management_pool_driver_entries_source_type_check;
ALTER TABLE public.management_pool_driver_entries ADD CONSTRAINT management_pool_driver_entries_source_type_check CHECK(source_type IN ('manual','labor_entries'));
-- Invoker trigger: clients cannot forge or manually edit an imported driver. The
-- checked SECURITY DEFINER import RPC runs as its owner, with no spoofable flags.
CREATE FUNCTION public.protect_labor_pool_driver() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
  IF NEW.source_type<>'manual' OR (TG_OP='UPDATE' AND OLD.source_type='labor_entries') THEN
   RAISE EXCEPTION 'Il driver da ore registrate si aggiorna dal calcolo delle ore.' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_labor_pool_driver() FROM PUBLIC;
CREATE TRIGGER pool_driver_source_check BEFORE INSERT OR UPDATE ON public.management_pool_driver_entries FOR EACH ROW EXECUTE FUNCTION public.protect_labor_pool_driver();
CREATE FUNCTION public.calculate_pool_labor_drivers(p_pool_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pool public.management_cost_pools; affected integer;
BEGIN
 IF NOT public.app_has_permission('management.update') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Pool import requires READ COMMITTED' USING ERRCODE='40001'; END IF;
 SELECT * INTO pool FROM public.management_cost_pools WHERE id=p_pool_id FOR NO KEY UPDATE;
 IF NOT FOUND OR pool.status='closed' OR pool.driver_type<>'labor_hours' THEN RAISE EXCEPTION 'Serve un pool ore non chiuso.' USING ERRCODE='22023'; END IF;
 -- Retain imported projects with zero hours after cancellations. Deleting their
 -- drivers would reset allocations via the existing trigger, which is forbidden here.
 WITH totals AS (
  SELECT l.project_id,sum(l.hours) AS quantity FROM public.project_labor_entries l JOIN public.projects p ON p.id=l.project_id
  WHERE l.status='active' AND l.work_date BETWEEN pool.period_start AND pool.period_end AND p.archived_at IS NULL GROUP BY l.project_id
 ), updated AS (
  UPDATE public.management_pool_driver_entries d SET driver_quantity=COALESCE((SELECT quantity FROM totals t WHERE t.project_id=d.project_id),0),
   period_start=pool.period_start,period_end=pool.period_end
  WHERE d.pool_id=p_pool_id AND d.source_type='labor_entries' RETURNING id
 ), inserted AS (
  INSERT INTO public.management_pool_driver_entries(pool_id,project_id,driver_quantity,source_type,period_start,period_end)
  SELECT p_pool_id,t.project_id,t.quantity,'labor_entries',pool.period_start,pool.period_end FROM totals t
  WHERE NOT EXISTS(SELECT 1 FROM public.management_pool_driver_entries d WHERE d.pool_id=p_pool_id AND d.project_id=t.project_id)
  RETURNING id
 ) SELECT (SELECT count(*) FROM updated)+(SELECT count(*) FROM inserted) INTO affected;
 INSERT INTO public.activity_logs(user_id,entity_type,entity_id,action,new_data)
 VALUES(auth.uid(),'management_cost_pools',p_pool_id,'calculate_labor_drivers',jsonb_build_object('updated_projects',affected,'period_start',pool.period_start,'period_end',pool.period_end));
 RETURN affected;
END; $$;
REVOKE ALL ON FUNCTION public.calculate_pool_labor_drivers(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calculate_pool_labor_drivers(uuid) TO authenticated;
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
 WHERE public.app_has_permission('management.read') AND public.app_has_permission('project.read')
 UNION ALL
 SELECT u.id,u.project_id,NULL::uuid,u.start_date,asset.asset_code || ' — ' || asset.name,'asset'::text,asset.id,
   NULL::uuid,NULL::uuid,'Attrezzature'::text,NULL::uuid,NULL::text,u.currency,u.amount
 FROM public.management_asset_usage u
 JOIN public.management_assets asset ON asset.id=u.asset_id
 JOIN public.projects p ON p.id=u.project_id AND p.archived_at IS NULL
 WHERE u.status IN ('active','closed') AND public.app_has_permission('management.read') AND public.app_has_permission('project.read')
 UNION ALL
 SELECT m.id,m.project_id,NULL::uuid,m.movement_date,i.item_code || ' — ' || i.name,'consumable'::text,i.id,
 NULL::uuid,NULL::uuid,'Consumabili'::text,NULL::uuid,NULL::text,m.currency,m.amount
 FROM public.management_consumable_movements m JOIN public.management_consumable_items i ON i.id=m.item_id
 JOIN public.projects p ON p.id=m.project_id AND p.archived_at IS NULL
 WHERE m.movement_type='consumption' AND public.app_has_permission('management.read') AND public.app_has_permission('project.read')
 UNION ALL
 SELECT l.id,l.project_id,NULL::uuid,l.work_date,l.employee_name,'labor'::text,l.employee_id,
 NULL::uuid,NULL::uuid,'Manodopera'::text,NULL::uuid,NULL::text,l.currency,l.amount
 FROM public.project_labor_details l JOIN public.projects p ON p.id=l.project_id AND p.archived_at IS NULL
 WHERE l.status='active' AND public.app_has_permission('management.read') AND public.app_has_permission('project.read');
COMMIT;
