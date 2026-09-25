-- Run as migration owner after migrations 001-034.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('34000000-0000-4000-8000-000000000001','managementassets@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='34000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','34000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE asset uuid; project_a uuid; project_b uuid; entity uuid; hourly uuid; daily uuid; monthly uuid; manual uuid;
  movement uuid; result jsonb; primary_before jsonb; cost_count bigint;
BEGIN
  SELECT id INTO STRICT entity FROM public.legal_entities WHERE code='SIMI-IT';
  INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P13-A','Posizione fisica',entity) RETURNING id INTO project_a;
  INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P13-B','Utilizzo economico',entity) RETURNING id INTO project_b;
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.currency) INTO primary_before FROM public.management_reconciliation_summary() r;
  SELECT count(*) INTO cost_count FROM public.cost_entries;
  INSERT INTO public.management_assets(asset_code,name,category,purchase_cost,management_value,allocation_method,hourly_rate)
    VALUES('P13-SAL','Saldatrice industriale','welding',30000,25000,'hourly',12.345678) RETURNING id INTO asset;
  movement:=public.move_management_asset(asset,project_a,'2027-01-01','Spostamento fisico');
  IF (SELECT current_project_id FROM public.management_assets WHERE id=asset) IS DISTINCT FROM project_a
    OR NOT EXISTS(SELECT 1 FROM public.management_asset_movements WHERE id=movement AND from_project_id IS NULL AND to_project_id=project_a) THEN
    RAISE EXCEPTION 'Move history or location missing';
  END IF;
  IF EXISTS(SELECT 1 FROM public.management_asset_usage WHERE asset_id=asset)
    OR (public.project_management_cost_summary(project_a)->>'totalCost')::numeric<>0 THEN
    RAISE EXCEPTION 'Physical move created costs';
  END IF;
  BEGIN
    UPDATE public.management_assets SET current_project_id=project_b WHERE id=asset;
    RAISE EXCEPTION 'Direct position update bypassed history';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  hourly:=public.save_management_asset_usage(NULL,asset,project_b,'2027-01-01',NULL,2.50,NULL,'active','Ore');
  IF (SELECT amount FROM public.management_asset_usage WHERE id=hourly)<>30.86
    OR (SELECT usage_unit FROM public.management_asset_usage WHERE id=hourly)<>'hours' THEN RAISE EXCEPTION 'Hourly calculation/rounding failed'; END IF;
  IF (public.project_management_cost_summary(project_b)->>'totalCost')::numeric<>30.86
    OR (public.project_management_cost_summary(project_a)->>'totalCost')::numeric<>0 THEN
    RAISE EXCEPTION 'Independent economic project or purchase-cost exclusion failed';
  END IF;
  UPDATE public.management_assets SET allocation_method='daily',daily_rate=75 WHERE id=asset;
  daily:=public.save_management_asset_usage(NULL,asset,project_b,'2027-01-01','2027-01-12',12,NULL,'closed','Giorni sovrapposti consentiti');
  IF (SELECT amount FROM public.management_asset_usage WHERE id=daily)<>900
    OR (SELECT usage_unit FROM public.management_asset_usage WHERE id=daily)<>'days' THEN RAISE EXCEPTION 'Daily failed'; END IF;
  UPDATE public.management_assets SET allocation_method='monthly',monthly_rate=1000.123456 WHERE id=asset;
  monthly:=public.save_management_asset_usage(NULL,asset,project_b,'2027-01-01',NULL,1.5,NULL,'active','Mesi');
  IF (SELECT amount FROM public.management_asset_usage WHERE id=monthly)<>1500.19
    OR (SELECT usage_unit FROM public.management_asset_usage WHERE id=monthly)<>'months' THEN RAISE EXCEPTION 'Monthly failed'; END IF;
  UPDATE public.management_assets SET allocation_method='manual' WHERE id=asset;
  manual:=public.save_management_asset_usage(NULL,asset,project_b,'2027-01-01',NULL,NULL,123.45,'active','Manuale');
  IF NOT EXISTS(SELECT 1 FROM public.management_asset_usage WHERE id=manual AND amount=123.45 AND rate=1 AND usage_unit='manual' AND usage_quantity IS NULL) THEN RAISE EXCEPTION 'Manual failed'; END IF;
  result:=public.project_management_cost_summary(project_b);
  IF (result->>'totalCost')::numeric<>2554.50 OR (result->>'allocationCount')::int<>4 THEN RAISE EXCEPTION 'Summary missing usages or double-counting purchase cost: %',result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_management_allocations WHERE id=manual AND category_name='Attrezzature' AND source_type='asset' AND cost_entry_id IS NULL AND description='P13-SAL — Saldatrice industriale') THEN RAISE EXCEPTION 'Usage category/origin incorrect'; END IF;
  PERFORM public.cancel_management_asset_usage(daily);
  IF (public.project_management_cost_summary(project_b)->>'totalCost')::numeric<>1654.50 THEN RAISE EXCEPTION 'Cancelled usage included'; END IF;
  UPDATE public.management_assets SET currency='USD',hourly_rate=99 WHERE id=asset;
  IF NOT EXISTS(SELECT 1 FROM public.management_asset_usage WHERE id=hourly AND currency='EUR' AND rate=12.345678 AND amount=30.86) THEN RAISE EXCEPTION 'Asset edit rewrote historical snapshot'; END IF;
  PERFORM public.save_management_asset_usage(manual,asset,project_b,'2027-01-02',NULL,NULL,130,'closed','Modifica esplicita');
  IF NOT EXISTS(SELECT 1 FROM public.management_asset_usage WHERE id=manual AND amount=130 AND currency='USD' AND status='closed') THEN RAISE EXCEPTION 'Usage edit failed'; END IF;
  IF (SELECT count(*) FROM public.management_asset_usage WHERE asset_id=asset)<>4 THEN RAISE EXCEPTION 'Edit duplicated usage'; END IF;
  movement:=public.move_management_asset(asset,NULL,'2027-01-10','Rientro');
  IF (SELECT current_project_id FROM public.management_assets WHERE id=asset) IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM public.management_asset_movements WHERE id=movement AND from_project_id=project_a AND to_project_id IS NULL) THEN RAISE EXCEPTION 'Warehouse move failed'; END IF;
  IF (SELECT count(*) FROM public.cost_entries)<>cost_count
    OR (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.currency) FROM public.management_reconciliation_summary() r) IS DISTINCT FROM primary_before THEN
    RAISE EXCEPTION 'Assets changed company costs or primary reconciliation';
  END IF;
  IF (SELECT total_usage FROM public.management_asset_usage_totals WHERE asset_id=asset AND currency='EUR')<>1531.05
    OR (SELECT total_usage FROM public.management_asset_usage_totals WHERE asset_id=asset AND currency='USD')<>130 THEN RAISE EXCEPTION 'Secondary totals incorrect'; END IF;
  BEGIN
    PERFORM public.save_management_asset_usage(daily,asset,project_b,'2027-01-01',NULL,NULL,100,'active',NULL);
    RAISE EXCEPTION 'Cancelled usage reactivated';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.save_management_asset_usage(NULL,asset,project_b,'2027-01-01',NULL,NULL,NULL,'active',NULL);
    RAISE EXCEPTION 'Missing manual amount accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.management_assets SET allocation_method='daily' WHERE id=asset;
  BEGIN
    PERFORM public.save_management_asset_usage(NULL,asset,project_b,'2027-01-01',NULL,NULL,999,'active',NULL);
    RAISE EXCEPTION 'Missing quantity accepted or client amount trusted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.save_management_asset_usage(NULL,asset,project_b,'2027-01-02','2027-01-01',1,NULL,'active',NULL);
    RAISE EXCEPTION 'Reversed period accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    UPDATE public.management_asset_usage SET amount=1 WHERE id=hourly;
    RAISE EXCEPTION 'Direct client amount accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.management_asset_usage WHERE id=hourly;
    RAISE EXCEPTION 'Physical usage delete allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.management_assets WHERE id=asset;
    RAISE EXCEPTION 'Physical asset delete allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='management_asset_movements' AND entity_id=movement AND action='insert')
    OR NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='management_asset_usage' AND entity_id=daily AND new_data->>'status'='cancelled') THEN RAISE EXCEPTION 'Audit missing'; END IF;
END;
$$;
RESET ROLE;
UPDATE public.profiles SET role='management' WHERE id='34000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
DECLARE asset uuid;
BEGIN
  SELECT id INTO STRICT asset FROM public.management_assets WHERE asset_code='P13-SAL';
  IF NOT EXISTS(SELECT 1 FROM public.management_asset_usage WHERE asset_id=asset) THEN RAISE EXCEPTION 'Read-only management cannot read'; END IF;
  BEGIN
    PERFORM public.move_management_asset(asset,NULL,'2027-02-01',NULL);
    RAISE EXCEPTION 'Read-only management moved asset';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_management_asset_usage(NULL,asset,gen_random_uuid(),'2027-01-01',NULL,1,NULL,'active',NULL);
    RAISE EXCEPTION 'Read-only management created usage';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
UPDATE public.profiles SET role='viewer' WHERE id='34000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.management_assets) OR EXISTS(SELECT 1 FROM public.management_asset_movements)
    OR EXISTS(SELECT 1 FROM public.management_asset_usage) OR EXISTS(SELECT 1 FROM public.management_asset_usage_summary()) THEN RAISE EXCEPTION 'RLS bypass'; END IF;
END; $$;
\echo 'PASS: physical movement, independent economic usage, four methods, snapshots, cancellation, summaries, no double counting, RLS and audit'
ROLLBACK;
