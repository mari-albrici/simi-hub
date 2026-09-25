-- Run as migration owner after migrations 001-039. Also run management-budgets.sql
-- to verify the existing comparison after extracting its shared actual adapter.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('39000000-0000-4000-8000-000000000001','forecast@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='39000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','39000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE project uuid; other_project uuid; entity uuid; materials uuid; transport uuid; rentals uuid;
 budget uuid; revision uuid; f1 uuid; f2 uuid; f3 uuid; standalone uuid; entry uuid; employee uuid;
 asset uuid; item uuid; container uuid; pool uuid; center uuid; result jsonb; baseline jsonb; costs_before jsonb; actual_before jsonb;
BEGIN
 SELECT id INTO STRICT entity FROM public.legal_entities WHERE code='SIMI-IT';
 SELECT id INTO STRICT materials FROM public.management_cost_categories WHERE code='materials';
 SELECT id INTO STRICT transport FROM public.management_cost_categories WHERE code='transport';
 SELECT id INTO STRICT rentals FROM public.management_cost_categories WHERE code='rentals';
 SELECT id INTO STRICT center FROM public.management_cost_centers WHERE code='small_equipment';
 INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P22-P','Forecast test',entity) RETURNING id INTO project;
 INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P22-N','Senza budget',entity) RETURNING id INTO other_project;
 INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_category_id) VALUES('manual',CURRENT_DATE,'P22 costo',12000,materials) RETURNING id INTO entry;
 INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount) VALUES(entry,project,12000);
 INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_category_id) VALUES('manual',CURRENT_DATE,'P22 credito',-4000,materials) RETURNING id INTO entry;
 INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount) VALUES(entry,project,4000);
 -- All secondary sources must be included once, exactly as in the budget comparison.
 INSERT INTO public.employees(first_name,last_name,employee_code,legal_entity_id) VALUES('Forecast','Test','P22-E',entity) RETURNING id INTO employee;
 PERFORM public.save_employee_management_rate(NULL,employee,'2027-01-01',NULL,5,'EUR',NULL);
 PERFORM public.save_project_labor_entry(NULL,employee,project,'2027-01-01',2,'ordinary',NULL);
 INSERT INTO public.management_assets(asset_code,name,category,allocation_method,hourly_rate) VALUES('P22-A','Asset test','welding','hourly',5) RETURNING id INTO asset;
 PERFORM public.save_management_asset_usage(NULL,asset,project,'2027-01-01',NULL,3,NULL,'active',NULL);
 INSERT INTO public.management_containers(container_code,name) VALUES('P22-C','Container test') RETURNING id INTO container;
 INSERT INTO public.management_consumable_items(item_code,name,unit,default_unit_cost) VALUES('P22-I','Item test','pcs',2) RETURNING id INTO item;
 PERFORM public.record_consumable_movement(item,'load',NULL,container,NULL,10,2,'2027-01-01',NULL);
 PERFORM public.record_consumable_movement(item,'consumption',container,NULL,project,2,NULL,'2027-01-02',NULL);
 INSERT INTO public.management_cost_pools(code,name,cost_center_id,period_start,period_end,driver_type,planned_driver_quantity)
 VALUES('p22_pool','Pool test',center,'2027-01-01','2027-12-31','labor_hours',10) RETURNING id INTO pool;
 INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_pool_id) VALUES('manual','2027-01-01','Pool test',100,pool);
 INSERT INTO public.management_pool_driver_entries(pool_id,project_id,driver_quantity) VALUES(pool,project,2);
 PERFORM public.generate_cost_pool_allocations(pool);
 IF (public.project_management_cost_summary(project)->>'totalCost')::numeric<>8049 THEN RAISE EXCEPTION 'Incorrect actual fixture'; END IF;
 budget:=public.create_project_management_budget(project);
 PERFORM public.upsert_project_management_budget_line(budget,materials,NULL,10000,NULL);
 PERFORM public.upsert_project_management_budget_line(budget,transport,NULL,500,NULL);
 PERFORM public.approve_project_management_budget(budget);
 SELECT jsonb_agg(to_jsonb(c) ORDER BY id) INTO costs_before FROM public.cost_entries c;
 actual_before:=public.project_management_cost_summary(project);
 f1:=public.create_project_management_forecast(project);
 IF NOT EXISTS(SELECT 1 FROM public.project_management_forecasts WHERE id=f1 AND version_number=1 AND name='Forecast iniziale' AND status='draft' AND forecast_date=current_date) THEN RAISE EXCEPTION 'Invalid initial forecast'; END IF;
 IF (SELECT count(*) FROM public.project_management_forecast_lines WHERE forecast_id=f1)<>2 OR EXISTS(SELECT 1 FROM public.project_management_forecast_lines WHERE forecast_id=f1 AND cost_to_complete<>0) THEN RAISE EXCEPTION 'Initial categories or zero CTC wrong'; END IF;
 BEGIN PERFORM public.create_project_management_forecast(project); RAISE EXCEPTION 'Duplicate initial accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.upsert_project_management_forecast_line(f1,materials,-1,NULL); RAISE EXCEPTION 'Negative CTC accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.upsert_project_management_forecast_line(f1,materials,3000,'Manuale');
 PERFORM public.upsert_project_management_forecast_line(f1,rentals,200,'Solo forecast');
 result:=public.project_management_forecast_comparison(project,f1);
 baseline:=public.project_management_budget_comparison(budget);
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(baseline->'rows') AS b(category_id uuid,category_name text,currency text,actual_cost numeric)
  FULL JOIN jsonb_to_recordset(result->'rows') AS f(category_id uuid,category_name text,currency text,actual_cost numeric)
  ON b.category_id IS NOT DISTINCT FROM f.category_id AND b.category_name=f.category_name AND b.currency=f.currency
  WHERE COALESCE(b.actual_cost,0)<>COALESCE(f.actual_cost,0)) THEN RAISE EXCEPTION 'Actual diverged from budget comparison'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(result->'rows') AS r(category_id uuid,budget_amount numeric,actual_cost numeric,cost_to_complete numeric,estimate_at_completion numeric,forecast_variance numeric,forecast_variance_percent numeric)
  WHERE category_id=materials AND budget_amount=10000 AND actual_cost=8000 AND cost_to_complete=3000 AND estimate_at_completion=11000 AND forecast_variance=1000 AND forecast_variance_percent=10) THEN RAISE EXCEPTION 'EAC/variance/percent incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(result->'rows') AS r(category_id uuid,actual_cost numeric,cost_to_complete numeric,forecast_variance numeric) WHERE category_id=transport AND actual_cost=0 AND cost_to_complete=0 AND forecast_variance=-500) THEN RAISE EXCEPTION 'Budget-only category lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(result->'rows') AS r(category_id uuid,budget_amount numeric,actual_cost numeric,estimate_at_completion numeric,forecast_variance_percent numeric) WHERE category_id=rentals AND budget_amount=0 AND actual_cost=0 AND estimate_at_completion=200 AND forecast_variance_percent IS NULL) THEN RAISE EXCEPTION 'Forecast-only category lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(result->'rows') AS r(category_name text,budget_amount numeric,cost_to_complete numeric,estimate_at_completion numeric) WHERE category_name='Manodopera' AND budget_amount=0 AND cost_to_complete=0 AND estimate_at_completion=10) THEN RAISE EXCEPTION 'Actual-only category lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(result->'totals') AS t(actual_cost numeric,cost_to_complete numeric,estimate_at_completion numeric,forecast_variance numeric) WHERE actual_cost=8049 AND cost_to_complete=3200 AND estimate_at_completion=11249 AND forecast_variance=749) THEN RAISE EXCEPTION 'Totals wrong'; END IF;
 PERFORM public.update_project_management_forecast(f1,'Forecast storico','2027-01-01','EUR','Nota');
 PERFORM public.approve_project_management_forecast(f1);
 BEGIN PERFORM public.update_project_management_forecast(f1,'Changed',current_date,'EUR',NULL); RAISE EXCEPTION 'Approved header mutable'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.upsert_project_management_forecast_line(f1,materials,1,NULL); RAISE EXCEPTION 'Approved CTC mutable'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 f2:=public.clone_project_management_forecast(f1);
 IF NOT EXISTS(SELECT 1 FROM public.project_management_forecasts WHERE id=f2 AND version_number=2 AND status='draft' AND forecast_date=current_date) OR NOT EXISTS(SELECT 1 FROM public.project_management_forecast_lines WHERE forecast_id=f2 AND cost_category_id=materials AND cost_to_complete=3000 AND notes='Manuale') THEN RAISE EXCEPTION 'Clone did not preserve CTC/reset date'; END IF;
 PERFORM public.approve_project_management_forecast(f2);
 IF (SELECT status FROM public.project_management_forecasts WHERE id=f1)<>'superseded' OR (SELECT count(*) FROM public.project_management_forecasts WHERE project_id=project AND status='approved')<>1 THEN RAISE EXCEPTION 'Approval transition incorrect'; END IF;
 BEGIN PERFORM public.upsert_project_management_forecast_line(f1,materials,1,NULL); RAISE EXCEPTION 'Superseded mutable'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 f3:=public.clone_project_management_forecast(f1);
 IF (SELECT version_number FROM public.project_management_forecasts WHERE id=f3)<>3 THEN RAISE EXCEPTION 'Revision number did not use max'; END IF;
 BEGIN UPDATE public.project_management_forecast_lines SET cost_to_complete=0 WHERE forecast_id=f2; RAISE EXCEPTION 'Direct write bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF costs_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.cost_entries c) OR actual_before IS DISTINCT FROM public.project_management_cost_summary(project) THEN RAISE EXCEPTION 'Forecast changed actuals'; END IF;
 -- A new actual raises EAC, never consumes the manually entered CTC.
 INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_category_id) VALUES('manual',CURRENT_DATE,'Nuovo costo',4000,materials) RETURNING id INTO entry;
 INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount) VALUES(entry,project,4000);
 result:=public.project_management_forecast_comparison(project,f2);
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(result->'rows') AS r(category_id uuid,actual_cost numeric,cost_to_complete numeric,estimate_at_completion numeric,forecast_variance numeric) WHERE category_id=materials AND actual_cost=12000 AND cost_to_complete=3000 AND estimate_at_completion=15000 AND forecast_variance=5000) THEN RAISE EXCEPTION 'Actual update changed CTC or failed to update EAC'; END IF;
 PERFORM public.upsert_project_management_forecast_line(f3,materials,4000,NULL);
 IF (SELECT cost_to_complete FROM public.project_management_forecast_lines WHERE forecast_id=f3 AND cost_category_id=materials)<>4000 THEN RAISE EXCEPTION 'Over-budget actual prevented CTC'; END IF;
 -- The comparison follows current approved budget, never a draft revision.
 revision:=public.clone_project_management_budget(budget);
 PERFORM public.upsert_project_management_budget_line(revision,materials,NULL,20000,NULL);
 IF public.project_management_forecast_comparison(project,f2)->>'budget_id'<>budget::text THEN RAISE EXCEPTION 'Draft budget used'; END IF;
 PERFORM public.approve_project_management_budget(revision);
 IF public.project_management_forecast_comparison(project,f2)->>'budget_id'<>revision::text THEN RAISE EXCEPTION 'Current approved budget ignored'; END IF;
 -- No budget is required, but an empty forecast cannot be approved.
 standalone:=public.create_project_management_forecast(other_project);
 BEGIN PERFORM public.approve_project_management_forecast(standalone); RAISE EXCEPTION 'Empty forecast approved'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.upsert_project_management_forecast_line(standalone,rentals,20,NULL);
 INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency,cost_category_id) VALUES('manual',CURRENT_DATE,'USD',7,'USD',materials) RETURNING id INTO entry;
 INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount) VALUES(entry,other_project,7);
 result:=public.project_management_forecast_comparison(other_project,standalone);
 IF result->>'budget_id' IS NOT NULL OR EXISTS(SELECT 1 FROM jsonb_to_recordset(result->'totals') AS t(forecast_variance numeric,forecast_variance_percent numeric) WHERE forecast_variance IS NOT NULL OR forecast_variance_percent IS NOT NULL) THEN RAISE EXCEPTION 'No-budget variance should be null'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(result->'totals') AS t(currency text,actual_cost numeric,cost_to_complete numeric,estimate_at_completion numeric) WHERE currency='USD' AND actual_cost=7 AND cost_to_complete=0 AND estimate_at_completion=7) OR NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(result->'totals') AS t(currency text,estimate_at_completion numeric) WHERE currency='EUR' AND estimate_at_completion=20) THEN RAISE EXCEPTION 'Currencies combined'; END IF;
 PERFORM public.approve_project_management_forecast(standalone);
 IF NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_id=f2 AND action='clone_forecast') OR EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='project_management_forecast_lines' AND entity_id IN (SELECT id FROM public.project_management_forecast_lines WHERE forecast_id=f2)) THEN RAISE EXCEPTION 'Clone audit should be aggregated'; END IF;
END; $$;
RESET ROLE;
DO $$ DECLARE f public.project_management_forecasts; BEGIN
 SELECT * INTO STRICT f FROM public.project_management_forecasts WHERE project_id=(SELECT id FROM public.projects WHERE project_code='P22-P') AND version_number=1;
 BEGIN INSERT INTO public.project_management_forecasts(project_id,version_number,name) VALUES(f.project_id,1,'Duplicate'); RAISE EXCEPTION 'Duplicate version'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN INSERT INTO public.project_management_forecasts(project_id,version_number,name,status) VALUES(f.project_id,99,'Duplicate','approved'); RAISE EXCEPTION 'Multiple approved'; EXCEPTION WHEN unique_violation THEN NULL; END;
END; $$;
UPDATE public.profiles SET role='management' WHERE id='39000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ DECLARE f uuid; BEGIN
 SELECT id INTO STRICT f FROM public.project_management_forecasts WHERE project_id=(SELECT id FROM public.projects WHERE project_code='P22-P') AND version_number=3;
 BEGIN PERFORM public.approve_project_management_forecast(f); RAISE EXCEPTION 'Read-only role approved'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.clone_project_management_forecast(f); RAISE EXCEPTION 'Read-only role cloned'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
UPDATE public.profiles SET role='viewer' WHERE id='39000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.project_management_forecasts) OR EXISTS(SELECT 1 FROM public.project_management_forecast_lines) OR EXISTS(SELECT 1 FROM public.project_management_forecast_totals) THEN RAISE EXCEPTION 'RLS leak'; END IF;
 IF EXISTS(SELECT 1 FROM public.projects p CROSS JOIN LATERAL public.project_management_actual_categories(p.id) a) THEN RAISE EXCEPTION 'Actual helper leak'; END IF;
END; $$;
\echo 'PASS: forecasts, versions, approval, shared actuals, EAC, variance, category union, no budget, currencies, unchanged CTC, RLS and audit'
ROLLBACK;
