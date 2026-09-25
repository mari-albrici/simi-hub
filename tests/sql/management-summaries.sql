-- Run with psql as the local migration owner after migrations 001-031.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('31000000-0000-4000-8000-000000000001','managementsummary@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='31000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);

DO $$
DECLARE project uuid; entity uuid; center uuid; materials uuid; transport uuid;
  positive uuid; credit uuid; full_cost uuid; unallocated uuid; excluded uuid; extra uuid;
  result jsonb; reconciliation record;
BEGIN
  SELECT id INTO STRICT entity FROM public.legal_entities WHERE code='SIMI-IT';
  SELECT id INTO STRICT center FROM public.management_cost_centers WHERE code='warehouse';
  SELECT id INTO STRICT materials FROM public.management_cost_categories WHERE code='materials';
  SELECT id INTO STRICT transport FROM public.management_cost_categories WHERE code='transport';
  INSERT INTO public.projects(project_code,name,legal_entity_id)
    VALUES('P06-TEST','Riepilogo gestionale test',entity) RETURNING id INTO project;

  -- Dedicated test currencies avoid mixing fixture totals with existing records.
  IF EXISTS (SELECT 1 FROM public.cost_entries WHERE currency IN ('XTS','XUA')) THEN
    RAISE EXCEPTION 'Test requires unused XTS and XUA currencies';
  END IF;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency,cost_center_id,cost_category_id)
    VALUES('manual',CURRENT_DATE,'P06 positivo',10000,'XTS',center,transport) RETURNING id INTO positive;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency,cost_category_id)
    VALUES('manual',CURRENT_DATE,'P06 rettifica',-2000,'XTS',transport) RETURNING id INTO credit;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency)
    VALUES('manual',CURRENT_DATE,'P06 intero',300,'XTS') RETURNING id INTO full_cost;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency)
    VALUES('manual',CURRENT_DATE,'P06 da gestire',700,'XTS') RETURNING id INTO unallocated;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency)
    VALUES('manual',CURRENT_DATE,'P06 escluso',-900,'XTS') RETURNING id INTO excluded;
  INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount,cost_category_id)
    VALUES(positive,project,6000,materials),(credit,project,1000,NULL),(full_cost,project,300,NULL),(excluded,project,400,NULL);
  UPDATE public.cost_entries SET status='excluded' WHERE id=excluded;

  result := public.project_management_cost_summary(project);
  IF (result->>'totalCost')::numeric IS DISTINCT FROM 5300 OR (result->>'allocationCount')::integer IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Project net cost/count incorrect: %',result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_management_allocations
    WHERE cost_entry_id=credit AND economic_amount=-1000 AND cost_category_id=transport) THEN
    RAISE EXCEPTION 'Credit sign or source-category fallback incorrect';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_management_allocations
    WHERE cost_entry_id=positive AND economic_amount=6000 AND cost_category_id=materials) THEN
    RAISE EXCEPTION 'Allocation category did not override source category';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_management_allocations
    WHERE cost_entry_id=full_cost AND cost_category_id IS NULL AND category_name='Non classificato') THEN
    RAISE EXCEPTION 'Unclassified fallback missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_management_allocations WHERE cost_entry_id=excluded) THEN
    RAISE EXCEPTION 'Excluded cost contributed to project totals';
  END IF;
  IF (SELECT sum((item->>'totalCost')::numeric) FROM jsonb_array_elements(result->'byCategory') item) <> 5300 THEN
    RAISE EXCEPTION 'Category totals do not reconcile with project total';
  END IF;
  SELECT * INTO STRICT reconciliation FROM public.management_reconciliation_summary() WHERE currency='XTS';
  IF reconciliation.total_active_costs <> 13000 OR reconciliation.allocated <> 7300
    OR reconciliation.remaining_in_cost_centers <> 4000 OR reconciliation.remaining_unallocated <> 1700
    OR reconciliation.excluded_costs <> 900 OR reconciliation.net_active_costs <> 9000
    OR reconciliation.balance_difference <> 0 THEN
    RAISE EXCEPTION 'Coverage, exclusions or final reconciliation incorrect: %',reconciliation;
  END IF;
  IF (SELECT allocated_amount FROM public.management_allocations WHERE cost_entry_id=credit) <> 1000 THEN
    RAISE EXCEPTION 'Reading changed the stored allocation sign';
  END IF;
  INSERT INTO public.cost_entries(source_type,cost_date,description,amount,currency)
    VALUES('manual',CURRENT_DATE,'P06 seconda valuta',50,'XUA') RETURNING id INTO extra;
  INSERT INTO public.management_allocations(cost_entry_id,project_id,allocated_amount) VALUES(extra,project,50);
  result := public.project_management_cost_summary(project);
  IF result->'totalCost' IS DISTINCT FROM 'null'::jsonb OR jsonb_array_length(result->'byCurrency') <> 2 THEN
    RAISE EXCEPTION 'Different currencies were incorrectly combined';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE project uuid; result jsonb;
BEGIN
  SELECT id INTO STRICT project FROM public.projects WHERE project_code='P06-TEST';
  result := public.project_management_cost_summary(project);
  IF (result->>'allocationCount')::integer IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Authorized user cannot read project summary';
  END IF;
  IF (SELECT balance_difference FROM public.management_reconciliation_summary() WHERE currency='XTS') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Authorized reconciliation differs from fixture';
  END IF;
END;
$$;
RESET ROLE;
UPDATE public.profiles SET role='viewer' WHERE id='31000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_management_allocations)
    OR EXISTS (SELECT 1 FROM public.management_reconciliation_summary()) THEN
    RAISE EXCEPTION 'Management read restriction bypassed';
  END IF;
END;
$$;
\echo 'PASS: project costs, signed credit, category fallbacks, coverage, exclusions, currency separation and RLS'
ROLLBACK;
