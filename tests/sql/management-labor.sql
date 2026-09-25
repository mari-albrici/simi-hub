-- Run as migration owner after migrations 001-037.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('37000000-0000-4000-8000-000000000001','labor@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='37000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','37000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE employee uuid; other_employee uuid; project uuid; manual_project uuid; entity uuid; rate uuid; hours_entry uuid;
 inside_entry uuid; first_day uuid; last_day uuid; cancelled uuid; pool uuid; days_pool uuid; center uuid;
 primary_before jsonb; allocation_before jsonb; original_count bigint; auto_driver uuid;
BEGIN
 SELECT id INTO STRICT entity FROM public.legal_entities WHERE code='SIMI-IT';
 SELECT id INTO STRICT center FROM public.management_cost_centers WHERE code='small_equipment';
 INSERT INTO public.employees(first_name,last_name,employee_code,legal_entity_id) VALUES('Mario','Rossi','P16-E1',entity) RETURNING id INTO employee;
 INSERT INTO public.employees(first_name,last_name,employee_code,legal_entity_id) VALUES('Luca','Bianchi','P16-E2',entity) RETURNING id INTO other_employee;
 INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P16-P','Manodopera',entity) RETURNING id INTO project;
 INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P16-M','Driver manuale',entity) RETURNING id INTO manual_project;
 SELECT count(*) INTO original_count FROM public.cost_entries;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY r.currency) INTO primary_before FROM public.management_reconciliation_summary() r;
 rate:=public.save_employee_management_rate(NULL,employee,'2027-01-01','2027-01-31',28.4,'EUR',NULL);
 PERFORM public.save_employee_management_rate(NULL,employee,'2027-02-01',NULL,30,'EUR',NULL);
 BEGIN
  PERFORM public.save_employee_management_rate(NULL,employee,'2027-01-31','2027-02-01',40,'EUR',NULL);
  RAISE EXCEPTION 'Overlapping inclusive validity accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.save_project_labor_entry(NULL,other_employee,project,'2027-01-01',8,'ordinary',NULL);
  RAISE EXCEPTION 'Missing rate accepted';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'Nessun costo gestionale valido per il dipendente alla data selezionata.' THEN RAISE; END IF;
 END;
 hours_entry:=public.save_project_labor_entry(NULL,employee,project,'2027-01-10',142,'ordinary',NULL);
 IF NOT EXISTS(SELECT 1 FROM public.project_labor_entries WHERE id=hours_entry AND hourly_cost_snapshot=28.4 AND amount=4032.80) THEN RAISE EXCEPTION 'Hours calculation failed'; END IF;
 IF (public.project_management_cost_summary(project)->>'totalCost')::numeric<>4032.80 THEN RAISE EXCEPTION 'Project missing labor'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_management_allocations WHERE id=hours_entry AND source_type='labor' AND category_name='Manodopera' AND description='Rossi Mario') THEN RAISE EXCEPTION 'Labor projection incorrect'; END IF;
 PERFORM public.save_employee_management_rate(rate,employee,'2027-01-01','2027-01-31',99,'EUR','Nuovo valore gestionale');
 IF (SELECT amount FROM public.project_labor_entries WHERE id=hours_entry)<>4032.80 THEN RAISE EXCEPTION 'Rate edit changed history'; END IF;
 PERFORM public.save_project_labor_entry(hours_entry,employee,project,'2027-01-10',10,'overtime',NULL);
 IF (SELECT amount FROM public.project_labor_entries WHERE id=hours_entry)<>284 THEN RAISE EXCEPTION 'Hours-only edit lost snapshot or applied multiplier'; END IF;
 PERFORM public.save_project_labor_entry(hours_entry,employee,project,'2027-02-01',10,'travel',NULL);
 IF (SELECT amount FROM public.project_labor_entries WHERE id=hours_entry)<>300 THEN RAISE EXCEPTION 'Date edit did not reselect rate'; END IF;
 PERFORM public.save_employee_management_rate(NULL,other_employee,'2027-01-01',NULL,5,'EUR',NULL);
 PERFORM public.save_project_labor_entry(hours_entry,other_employee,project,'2027-02-01',10,'other',NULL);
 IF (SELECT amount FROM public.project_labor_entries WHERE id=hours_entry)<>50 THEN RAISE EXCEPTION 'Employee edit did not reselect rate'; END IF;
 inside_entry:=public.save_project_labor_entry(NULL,employee,project,'2027-01-15',5,'ordinary',NULL);
 first_day:=public.save_project_labor_entry(NULL,employee,project,'2027-01-01',1,'ordinary',NULL);
 last_day:=public.save_project_labor_entry(NULL,employee,project,'2027-01-31',1,'ordinary',NULL);
 cancelled:=public.save_project_labor_entry(NULL,employee,project,'2027-01-20',2,'ordinary',NULL);
 PERFORM public.cancel_project_labor_entry(cancelled);
 IF EXISTS(SELECT 1 FROM public.project_management_allocations WHERE id=cancelled) THEN RAISE EXCEPTION 'Cancelled labor included'; END IF;
 PERFORM public.save_project_labor_entry(NULL,employee,manual_project,'2027-01-10',3,'ordinary',NULL);
 IF (SELECT count(*) FROM public.cost_entries)<>original_count
 OR (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.currency) FROM public.management_reconciliation_summary() r) IS DISTINCT FROM primary_before THEN RAISE EXCEPTION 'Labor changed original company costs'; END IF;
 INSERT INTO public.management_cost_pools(code,name,cost_center_id,period_start,period_end,driver_type,planned_driver_quantity)
 VALUES('P16-POOL','Ore gennaio',center,'2027-01-01','2027-01-31','labor_hours',100) RETURNING id INTO pool;
 INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_pool_id) VALUES('manual','2027-01-01','Costo pool',1000,pool);
 INSERT INTO public.management_pool_driver_entries(pool_id,project_id,driver_quantity) VALUES(pool,manual_project,50);
 PERFORM public.calculate_pool_labor_drivers(pool);
 SELECT id INTO STRICT auto_driver FROM public.management_pool_driver_entries WHERE pool_id=pool AND project_id=project AND source_type='labor_entries';
 IF (SELECT driver_quantity FROM public.management_pool_driver_entries WHERE id=auto_driver)<>7 THEN RAISE EXCEPTION 'Pool includes cancelled/out-of-period hours or excludes boundaries'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.management_pool_driver_entries WHERE pool_id=pool AND project_id=manual_project AND driver_quantity=50 AND source_type='manual') THEN RAISE EXCEPTION 'Manual driver replaced'; END IF;
 IF EXISTS(SELECT 1 FROM public.management_pool_allocations WHERE pool_id=pool) THEN RAISE EXCEPTION 'Driver calculation generated allocations'; END IF;
 BEGIN
  UPDATE public.management_pool_driver_entries SET driver_quantity=99 WHERE id=auto_driver;
  RAISE EXCEPTION 'Manual edit of imported driver accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.generate_cost_pool_allocations(pool);
 SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) INTO allocation_before FROM public.management_pool_allocations a WHERE pool_id=pool;
 PERFORM public.cancel_project_labor_entry(inside_entry);
 PERFORM public.calculate_pool_labor_drivers(pool);
 IF (SELECT driver_quantity FROM public.management_pool_driver_entries WHERE id=auto_driver)<>2 THEN RAISE EXCEPTION 'Imported driver not refreshed'; END IF;
 PERFORM public.cancel_project_labor_entry(first_day); PERFORM public.cancel_project_labor_entry(last_day);
 PERFORM public.calculate_pool_labor_drivers(pool);
 IF (SELECT driver_quantity FROM public.management_pool_driver_entries WHERE id=auto_driver)<>0
 OR (SELECT count(*) FROM public.management_pool_driver_entries WHERE pool_id=pool)<>2 THEN RAISE EXCEPTION 'Zero-hour import stale or duplicated'; END IF;
 IF (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.management_pool_allocations a WHERE pool_id=pool) IS DISTINCT FROM allocation_before THEN RAISE EXCEPTION 'Driver refresh changed generated allocations'; END IF;
 UPDATE public.management_cost_pools SET status='closed' WHERE id=pool;
 BEGIN
  PERFORM public.calculate_pool_labor_drivers(pool);
  RAISE EXCEPTION 'Closed pool recalculated';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 INSERT INTO public.management_cost_pools(code,name,cost_center_id,period_start,period_end,driver_type)
 VALUES('P16-DAYS','Giornate',center,'2027-01-01','2027-01-31','worker_days') RETURNING id INTO days_pool;
 BEGIN
  PERFORM public.calculate_pool_labor_drivers(days_pool);
  RAISE EXCEPTION 'Hours imported into worker-days pool';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  UPDATE public.project_labor_entries SET amount=0 WHERE id=hours_entry;
  RAISE EXCEPTION 'Client changed labor amount';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='employee_management_rates' AND entity_id=rate)
 OR NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_id=pool AND action='calculate_labor_drivers') THEN RAISE EXCEPTION 'Missing audit'; END IF;
END; $$;
RESET ROLE;
UPDATE public.profiles SET role='management' WHERE id='37000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.employee_management_rates) THEN RAISE EXCEPTION 'HR rates leaked to management'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.management_labor_employees() WHERE employee_name='Rossi Mario')
 OR NOT EXISTS(SELECT 1 FROM public.project_labor_details WHERE employee_name='Rossi Mario') THEN RAISE EXCEPTION 'Management cannot read minimal labor data'; END IF;
 BEGIN
  PERFORM public.save_employee_management_rate(NULL,gen_random_uuid(),'2027-01-01',NULL,1,'EUR',NULL);
  RAISE EXCEPTION 'Management modified HR rate';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
UPDATE public.profiles SET role='hr' WHERE id='37000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
DECLARE employee uuid;
BEGIN
 SELECT id INTO STRICT employee FROM public.employees WHERE employee_code='P16-E2';
 IF NOT EXISTS(SELECT 1 FROM public.employee_management_rates WHERE employee_id=employee) THEN RAISE EXCEPTION 'HR rate read denied'; END IF;
 BEGIN
  PERFORM public.save_project_labor_entry(NULL,employee,gen_random_uuid(),'2027-01-01',1,'ordinary',NULL);
  RAISE EXCEPTION 'HR bypassed management write permission';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
UPDATE public.profiles SET role='viewer' WHERE id='37000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.employee_management_rates) OR EXISTS(SELECT 1 FROM public.project_labor_entries)
 OR EXISTS(SELECT 1 FROM public.management_labor_employees()) OR EXISTS(SELECT 1 FROM public.management_labor_summary()) THEN RAISE EXCEPTION 'RLS bypass'; END IF;
END; $$;
\echo 'PASS: HR rates, inclusive overlap, missing rate, snapshots, labor calculations, cancellation, project costs, period drivers, manual preservation, separate generation, permissions and audit'
ROLLBACK;
