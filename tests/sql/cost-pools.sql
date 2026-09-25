-- Run as the local migration owner after migrations 001-032.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('32000000-0000-4000-8000-000000000001','costpools@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='32000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','32000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE pool uuid; center uuid; other_center uuid; positive uuid; credit uuid; excluded uuid; summary record;
  active_before numeric; centers_before numeric; active_after numeric; centers_after numeric;
BEGIN
  SELECT id INTO STRICT center FROM public.management_cost_centers WHERE code='small_equipment';
  SELECT id INTO STRICT other_center FROM public.management_cost_centers WHERE code='warehouse';
  INSERT INTO public.management_cost_pools(code,name,cost_center_id,period_start,period_end,driver_type,planned_driver_quantity)
    VALUES('p11_test','Pool test',center,'2027-01-01','2027-12-31','labor_hours',100) RETURNING id INTO pool;
  SELECT total_active_costs,remaining_in_cost_centers INTO active_before,centers_before
    FROM public.management_reconciliation_summary() WHERE currency='EUR';
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_pool_id)
    VALUES('manual','2027-01-01','P11 acquisto',1000,pool) RETURNING id INTO positive;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_pool_id)
    VALUES('manual','2027-01-02','P11 rettifica',-200,pool) RETURNING id INTO credit;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_pool_id,status)
    VALUES('manual','2027-01-03','P11 escluso',3000,pool,'excluded') RETURNING id INTO excluded;
  SELECT * INTO STRICT summary FROM public.management_cost_pool_summaries WHERE id=pool;
  IF summary.actual_cost <> 800 OR summary.standard_rate <> 8 OR summary.linked_cost_entries_count <> 3 THEN
    RAISE EXCEPTION 'Signed actual cost, exclusions, count or calculated rate incorrect: %',summary;
  END IF;
  IF (SELECT cost_center_id FROM public.cost_entries WHERE id=positive) IS DISTINCT FROM center THEN
    RAISE EXCEPTION 'Pool assignment did not fill an empty center';
  END IF;
  SELECT total_active_costs,remaining_in_cost_centers INTO active_after,centers_after
    FROM public.management_reconciliation_summary() WHERE currency='EUR';
  IF active_after-COALESCE(active_before,0) <> 1200 OR centers_after-COALESCE(centers_before,0) <> 1200 THEN
    RAISE EXCEPTION 'Pool grouping changed allocation coverage';
  END IF;
  IF EXISTS (SELECT 1 FROM public.management_allocations WHERE cost_entry_id IN (positive,credit,excluded)) THEN
    RAISE EXCEPTION 'Pool assignment created an allocation';
  END IF;
  UPDATE public.management_cost_pools SET planned_driver_quantity=0 WHERE id=pool;
  IF (SELECT standard_rate FROM public.management_cost_pool_summaries WHERE id=pool) IS NOT NULL THEN
    RAISE EXCEPTION 'Zero quantity produced a rate';
  END IF;
  UPDATE public.management_cost_pools SET planned_driver_quantity=NULL WHERE id=pool;
  IF (SELECT standard_rate FROM public.management_cost_pool_summaries WHERE id=pool) IS NOT NULL THEN
    RAISE EXCEPTION 'Null quantity produced a rate';
  END IF;
  BEGIN
    UPDATE public.cost_entries SET cost_center_id=other_center WHERE id=positive;
    RAISE EXCEPTION 'Incompatible cost center accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    UPDATE public.management_cost_pools SET cost_center_id=other_center WHERE id=pool;
    RAISE EXCEPTION 'Pool center changed despite linked entries';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency,cost_pool_id)
      VALUES('manual',CURRENT_DATE,'Currency mismatch',10,'USD',pool);
    RAISE EXCEPTION 'Mixed currencies accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  UPDATE public.management_cost_pools SET status='closed' WHERE id=pool;
  UPDATE public.cost_entries SET notes='Retain closed pool' WHERE id=positive;
  BEGIN
    INSERT INTO public.cost_entries(source_type,cost_date,description,amount,cost_pool_id)
      VALUES('manual',CURRENT_DATE,'Closed pool',10,pool);
    RAISE EXCEPTION 'New assignment to closed pool accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM public.update_cost_entry_classification(positive,NULL,center,'Unlink pool',NULL);
  IF (SELECT cost_pool_id FROM public.cost_entries WHERE id=positive) IS NOT NULL THEN
    RAISE EXCEPTION 'Pool unlink failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.activity_logs WHERE entity_id=pool AND action='insert')
    OR NOT EXISTS (SELECT 1 FROM public.activity_logs WHERE entity_id=positive AND action='update'
      AND old_data->>'cost_pool_id'=pool::text AND new_data->>'cost_pool_id' IS NULL) THEN
    RAISE EXCEPTION 'Pool creation or unlink audit missing';
  END IF;
  BEGIN
    DELETE FROM public.management_cost_pools WHERE id=pool;
    RAISE EXCEPTION 'Physical deletion allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
\echo 'PASS: pool signed cost, exclusions, rates, center/currency compatibility, closed pools, audit and coverage'
ROLLBACK;
