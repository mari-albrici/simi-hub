-- Run as migration owner after migrations 001-038; all fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('38000000-0000-4000-8000-000000000001','budget@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='38000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','38000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE project uuid; entity uuid; materials uuid; transport uuid; labor uuid; b1 uuid; b2 uuid; b3 uuid; line uuid;
 cost uuid; employee uuid; comparison jsonb; before_costs jsonb; before_summary jsonb; total numeric;
BEGIN
 SELECT id INTO STRICT entity FROM public.legal_entities WHERE code='SIMI-IT';
 SELECT id INTO STRICT materials FROM public.management_cost_categories WHERE code='materials';
 SELECT id INTO STRICT transport FROM public.management_cost_categories WHERE code='transport';
 SELECT id INTO STRICT labor FROM public.management_cost_categories WHERE code='labor';
 INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P21-P','Budget test',entity) RETURNING id INTO project;
 INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency,cost_category_id) VALUES('manual',CURRENT_DATE,'P21 positivo',120,'EUR',materials) RETURNING id INTO cost;
 INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount) VALUES(cost,project,120);
 INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency,cost_category_id) VALUES('manual',CURRENT_DATE,'P21 credito',-40,'EUR',materials) RETURNING id INTO cost;
 INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount) VALUES(cost,project,40);
 INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency,cost_category_id) VALUES('manual',CURRENT_DATE,'P21 altra valuta',10,'USD',materials) RETURNING id INTO cost;
 INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount) VALUES(cost,project,10);
 INSERT INTO public.employees(first_name,last_name,employee_code,legal_entity_id) VALUES('Budget','Test','P21-E',entity) RETURNING id INTO employee;
 PERFORM public.save_employee_management_rate(NULL,employee,'2027-01-01',NULL,5,'EUR',NULL);
 PERFORM public.save_project_labor_entry(NULL,employee,project,'2027-01-01',2,'ordinary',NULL);
 SELECT jsonb_agg(to_jsonb(c) ORDER BY id) INTO before_costs FROM public.cost_entries c;
 before_summary:=public.project_management_cost_summary(project);
 b1:=public.create_project_management_budget(project);
 IF NOT EXISTS(SELECT 1 FROM public.project_management_budgets WHERE id=b1 AND version_number=1 AND status='draft' AND name='Budget iniziale') THEN RAISE EXCEPTION 'Initial budget incorrect'; END IF;
 BEGIN PERFORM public.create_project_management_budget(project); RAISE EXCEPTION 'Duplicate initial budget accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.approve_project_management_budget(b1); RAISE EXCEPTION 'Empty approval accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.upsert_project_management_budget_line(b1,materials,NULL,-1,NULL); RAISE EXCEPTION 'Negative accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 line:=public.upsert_project_management_budget_line(b1,materials,'Materiali',110,'Nota');
 PERFORM public.upsert_project_management_budget_line(b1,materials,'Materiali',100,'Nota');
 PERFORM public.upsert_project_management_budget_line(b1,transport,NULL,50,NULL);
 IF (SELECT budget_total FROM public.project_management_budget_totals WHERE id=b1)<>150 OR (SELECT count(*) FROM public.project_management_budget_lines WHERE budget_id=b1)<>2 THEN RAISE EXCEPTION 'Upsert or derived total incorrect'; END IF;
 comparison:=public.project_management_budget_comparison(b1);
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(comparison->'rows') AS r(category_id uuid,currency text,budget_amount numeric,actual_cost numeric,variance numeric,variance_percent numeric) WHERE category_id=materials AND currency='EUR' AND actual_cost=80 AND variance=-20 AND variance_percent=-20) THEN RAISE EXCEPTION 'Signed actual/variance incorrect: %',comparison; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(comparison->'rows') AS r(category_id uuid,actual_cost numeric,variance numeric) WHERE category_id=transport AND actual_cost=0 AND variance=-50) THEN RAISE EXCEPTION 'Budget-only category missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(comparison->'rows') AS r(category_id uuid,budget_amount numeric,actual_cost numeric,variance numeric,variance_percent numeric) WHERE category_id=labor AND budget_amount=0 AND actual_cost=10 AND variance=10 AND variance_percent IS NULL) THEN RAISE EXCEPTION 'Actual-only secondary category/zero denominator incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(comparison->'totals') AS r(currency text,budget_amount numeric,actual_cost numeric,variance numeric) WHERE currency='USD' AND budget_amount=0 AND actual_cost=10 AND variance=10) THEN RAISE EXCEPTION 'Currencies combined'; END IF;
 PERFORM public.approve_project_management_budget(b1);
 BEGIN PERFORM public.update_project_management_budget(b1,'Changed',NULL,'EUR',NULL); RAISE EXCEPTION 'Approved header changed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.upsert_project_management_budget_line(b1,materials,NULL,200,NULL); RAISE EXCEPTION 'Approved line changed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.delete_project_management_budget_line(line); RAISE EXCEPTION 'Approved line deleted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 UPDATE public.management_cost_categories SET is_active=false WHERE id=materials;
 b2:=public.clone_project_management_budget(b1);
 IF NOT EXISTS(SELECT 1 FROM public.project_management_budget_totals WHERE id=b2 AND version_number=2 AND status='draft' AND budget_total=150) THEN RAISE EXCEPTION 'Clone incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_management_budget_lines WHERE budget_id=b2 AND cost_category_id=materials AND description='Materiali' AND notes='Nota') THEN RAISE EXCEPTION 'Historical inactive category lost'; END IF;
 PERFORM public.upsert_project_management_budget_line(b2,materials,'Materiali',200,'Nota');
 PERFORM public.upsert_project_management_budget_line(b2,labor,NULL,0,NULL);
 PERFORM public.approve_project_management_budget(b2);
 IF (SELECT status FROM public.project_management_budgets WHERE id=b1)<>'superseded' OR (SELECT count(*) FROM public.project_management_budgets WHERE project_id=project AND status='approved')<>1 THEN RAISE EXCEPTION 'Approval transition failed'; END IF;
 BEGIN PERFORM public.update_project_management_budget(b1,'Changed',NULL,'EUR',NULL); RAISE EXCEPTION 'Superseded changed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 b3:=public.clone_project_management_budget(b1);
 SELECT id INTO line FROM public.project_management_budget_lines WHERE budget_id=b3 AND cost_category_id=materials;
 PERFORM public.delete_project_management_budget_line(line);
 BEGIN PERFORM public.upsert_project_management_budget_line(b3,materials,NULL,1,NULL); RAISE EXCEPTION 'Inactive new category accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF (SELECT version_number FROM public.project_management_budgets WHERE id=b3)<>3 THEN RAISE EXCEPTION 'Clone used source version instead of max'; END IF;
 BEGIN UPDATE public.project_management_budgets SET status='draft' WHERE id=b1; RAISE EXCEPTION 'Direct update bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_id=b2 AND action='clone_budget') OR NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_id=line AND action='delete') THEN RAISE EXCEPTION 'Missing audit'; END IF;
 IF before_costs IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.cost_entries c) OR before_summary IS DISTINCT FROM public.project_management_cost_summary(project) THEN RAISE EXCEPTION 'Budget changed actual costs'; END IF;
END; $$;
RESET ROLE;
-- Test physical uniqueness separately as owner; API writes cannot bypass RPCs.
DO $$ DECLARE b public.project_management_budgets; BEGIN
 SELECT * INTO STRICT b FROM public.project_management_budgets WHERE project_id=(SELECT id FROM public.projects WHERE project_code='P21-P') AND version_number=1;
 BEGIN INSERT INTO public.project_management_budgets(project_id,version_number,name) VALUES(b.project_id,1,'Duplicate'); RAISE EXCEPTION 'Duplicate version accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN INSERT INTO public.project_management_budgets(project_id,version_number,name,status) VALUES(b.project_id,99,'Duplicate approval','approved'); RAISE EXCEPTION 'Multiple approved accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
END; $$;
UPDATE public.profiles SET role='management' WHERE id='38000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ DECLARE b uuid; BEGIN
 SELECT id INTO STRICT b FROM public.project_management_budgets WHERE project_id=(SELECT id FROM public.projects WHERE project_code='P21-P') AND version_number=3;
 BEGIN PERFORM public.approve_project_management_budget(b); RAISE EXCEPTION 'Read-only management approved'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.clone_project_management_budget(b); RAISE EXCEPTION 'Read-only management cloned'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
UPDATE public.profiles SET role='viewer' WHERE id='38000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.project_management_budgets) OR EXISTS(SELECT 1 FROM public.project_management_budget_lines) OR EXISTS(SELECT 1 FROM public.project_management_budget_totals) THEN RAISE EXCEPTION 'Budget RLS bypass'; END IF;
END; $$;
\echo 'PASS: budgets, versions, totals, approval, immutability, signed actuals, missing categories, currencies, permissions and audit'
ROLLBACK;
