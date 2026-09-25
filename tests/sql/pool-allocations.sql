-- Run as the migration owner after migrations 001-033.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('33000000-0000-4000-8000-000000000001','poolallocations@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='33000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE pool uuid; day_pool uuid; project uuid; second_project uuid; center uuid; entity uuid;
  entry uuid; driver uuid; allocation uuid; result jsonb; before_total numeric; after_total numeric;
BEGIN
  SELECT id INTO STRICT center FROM public.management_cost_centers WHERE code='small_equipment';
  SELECT id INTO STRICT entity FROM public.legal_entities WHERE code='SIMI-IT';
  INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P12-A','Pool test A',entity) RETURNING id INTO project;
  INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P12-B','Pool test B',entity) RETURNING id INTO second_project;
  INSERT INTO public.management_cost_pools(code,name,cost_center_id,period_start,period_end,driver_type,planned_driver_quantity)
    VALUES('p12_hours','Piccola attrezzatura test',center,'2027-01-01','2027-12-31','labor_hours',1000) RETURNING id INTO pool;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_pool_id)
    VALUES('manual','2027-01-01','Acquisto pool',800,pool) RETURNING id INTO entry;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_pool_id)
    VALUES('manual','2027-01-01','Nota credito pool',-40,pool);
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_pool_id,status)
    VALUES('manual','2027-01-01','Escluso pool',100,pool,'excluded');
  SELECT net_active_costs INTO before_total FROM public.management_reconciliation_summary() WHERE currency='EUR';
  INSERT INTO public.management_pool_driver_entries(pool_id,project_id,driver_quantity) VALUES(pool,project,620) RETURNING id INTO driver;
  INSERT INTO public.management_pool_driver_entries(pool_id,project_id,driver_quantity) VALUES(pool,second_project,1100);
  BEGIN
    INSERT INTO public.management_pool_driver_entries(pool_id,project_id,driver_quantity) VALUES(pool,project,1);
    RAISE EXCEPTION 'Duplicate accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  result:=public.generate_cost_pool_allocations(pool);
  IF (result->>'total_allocated')::numeric<>1307.20 OR (result->>'rate')::numeric<>0.76 OR (result->>'count')::int<>2 THEN
    RAISE EXCEPTION 'Incorrect hours calculation: %',result;
  END IF;
  SELECT id INTO STRICT allocation FROM public.management_pool_allocations WHERE pool_id=pool AND project_id=project;
  IF (SELECT allocated_amount FROM public.management_pool_allocations WHERE id=allocation)<>471.20 THEN RAISE EXCEPTION 'Incorrect amount'; END IF;
  result:=public.project_management_cost_summary(project);
  IF (result->>'totalCost')::numeric<>471.20 OR (result->>'allocationCount')::int<>1 THEN RAISE EXCEPTION 'Pool absent or original cost counted twice: %',result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_management_allocations WHERE id=allocation AND source_type='pool' AND cost_entry_id IS NULL AND category_name='Piccola attrezzatura') THEN
    RAISE EXCEPTION 'Incorrect origin/category';
  END IF;
  IF EXISTS(SELECT 1 FROM public.management_allocations WHERE cost_entry_id=entry) THEN RAISE EXCEPTION 'Direct allocation created'; END IF;
  SELECT net_active_costs INTO after_total FROM public.management_reconciliation_summary() WHERE currency='EUR';
  IF before_total<>after_total THEN RAISE EXCEPTION 'Secondary allocations changed company costs'; END IF;
  IF (SELECT pool_variance FROM public.management_pool_distribution_summaries WHERE id=pool)<>-547.20 THEN RAISE EXCEPTION 'Over-allocation variance incorrect'; END IF;
  UPDATE public.management_pool_driver_entries SET driver_quantity=620.01 WHERE id=driver;
  UPDATE public.cost_entries SET amount=797.10 WHERE id=entry;
  IF (SELECT allocated_amount FROM public.management_pool_allocations WHERE id=allocation)<>471.20 THEN RAISE EXCEPTION 'Snapshot changed without generation'; END IF;
  PERFORM public.generate_cost_pool_allocations(pool);
  IF (SELECT allocated_amount FROM public.management_pool_allocations WHERE id=allocation)<>469.41
    OR (SELECT count(*) FROM public.management_pool_allocations WHERE pool_id=pool)<>2 THEN RAISE EXCEPTION 'Rounding or idempotence failure'; END IF;
  PERFORM public.generate_cost_pool_allocations(pool);
  IF (SELECT count(*) FROM public.management_pool_allocations WHERE pool_id=pool)<>2 THEN RAISE EXCEPTION 'Recalculation duplicated rows'; END IF;
  BEGIN
    UPDATE public.management_pool_allocations SET allocated_amount=1 WHERE id=allocation;
    RAISE EXCEPTION 'Manual generated-row write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.management_pool_allocations WHERE id=allocation;
    RAISE EXCEPTION 'Manual generated-row delete accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.management_cost_pools SET driver_type='worker_days' WHERE id=pool;
    RAISE EXCEPTION 'Unit changed with drivers';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  DELETE FROM public.management_pool_driver_entries WHERE pool_id=pool AND project_id=second_project;
  IF EXISTS(SELECT 1 FROM public.management_pool_allocations WHERE pool_id=pool AND project_id=second_project) THEN RAISE EXCEPTION 'Removal did not reset allocation'; END IF;
  UPDATE public.management_cost_pools SET planned_driver_quantity=0 WHERE id=pool;
  BEGIN
    PERFORM public.generate_cost_pool_allocations(pool);
    RAISE EXCEPTION 'Generated with unavailable rate';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT allocated_amount FROM public.management_pool_allocations WHERE id=allocation)<>469.41 THEN RAISE EXCEPTION 'Failed generation changed snapshot'; END IF;
  UPDATE public.management_cost_pools SET planned_driver_quantity=1000,status='closed' WHERE id=pool;
  BEGIN
    UPDATE public.management_pool_driver_entries SET driver_quantity=1 WHERE id=driver;
    RAISE EXCEPTION 'Closed pool driver modified';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    DELETE FROM public.management_pool_driver_entries WHERE id=driver;
    RAISE EXCEPTION 'Closed pool driver removed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    INSERT INTO public.management_pool_driver_entries(pool_id,project_id,driver_quantity) VALUES(pool,second_project,1);
    RAISE EXCEPTION 'Closed pool driver inserted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.generate_cost_pool_allocations(pool);
    RAISE EXCEPTION 'Closed pool generated';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    UPDATE public.management_cost_pools SET name='Changed' WHERE id=pool;
    RAISE EXCEPTION 'Closed pool metadata modified';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  INSERT INTO public.management_cost_pools(code,name,cost_center_id,period_start,period_end,driver_type,planned_driver_quantity)
    VALUES('p12_days','Giornate test',center,'2027-01-01','2027-12-31','worker_days',100) RETURNING id INTO day_pool;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_pool_id) VALUES('manual','2027-01-01','Pool giornate',1000,day_pool);
  INSERT INTO public.management_pool_driver_entries(pool_id,project_id,driver_quantity) VALUES(day_pool,project,85),(day_pool,second_project,0);
  result:=public.generate_cost_pool_allocations(day_pool);
  IF (result->>'total_allocated')::numeric<>850 OR (result->>'count')::int<>2 THEN RAISE EXCEPTION 'Worker days / zero quantity failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_id=pool AND action='generate_pool_allocations')
    OR NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_id=pool AND action='reset_pool_allocation') THEN RAISE EXCEPTION 'Missing aggregate audit'; END IF;
END;
$$;
RESET ROLE;
UPDATE public.profiles SET role='management' WHERE id='33000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
DECLARE pool uuid;
BEGIN
  SELECT id INTO STRICT pool FROM public.management_cost_pools WHERE code='p12_days';
  IF NOT EXISTS(SELECT 1 FROM public.management_pool_allocations WHERE pool_id=pool) THEN RAISE EXCEPTION 'Read-only user cannot read'; END IF;
  BEGIN
    PERFORM public.generate_cost_pool_allocations(pool);
    RAISE EXCEPTION 'Read-only user generated';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
UPDATE public.profiles SET role='viewer' WHERE id='33000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.management_pool_allocations) OR EXISTS(SELECT 1 FROM public.management_pool_driver_entries)
    OR EXISTS(SELECT 1 FROM public.management_pool_reconciliation_summary()) THEN RAISE EXCEPTION 'RLS read bypass'; END IF;
END; $$;
\echo 'PASS: manual drivers, snapshots, rounding, idempotence, reset, closed pools, summaries, reconciliation, RLS and audit'
ROLLBACK;
