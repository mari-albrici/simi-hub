BEGIN;
CREATE TABLE public.project_management_forecasts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 version_number integer NOT NULL CHECK(version_number>0),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','superseded')),
 forecast_date date NOT NULL DEFAULT current_date,currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),notes text CHECK(length(notes)<=2000),
 approved_at timestamptz,created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,version_number)
);
CREATE UNIQUE INDEX project_management_forecast_one_approved ON public.project_management_forecasts(project_id) WHERE status='approved';
CREATE TABLE public.project_management_forecast_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),forecast_id uuid NOT NULL REFERENCES public.project_management_forecasts(id) ON DELETE CASCADE,
 cost_category_id uuid NOT NULL REFERENCES public.management_cost_categories(id),
 cost_to_complete numeric(14,2) NOT NULL DEFAULT 0 CHECK(cost_to_complete>=0 AND cost_to_complete<>'NaN'::numeric),notes text CHECK(length(notes)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(forecast_id,cost_category_id)
);
ALTER TABLE public.project_management_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_management_forecast_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_management_forecasts,public.project_management_forecast_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_management_forecasts,public.project_management_forecast_lines TO authenticated;
CREATE POLICY forecasts_read ON public.project_management_forecasts FOR SELECT TO authenticated USING(
 public.app_has_permission('management.read') AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id));
CREATE POLICY forecast_lines_read ON public.project_management_forecast_lines FOR SELECT TO authenticated USING(
 public.app_has_permission('management.read') AND EXISTS(SELECT 1 FROM public.project_management_forecasts b WHERE b.id=forecast_id));
-- All writes use permission-checked RPCs, with the same project lock for header,
-- lines, cloning and approval. No client can bypass read-only version states.
CREATE TRIGGER forecasts_updated BEFORE UPDATE ON public.project_management_forecasts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER forecast_lines_updated BEFORE UPDATE ON public.project_management_forecast_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_forecasts AFTER INSERT OR UPDATE ON public.project_management_forecasts FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();

CREATE FUNCTION public.create_project_management_forecast(p_project uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; reference public.project_management_budgets;
BEGIN
 PERFORM public.lock_management_budget_project(p_project);
 IF EXISTS(SELECT 1 FROM public.project_management_forecasts WHERE project_id=p_project) THEN RAISE EXCEPTION 'Esiste già un forecast: crea una revisione.' USING ERRCODE='22023'; END IF;
 SELECT * INTO reference FROM public.project_management_budgets WHERE project_id=p_project AND status='approved';
 INSERT INTO public.project_management_forecasts(project_id,version_number,name,currency,created_by)
 VALUES(p_project,1,'Forecast iniziale',COALESCE(reference.currency,'EUR'),auth.uid()) RETURNING id INTO result;
 INSERT INTO public.project_management_forecast_lines(forecast_id,cost_category_id,cost_to_complete)
 SELECT result,cost_category_id,0 FROM public.project_management_budget_lines WHERE budget_id=reference.id;
 RETURN result;
END; $$;
CREATE FUNCTION public.update_project_management_forecast(p_id uuid,p_name text,p_forecast_date date,p_currency text,p_notes text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE forecast public.project_management_forecasts;
BEGIN
 SELECT * INTO forecast FROM public.project_management_forecasts WHERE id=p_id;
 PERFORM public.lock_management_budget_project(forecast.project_id);
 SELECT * INTO forecast FROM public.project_management_forecasts WHERE id=p_id;
 IF forecast.status<>'draft' THEN RAISE EXCEPTION 'Il forecast è in sola lettura: crea una revisione.' USING ERRCODE='22023'; END IF;
 IF p_forecast_date IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200 OR length(p_notes)>2000 OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
 RAISE EXCEPTION 'Dati forecast non validi.' USING ERRCODE='22023'; END IF;
 UPDATE public.project_management_forecasts SET name=btrim(p_name),forecast_date=p_forecast_date,currency=p_currency,notes=NULLIF(btrim(p_notes),'') WHERE id=p_id;
 RETURN p_id;
END; $$;
CREATE FUNCTION public.upsert_project_management_forecast_line(p_forecast uuid,p_category uuid,p_cost_to_complete numeric,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE forecast public.project_management_forecasts; previous public.project_management_forecast_lines; result public.project_management_forecast_lines; category_active boolean;
BEGIN
 SELECT * INTO forecast FROM public.project_management_forecasts WHERE id=p_forecast;
 PERFORM public.lock_management_budget_project(forecast.project_id);
 SELECT * INTO forecast FROM public.project_management_forecasts WHERE id=p_forecast;
 IF forecast.status<>'draft' THEN RAISE EXCEPTION 'Il forecast è in sola lettura: crea una revisione.' USING ERRCODE='22023'; END IF;
 IF p_cost_to_complete IS NULL OR p_cost_to_complete<0 OR p_cost_to_complete>=1e12 OR p_cost_to_complete='NaN'::numeric OR p_cost_to_complete<>round(p_cost_to_complete,2)
 OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Importo o dati riga non validi.' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM public.project_management_forecast_lines WHERE forecast_id=p_forecast AND cost_category_id=p_category;
 IF NOT FOUND THEN
  SELECT is_active INTO category_active FROM public.management_cost_categories WHERE id=p_category FOR SHARE;
  IF category_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'La categoria deve essere attiva per una nuova riga.' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO public.project_management_forecast_lines(forecast_id,cost_category_id,cost_to_complete,notes)
 VALUES(p_forecast,p_category,p_cost_to_complete,NULLIF(btrim(p_notes),''))
 ON CONFLICT(forecast_id,cost_category_id) DO UPDATE SET cost_to_complete=EXCLUDED.cost_to_complete,notes=EXCLUDED.notes RETURNING * INTO result;
 INSERT INTO public.activity_logs(user_id,entity_type,entity_id,action,old_data,new_data)
 VALUES(auth.uid(),'project_management_forecast_lines',result.id,CASE WHEN previous.id IS NULL THEN 'insert' ELSE 'update' END,
 CASE WHEN previous.id IS NULL THEN NULL ELSE to_jsonb(previous) END,to_jsonb(result));
 RETURN result.id;
END; $$;
CREATE FUNCTION public.approve_project_management_forecast(p_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE forecast public.project_management_forecasts;
BEGIN
 SELECT * INTO forecast FROM public.project_management_forecasts WHERE id=p_id;
 PERFORM public.lock_management_budget_project(forecast.project_id);
 SELECT * INTO forecast FROM public.project_management_forecasts WHERE id=p_id;
 IF forecast.status<>'draft' THEN RAISE EXCEPTION 'Solo una bozza può essere approvata.' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_management_forecast_lines WHERE forecast_id=p_id) THEN RAISE EXCEPTION 'Inserisci almeno una riga prima di approvare.' USING ERRCODE='22023'; END IF;
 UPDATE public.project_management_forecasts SET status='superseded' WHERE project_id=forecast.project_id AND status='approved';
 UPDATE public.project_management_forecasts SET status='approved',approved_at=now() WHERE id=p_id;
 RETURN p_id;
END; $$;
CREATE FUNCTION public.clone_project_management_forecast(p_source uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE forecast public.project_management_forecasts; next_version integer; result uuid;
BEGIN
 SELECT * INTO forecast FROM public.project_management_forecasts WHERE id=p_source;
 PERFORM public.lock_management_budget_project(forecast.project_id);
 SELECT * INTO forecast FROM public.project_management_forecasts WHERE id=p_source;
 SELECT max(version_number)+1 INTO next_version FROM public.project_management_forecasts WHERE project_id=forecast.project_id;
 INSERT INTO public.project_management_forecasts(project_id,version_number,name,forecast_date,currency,notes,created_by)
 VALUES(forecast.project_id,next_version,'Revisione forecast ' || (next_version-1),current_date,forecast.currency,forecast.notes,auth.uid()) RETURNING id INTO result;
 INSERT INTO public.project_management_forecast_lines(forecast_id,cost_category_id,cost_to_complete,notes)
 SELECT result,cost_category_id,cost_to_complete,notes FROM public.project_management_forecast_lines WHERE forecast_id=p_source;
 INSERT INTO public.activity_logs(user_id,entity_type,entity_id,action,new_data)
 VALUES(auth.uid(),'project_management_forecasts',result,'clone_forecast',jsonb_build_object('source_forecast_id',p_source,'version_number',next_version));
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.create_project_management_forecast(uuid),public.update_project_management_forecast(uuid,text,date,text,text),
 public.upsert_project_management_forecast_line(uuid,uuid,numeric,text),
 public.approve_project_management_forecast(uuid),public.clone_project_management_forecast(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_project_management_forecast(uuid),public.update_project_management_forecast(uuid,text,date,text,text),
 public.upsert_project_management_forecast_line(uuid,uuid,numeric,text),
 public.approve_project_management_forecast(uuid),public.clone_project_management_forecast(uuid) TO authenticated;

CREATE FUNCTION public.project_management_actual_categories(p_project uuid)
RETURNS TABLE(category_id uuid,category_name text,currency text,amount numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT COALESCE(a."categoryId",mapped.id) AS category_id,a."categoryName" AS category_name,a.currency,a."totalCost" AS amount
  FROM (SELECT id AS project_id FROM public.projects WHERE id=p_project AND public.app_has_permission('management.read')) b CROSS JOIN LATERAL jsonb_to_recordset(public.project_management_cost_summary(b.project_id)->'byCategory')
    AS a("categoryId" uuid,"categoryName" text,currency text,"totalCost" numeric)
  -- Secondary sources currently have no category FK. Match their existing stable codes.
  LEFT JOIN public.management_cost_categories mapped ON a."categoryId" IS NULL AND mapped.code=CASE a."categoryName"
    WHEN 'Manodopera' THEN 'labor' WHEN 'Attrezzature' THEN 'equipment' WHEN 'Consumabili' THEN 'consumables' END;
$$;
REVOKE ALL ON FUNCTION public.project_management_actual_categories(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.project_management_actual_categories(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.project_management_budget_comparison(p_budget uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH budget AS (SELECT * FROM public.project_management_budgets WHERE id=p_budget),
 actual_rows AS (
  SELECT a.* FROM budget b CROSS JOIN LATERAL public.project_management_actual_categories(b.project_id) a
 ), combined AS (
  SELECT l.cost_category_id AS category_id,c.name AS category_name,b.currency,l.amount AS budget_amount,0::numeric AS actual_cost
  FROM budget b JOIN public.project_management_budget_lines l ON l.budget_id=b.id JOIN public.management_cost_categories c ON c.id=l.cost_category_id
  UNION ALL
  SELECT a.category_id,COALESCE(c.name,a.category_name),a.currency,0::numeric,a.amount FROM actual_rows a
  LEFT JOIN public.management_cost_categories c ON c.id=a.category_id
 ), grouped AS (
  SELECT category_id,category_name,currency,sum(budget_amount) AS budget_amount,sum(actual_cost) AS actual_cost
  FROM combined GROUP BY category_id,category_name,currency
 ), rows AS (
  SELECT *,actual_cost-budget_amount AS variance,
   CASE WHEN budget_amount>0 THEN (actual_cost-budget_amount)/budget_amount*100 ELSE NULL END AS variance_percent FROM grouped
 ), totals AS (
  SELECT currency,sum(budget_amount) AS budget_amount,sum(actual_cost) AS actual_cost,sum(variance) AS variance FROM rows GROUP BY currency
 ) SELECT jsonb_build_object('rows',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY currency,category_name) FROM rows r),'[]'::jsonb),
  'totals',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY currency) FROM totals t),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.project_management_budget_comparison(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.project_management_budget_comparison(uuid) TO authenticated;
-- Both comparisons consume the exact same authoritative actual category adapter.
-- Forecast dates describe the estimate, not an accounting cut-off or a snapshot.
CREATE FUNCTION public.project_management_forecast_comparison(p_project uuid,p_forecast uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH project AS (
  SELECT id FROM public.projects WHERE id=p_project AND public.app_has_permission('management.read')
 ), forecast AS (
  SELECT f.* FROM public.project_management_forecasts f JOIN project p ON p.id=f.project_id WHERE f.id=p_forecast
 ), budget AS (
  SELECT b.* FROM public.project_management_budgets b JOIN project p ON p.id=b.project_id WHERE b.status='approved'
 ), combined AS (
  SELECT a.category_id,COALESCE(c.name,a.category_name) AS category_name,a.currency,0::numeric AS budget_amount,a.amount AS actual_cost,0::numeric AS cost_to_complete
  FROM project p CROSS JOIN LATERAL public.project_management_actual_categories(p.id) a
  LEFT JOIN public.management_cost_categories c ON c.id=a.category_id
  UNION ALL
  SELECT l.cost_category_id,c.name,b.currency,l.amount,0,0 FROM budget b
  JOIN public.project_management_budget_lines l ON l.budget_id=b.id JOIN public.management_cost_categories c ON c.id=l.cost_category_id
  UNION ALL
  SELECT l.cost_category_id,c.name,f.currency,0,0,l.cost_to_complete FROM forecast f
  JOIN public.project_management_forecast_lines l ON l.forecast_id=f.id JOIN public.management_cost_categories c ON c.id=l.cost_category_id
 ), grouped AS (
  SELECT category_id,category_name,currency,sum(budget_amount) AS budget_amount,sum(actual_cost) AS actual_cost,sum(cost_to_complete) AS cost_to_complete
  FROM combined GROUP BY category_id,category_name,currency
 ), rows AS (
  SELECT *,actual_cost+cost_to_complete AS estimate_at_completion,
   CASE WHEN EXISTS(SELECT 1 FROM budget) THEN actual_cost+cost_to_complete-budget_amount END AS forecast_variance,
   CASE WHEN budget_amount>0 THEN (actual_cost+cost_to_complete-budget_amount)/budget_amount*100 END AS forecast_variance_percent FROM grouped
 ), sums AS (
  SELECT currency,sum(budget_amount) AS budget_amount,sum(actual_cost) AS actual_cost,sum(cost_to_complete) AS cost_to_complete
  FROM (SELECT currency,budget_amount,actual_cost,cost_to_complete FROM grouped
    UNION ALL SELECT COALESCE((SELECT currency FROM forecast),(SELECT currency FROM budget),'EUR'),0,0,0 FROM project) r GROUP BY currency
 ), totals AS (
  SELECT *,actual_cost+cost_to_complete AS estimate_at_completion,
   CASE WHEN EXISTS(SELECT 1 FROM budget) THEN actual_cost+cost_to_complete-budget_amount END AS forecast_variance,
   CASE WHEN budget_amount>0 THEN (actual_cost+cost_to_complete-budget_amount)/budget_amount*100 END AS forecast_variance_percent FROM sums
 ) SELECT jsonb_build_object('budget_id',(SELECT id FROM budget),'budget_name',(SELECT name FROM budget),
  'rows',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY currency,category_name) FROM rows r),'[]'::jsonb),
  'totals',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY currency) FROM totals t),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.project_management_forecast_comparison(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.project_management_forecast_comparison(uuid,uuid) TO authenticated;
CREATE VIEW public.project_management_forecast_totals WITH(security_invoker=true) AS
 SELECT f.*,public.project_management_forecast_comparison(f.project_id,f.id)->'totals' AS totals
 FROM public.project_management_forecasts f;
REVOKE ALL ON public.project_management_forecast_totals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_management_forecast_totals TO authenticated;
COMMIT;
