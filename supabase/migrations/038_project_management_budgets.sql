BEGIN;
CREATE TABLE public.project_management_budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 version_number integer NOT NULL CHECK(version_number>0),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','superseded')),
 valid_from date,currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),notes text CHECK(length(notes)<=2000),
 approved_at timestamptz,created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,version_number)
);
CREATE UNIQUE INDEX project_management_budget_one_approved ON public.project_management_budgets(project_id) WHERE status='approved';
CREATE TABLE public.project_management_budget_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),budget_id uuid NOT NULL REFERENCES public.project_management_budgets(id) ON DELETE CASCADE,
 cost_category_id uuid NOT NULL REFERENCES public.management_cost_categories(id),description text CHECK(length(description)<=2000),
 amount numeric(14,2) NOT NULL CHECK(amount>=0 AND amount<>'NaN'::numeric),notes text CHECK(length(notes)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(budget_id,cost_category_id)
);
ALTER TABLE public.project_management_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_management_budget_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_management_budgets,public.project_management_budget_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_management_budgets,public.project_management_budget_lines TO authenticated;
CREATE POLICY budgets_read ON public.project_management_budgets FOR SELECT TO authenticated USING(
 public.app_has_permission('management.read') AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id));
CREATE POLICY budget_lines_read ON public.project_management_budget_lines FOR SELECT TO authenticated USING(
 public.app_has_permission('management.read') AND EXISTS(SELECT 1 FROM public.project_management_budgets b WHERE b.id=budget_id));
-- All writes use permission-checked RPCs, with the same project lock for header,
-- lines, cloning and approval. No client can bypass read-only version states.
CREATE TRIGGER budgets_updated BEFORE UPDATE ON public.project_management_budgets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER budget_lines_updated BEFORE UPDATE ON public.project_management_budget_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_budgets AFTER INSERT OR UPDATE ON public.project_management_budgets FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();

CREATE FUNCTION public.lock_management_budget_project(p_project uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT public.app_has_permission('management.update') OR NOT public.app_has_permission('project.read') THEN RAISE EXCEPTION 'Accesso negato.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Budgets require READ COMMITTED' USING ERRCODE='40001'; END IF;
 PERFORM id FROM public.projects WHERE id=p_project AND archived_at IS NULL FOR NO KEY UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non disponibile.' USING ERRCODE='22023'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.lock_management_budget_project(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.create_project_management_budget(p_project uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 PERFORM public.lock_management_budget_project(p_project);
 IF EXISTS(SELECT 1 FROM public.project_management_budgets WHERE project_id=p_project) THEN RAISE EXCEPTION 'Esiste già un budget: crea una revisione.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.project_management_budgets(project_id,version_number,name,created_by)
 VALUES(p_project,1,'Budget iniziale',auth.uid()) RETURNING id INTO result;
 RETURN result;
END; $$;
CREATE FUNCTION public.update_project_management_budget(p_id uuid,p_name text,p_valid_from date,p_currency text,p_notes text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE budget public.project_management_budgets;
BEGIN
 SELECT * INTO budget FROM public.project_management_budgets WHERE id=p_id;
 PERFORM public.lock_management_budget_project(budget.project_id);
 SELECT * INTO budget FROM public.project_management_budgets WHERE id=p_id;
 IF budget.status<>'draft' THEN RAISE EXCEPTION 'Il budget è in sola lettura: crea una revisione.' USING ERRCODE='22023'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200 OR length(p_notes)>2000 OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
 RAISE EXCEPTION 'Dati budget non validi.' USING ERRCODE='22023'; END IF;
 UPDATE public.project_management_budgets SET name=btrim(p_name),valid_from=p_valid_from,currency=p_currency,notes=NULLIF(btrim(p_notes),'') WHERE id=p_id;
 RETURN p_id;
END; $$;
CREATE FUNCTION public.upsert_project_management_budget_line(p_budget uuid,p_category uuid,p_description text,p_amount numeric,p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE budget public.project_management_budgets; previous public.project_management_budget_lines; result public.project_management_budget_lines; category_active boolean;
BEGIN
 SELECT * INTO budget FROM public.project_management_budgets WHERE id=p_budget;
 PERFORM public.lock_management_budget_project(budget.project_id);
 SELECT * INTO budget FROM public.project_management_budgets WHERE id=p_budget;
 IF budget.status<>'draft' THEN RAISE EXCEPTION 'Il budget è in sola lettura: crea una revisione.' USING ERRCODE='22023'; END IF;
 IF p_amount IS NULL OR p_amount<0 OR p_amount>=1e12 OR p_amount='NaN'::numeric OR p_amount<>round(p_amount,2)
 OR length(p_description)>2000 OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Importo o dati riga non validi.' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM public.project_management_budget_lines WHERE budget_id=p_budget AND cost_category_id=p_category;
 IF NOT FOUND THEN
  SELECT is_active INTO category_active FROM public.management_cost_categories WHERE id=p_category FOR SHARE;
  IF category_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'La categoria deve essere attiva per una nuova riga.' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO public.project_management_budget_lines(budget_id,cost_category_id,description,amount,notes)
 VALUES(p_budget,p_category,NULLIF(btrim(p_description),''),p_amount,NULLIF(btrim(p_notes),''))
 ON CONFLICT(budget_id,cost_category_id) DO UPDATE SET description=EXCLUDED.description,amount=EXCLUDED.amount,notes=EXCLUDED.notes RETURNING * INTO result;
 INSERT INTO public.activity_logs(user_id,entity_type,entity_id,action,old_data,new_data)
 VALUES(auth.uid(),'project_management_budget_lines',result.id,CASE WHEN previous.id IS NULL THEN 'insert' ELSE 'update' END,
 CASE WHEN previous.id IS NULL THEN NULL ELSE to_jsonb(previous) END,to_jsonb(result));
 RETURN result.id;
END; $$;
CREATE FUNCTION public.delete_project_management_budget_line(p_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE line public.project_management_budget_lines; budget public.project_management_budgets;
BEGIN
 SELECT * INTO line FROM public.project_management_budget_lines WHERE id=p_id;
 SELECT * INTO budget FROM public.project_management_budgets WHERE id=line.budget_id;
 PERFORM public.lock_management_budget_project(budget.project_id);
 SELECT * INTO budget FROM public.project_management_budgets WHERE id=line.budget_id;
 IF budget.status<>'draft' THEN RAISE EXCEPTION 'Il budget è in sola lettura: crea una revisione.' USING ERRCODE='22023'; END IF;
 DELETE FROM public.project_management_budget_lines WHERE id=p_id RETURNING * INTO line;
 IF NOT FOUND THEN RAISE EXCEPTION 'Riga budget non trovata.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.activity_logs(user_id,entity_type,entity_id,action,old_data) VALUES(auth.uid(),'project_management_budget_lines',p_id,'delete',to_jsonb(line));
 RETURN p_id;
END; $$;
CREATE FUNCTION public.approve_project_management_budget(p_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE budget public.project_management_budgets;
BEGIN
 SELECT * INTO budget FROM public.project_management_budgets WHERE id=p_id;
 PERFORM public.lock_management_budget_project(budget.project_id);
 SELECT * INTO budget FROM public.project_management_budgets WHERE id=p_id;
 IF budget.status<>'draft' THEN RAISE EXCEPTION 'Solo una bozza può essere approvata.' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_management_budget_lines WHERE budget_id=p_id) THEN RAISE EXCEPTION 'Inserisci almeno una riga prima di approvare.' USING ERRCODE='22023'; END IF;
 UPDATE public.project_management_budgets SET status='superseded' WHERE project_id=budget.project_id AND status='approved';
 UPDATE public.project_management_budgets SET status='approved',approved_at=now() WHERE id=p_id;
 RETURN p_id;
END; $$;
CREATE FUNCTION public.clone_project_management_budget(p_source uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE budget public.project_management_budgets; next_version integer; result uuid;
BEGIN
 SELECT * INTO budget FROM public.project_management_budgets WHERE id=p_source;
 PERFORM public.lock_management_budget_project(budget.project_id);
 SELECT * INTO budget FROM public.project_management_budgets WHERE id=p_source;
 SELECT max(version_number)+1 INTO next_version FROM public.project_management_budgets WHERE project_id=budget.project_id;
 INSERT INTO public.project_management_budgets(project_id,version_number,name,valid_from,currency,notes,created_by)
 VALUES(budget.project_id,next_version,'Revisione ' || (next_version-1),budget.valid_from,budget.currency,budget.notes,auth.uid()) RETURNING id INTO result;
 INSERT INTO public.project_management_budget_lines(budget_id,cost_category_id,description,amount,notes)
 SELECT result,cost_category_id,description,amount,notes FROM public.project_management_budget_lines WHERE budget_id=p_source;
 INSERT INTO public.activity_logs(user_id,entity_type,entity_id,action,new_data)
 VALUES(auth.uid(),'project_management_budgets',result,'clone_budget',jsonb_build_object('source_budget_id',p_source,'version_number',next_version));
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.create_project_management_budget(uuid),public.update_project_management_budget(uuid,text,date,text,text),
 public.upsert_project_management_budget_line(uuid,uuid,text,numeric,text),public.delete_project_management_budget_line(uuid),
 public.approve_project_management_budget(uuid),public.clone_project_management_budget(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_project_management_budget(uuid),public.update_project_management_budget(uuid,text,date,text,text),
 public.upsert_project_management_budget_line(uuid,uuid,text,numeric,text),public.delete_project_management_budget_line(uuid),
 public.approve_project_management_budget(uuid),public.clone_project_management_budget(uuid) TO authenticated;

CREATE VIEW public.project_management_budget_totals WITH(security_invoker=true) AS
 SELECT b.*,COALESCE((SELECT sum(amount) FROM public.project_management_budget_lines WHERE budget_id=b.id),0) AS budget_total
 FROM public.project_management_budgets b;
REVOKE ALL ON public.project_management_budget_totals FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_management_budget_totals TO authenticated;

-- Reuse the authoritative category summary, not a second implementation of costs.
CREATE FUNCTION public.project_management_budget_comparison(p_budget uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH budget AS (SELECT * FROM public.project_management_budgets WHERE id=p_budget),
 actual_rows AS (
  SELECT COALESCE(a."categoryId",mapped.id) AS category_id,a."categoryName" AS category_name,a.currency,a."totalCost" AS amount
  FROM budget b CROSS JOIN LATERAL jsonb_to_recordset(public.project_management_cost_summary(b.project_id)->'byCategory')
    AS a("categoryId" uuid,"categoryName" text,currency text,"totalCost" numeric)
  -- Secondary sources currently have no category FK. Match their existing stable codes.
  LEFT JOIN public.management_cost_categories mapped ON a."categoryId" IS NULL AND mapped.code=CASE a."categoryName"
    WHEN 'Manodopera' THEN 'labor' WHEN 'Attrezzature' THEN 'equipment' WHEN 'Consumabili' THEN 'consumables' END
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
COMMIT;
