-- Run as migration owner after migrations 001-035.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('35000000-0000-4000-8000-000000000001','managementcontainers@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='35000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','35000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE container uuid; other_container uuid; asset uuid; retired_asset uuid; membership uuid; new_membership uuid;
  movement uuid; project_a uuid; project_b uuid; entity uuid; explicit_usage uuid;
  primary_before jsonb; project_before jsonb; usage_count bigint; direct_count bigint; pool_count bigint; cost_count bigint; audit_count bigint;
BEGIN
  SELECT id INTO STRICT entity FROM public.legal_entities WHERE code='SIMI-IT';
  INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P14-A','Container location A',entity) RETURNING id INTO project_a;
  INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P14-B','Container location B',entity) RETURNING id INTO project_b;
  INSERT INTO public.management_containers(container_code,name,purchase_cost) VALUES('P14-CT1','Container saldatura',5000) RETURNING id INTO container;
  INSERT INTO public.management_containers(container_code,name,ownership_type) VALUES('P14-CT2','Container noleggio','rented') RETURNING id INTO other_container;
  IF NOT EXISTS(SELECT 1 FROM public.management_container_summaries WHERE id=container AND asset_count=0 AND current_project_id IS NULL AND status='available') THEN RAISE EXCEPTION 'Container creation failed'; END IF;
  INSERT INTO public.management_assets(asset_code,name,category,purchase_cost,allocation_method,daily_rate)
    VALUES('P14-AS1','Saldatrice','welding',30000,'daily',75) RETURNING id INTO asset;
  INSERT INTO public.management_assets(asset_code,name,category,allocation_method,status)
    VALUES('P14-AS2','Dismessa','other','manual','retired') RETURNING id INTO retired_asset;
  explicit_usage:=public.save_management_asset_usage(NULL,asset,project_b,'2027-01-01',NULL,2,NULL,'active','Esplicito');
  SELECT count(*) INTO usage_count FROM public.management_asset_usage;
  SELECT count(*) INTO direct_count FROM public.management_allocations;
  SELECT count(*) INTO pool_count FROM public.management_pool_allocations;
  SELECT count(*) INTO cost_count FROM public.cost_entries;
  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.currency) INTO primary_before FROM public.management_reconciliation_summary() r;
  project_before:=public.project_management_cost_summary(project_b);

  movement:=public.move_management_container(container,project_a,'2027-01-01',250,'EUR','Trasporto logistico');
  IF NOT EXISTS(SELECT 1 FROM public.management_container_movements WHERE id=movement AND from_project_id IS NULL AND to_project_id=project_a AND transport_cost=250)
    OR (SELECT current_project_id FROM public.management_containers WHERE id=container) IS DISTINCT FROM project_a THEN RAISE EXCEPTION 'Container movement/history incorrect'; END IF;
  membership:=public.add_asset_to_container(container,asset,'2027-01-01','Ingresso');
  IF (SELECT current_project_id FROM public.management_assets WHERE id=asset) IS DISTINCT FROM project_a
    OR NOT EXISTS(SELECT 1 FROM public.management_container_assets WHERE id=membership AND date_out IS NULL)
    OR (SELECT asset_count FROM public.management_container_summaries WHERE id=container)<>1 THEN RAISE EXCEPTION 'Membership or initial sync failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.management_available_container_assets WHERE id IN (asset,retired_asset)) THEN RAISE EXCEPTION 'Unavailable asset offered'; END IF;
  BEGIN
    PERFORM public.add_asset_to_container(other_container,asset,'2027-01-02',NULL);
    RAISE EXCEPTION 'Asset in two active containers';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.add_asset_to_container(container,asset,'2027-01-02',NULL);
    RAISE EXCEPTION 'Duplicate active membership';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.add_asset_to_container(container,retired_asset,'2027-01-02',NULL);
    RAISE EXCEPTION 'Retired asset added';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.management_containers SET status='retired' WHERE id=other_container;
  BEGIN
    PERFORM public.add_asset_to_container(other_container,asset,'2027-01-02',NULL);
    RAISE EXCEPTION 'Retired container accepted content';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.management_containers SET status='available' WHERE id=other_container;
  -- Existing standalone movement may diverge; the next container move is authoritative.
  PERFORM public.move_management_asset(asset,NULL,'2027-01-02','Posizione manuale');
  SELECT count(*) INTO audit_count FROM public.activity_logs WHERE entity_type='management_assets' AND entity_id=asset;
  movement:=public.move_management_container(container,project_b,'2027-01-03',300,'EUR',NULL);
  IF (SELECT current_project_id FROM public.management_assets WHERE id=asset) IS DISTINCT FROM project_b
    OR NOT EXISTS(SELECT 1 FROM public.management_container_movements WHERE id=movement AND from_project_id=project_a AND to_project_id=project_b AND synced_asset_ids=ARRAY[asset]) THEN RAISE EXCEPTION 'Container position authority/sync failed'; END IF;
  IF (SELECT count(*) FROM public.activity_logs WHERE entity_type='management_assets' AND entity_id=asset)<>audit_count THEN RAISE EXCEPTION 'Duplicate audit per synchronized asset'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='management_container_movements' AND entity_id=movement AND new_data->'synced_asset_ids'=to_jsonb(ARRAY[asset])) THEN RAISE EXCEPTION 'Aggregate audit missing'; END IF;
  BEGIN
    PERFORM public.remove_asset_from_container(membership,'2026-12-31');
    RAISE EXCEPTION 'Exit before entry accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.remove_asset_from_container(membership,'2027-01-04');
  IF NOT EXISTS(SELECT 1 FROM public.management_container_assets WHERE id=membership AND date_out='2027-01-04')
    OR (SELECT current_project_id FROM public.management_assets WHERE id=asset) IS DISTINCT FROM project_b THEN RAISE EXCEPTION 'Removal lost history or last position'; END IF;
  PERFORM public.move_management_container(container,NULL,'2027-01-05',NULL,'EUR',NULL);
  IF (SELECT current_project_id FROM public.management_assets WHERE id=asset) IS DISTINCT FROM project_b THEN RAISE EXCEPTION 'Removed asset moved with container'; END IF;
  new_membership:=public.add_asset_to_container(other_container,asset,'2027-01-05',NULL);
  IF (SELECT count(*) FROM public.management_container_assets WHERE asset_id=asset)<>2
    OR (SELECT current_project_id FROM public.management_assets WHERE id=asset) IS NOT NULL THEN RAISE EXCEPTION 'New membership or warehouse sync failed'; END IF;
  PERFORM public.move_management_container(other_container,project_a,'2027-01-06',NULL,'EUR',NULL);
  PERFORM public.move_management_container(other_container,NULL,'2027-01-07',NULL,'EUR',NULL);
  IF (SELECT current_project_id FROM public.management_assets WHERE id=asset) IS NOT NULL THEN RAISE EXCEPTION 'Contained asset did not return to warehouse'; END IF;
  IF (SELECT count(*) FROM public.management_asset_usage)<>usage_count
    OR (SELECT count(*) FROM public.management_allocations)<>direct_count
    OR (SELECT count(*) FROM public.management_pool_allocations)<>pool_count
    OR (SELECT count(*) FROM public.cost_entries)<>cost_count
    OR public.project_management_cost_summary(project_b) IS DISTINCT FROM project_before
    OR (public.project_management_cost_summary(project_a)->>'totalCost')::numeric<>0
    OR (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.currency) FROM public.management_reconciliation_summary() r) IS DISTINCT FROM primary_before THEN
    RAISE EXCEPTION 'Logistics changed economic data or project/company totals';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.management_asset_usage WHERE id=explicit_usage AND amount=150 AND project_id=project_b AND status='active') THEN RAISE EXCEPTION 'Existing economic usage changed'; END IF;
  BEGIN
    UPDATE public.management_containers SET current_project_id=project_a WHERE id=container;
    RAISE EXCEPTION 'Direct position update bypassed history';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.management_container_assets SET date_out='2027-01-08' WHERE id=new_membership;
    RAISE EXCEPTION 'Direct membership write bypassed RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.management_container_assets WHERE id=membership;
    RAISE EXCEPTION 'Historical membership deleted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.management_container_movements WHERE id=movement;
    RAISE EXCEPTION 'Historical movement deleted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.management_containers WHERE id=container;
    RAISE EXCEPTION 'Container deleted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='management_container_assets' AND entity_id=membership AND action='insert')
    OR NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='management_container_assets' AND entity_id=membership AND new_data->>'date_out'='2027-01-04') THEN RAISE EXCEPTION 'Membership audit missing'; END IF;
END;
$$;
RESET ROLE;
UPDATE public.profiles SET role='management' WHERE id='35000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
DECLARE container uuid;
BEGIN
  SELECT id INTO STRICT container FROM public.management_containers WHERE container_code='P14-CT1';
  IF NOT EXISTS(SELECT 1 FROM public.management_container_movements WHERE container_id=container) THEN RAISE EXCEPTION 'Read-only management cannot read'; END IF;
  BEGIN
    PERFORM public.move_management_container(container,NULL,'2027-02-01',NULL,'EUR',NULL);
    RAISE EXCEPTION 'Read-only management moved container';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
UPDATE public.profiles SET role='viewer' WHERE id='35000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.management_containers) OR EXISTS(SELECT 1 FROM public.management_container_movements)
    OR EXISTS(SELECT 1 FROM public.management_container_assets) OR EXISTS(SELECT 1 FROM public.management_container_summaries)
    OR EXISTS(SELECT 1 FROM public.management_available_container_assets) THEN RAISE EXCEPTION 'RLS bypass'; END IF;
END; $$;
\echo 'PASS: container registry, movement history, membership uniqueness, conservative removal, physical sync, economic invariance, RLS and aggregate audit'
ROLLBACK;
