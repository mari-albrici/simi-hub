-- Run as migration owner after migrations 001-036.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('36000000-0000-4000-8000-000000000001','consumables@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='36000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','36000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE item uuid; zero_item uuid; first_container uuid; second_container uuid; project uuid; entity uuid;
 consumption uuid; primary_before jsonb; stock_before jsonb; total_before numeric; movement_count bigint; cost_count bigint;
BEGIN
 SELECT id INTO STRICT entity FROM public.legal_entities WHERE code='SIMI-IT';
 INSERT INTO public.projects(project_code,name,legal_entity_id) VALUES('P15-P','Consumi test',entity) RETURNING id INTO project;
 INSERT INTO public.management_containers(container_code,name) VALUES('P15-C1','Origine') RETURNING id INTO first_container;
 INSERT INTO public.management_containers(container_code,name) VALUES('P15-C2','Destinazione') RETURNING id INTO second_container;
 INSERT INTO public.management_consumable_items(item_code,name,unit,default_unit_cost) VALUES('P15-I','Materiale','pcs',2.2) RETURNING id INTO item;
 INSERT INTO public.cost_entries(source_type,cost_date,description,amount) VALUES('manual','2027-01-01','Acquisto originario',850);
 SELECT jsonb_agg(to_jsonb(r) ORDER BY r.currency) INTO primary_before FROM public.management_reconciliation_summary() r;
 SELECT count(*) INTO cost_count FROM public.cost_entries;
 PERFORM public.record_consumable_movement(item,'load',NULL,first_container,NULL,100,2,'2027-01-01',NULL);
 PERFORM public.record_consumable_movement(item,'load',NULL,first_container,NULL,100,4,'2027-01-02',NULL);
 IF NOT EXISTS(SELECT 1 FROM public.management_container_consumables WHERE container_id=first_container AND item_id=item AND quantity=200 AND unit_cost=3) THEN RAISE EXCEPTION 'Weighted load failed'; END IF;
 PERFORM public.record_consumable_movement(item,'load',NULL,second_container,NULL,50,5,'2027-01-02',NULL);
 SELECT sum(stock_value) INTO total_before FROM public.management_consumable_stock_details WHERE item_id=item;
 PERFORM public.record_consumable_movement(item,'transfer',first_container,second_container,NULL,50,999,'2027-01-03',NULL);
 IF (SELECT sum(stock_value) FROM public.management_consumable_stock_details WHERE item_id=item)<>total_before
 OR NOT EXISTS(SELECT 1 FROM public.management_container_consumables WHERE item_id=item AND container_id=second_container AND quantity=100 AND unit_cost=4) THEN RAISE EXCEPTION 'Transfer changed value or weighted cost'; END IF;
 IF (public.project_management_cost_summary(project)->>'totalCost')::numeric<>0 THEN RAISE EXCEPTION 'Load/transfer created project cost'; END IF;
 consumption:=public.record_consumable_movement(item,'consumption',first_container,NULL,project,120,999,'2027-01-04',NULL);
 IF NOT EXISTS(SELECT 1 FROM public.management_consumable_movements WHERE id=consumption AND amount=360 AND unit_cost=3)
 OR (public.project_management_cost_summary(project)->>'totalCost')::numeric<>360 THEN RAISE EXCEPTION 'Consumption snapshot or project total incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_management_allocations WHERE id=consumption AND category_name='Consumabili' AND source_type='consumable' AND cost_entry_id IS NULL) THEN RAISE EXCEPTION 'Consumption projection missing'; END IF;
 PERFORM public.record_consumable_movement(item,'load',NULL,first_container,NULL,30,5,'2027-01-05',NULL);
 IF NOT EXISTS(SELECT 1 FROM public.management_container_consumables WHERE item_id=item AND container_id=first_container AND quantity=60 AND unit_cost=4)
 OR (SELECT unit_cost FROM public.management_consumable_movements WHERE id=consumption)<>3 THEN RAISE EXCEPTION 'Historical cost changed'; END IF;
 PERFORM public.record_consumable_movement(item,'adjustment',NULL,first_container,NULL,10,NULL,'2027-01-06','Rettifica aumento');
 PERFORM public.record_consumable_movement(item,'adjustment',first_container,NULL,NULL,5,NULL,'2027-01-06','Rettifica riduzione');
 IF (SELECT quantity FROM public.management_container_consumables WHERE item_id=item AND container_id=first_container)<>65 THEN RAISE EXCEPTION 'Adjustment failed'; END IF;
 BEGIN
  PERFORM public.record_consumable_movement(item,'consumption',first_container,NULL,project,66,NULL,'2027-01-07',NULL);
  RAISE EXCEPTION 'Negative inventory accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.record_consumable_movement(item,'transfer',first_container,second_container,NULL,66,NULL,'2027-01-07',NULL);
  RAISE EXCEPTION 'Transfer overdraft accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.record_consumable_movement(item,'adjustment',first_container,NULL,NULL,66,NULL,'2027-01-07','Troppo');
  RAISE EXCEPTION 'Adjustment overdraft accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.record_consumable_movement(item,'adjustment',first_container,NULL,NULL,1,NULL,'2027-01-07',NULL);
  RAISE EXCEPTION 'Adjustment without reason accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.record_consumable_movement(item,'transfer',first_container,first_container,NULL,1,NULL,'2027-01-07',NULL);
  RAISE EXCEPTION 'Self transfer accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) INTO stock_before FROM public.management_container_consumables s WHERE item_id=item;
 SELECT count(*) INTO movement_count FROM public.management_consumable_movements;
 PERFORM public.move_management_container(first_container,project,'2027-01-07',100,'EUR',NULL);
 IF (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.management_container_consumables s WHERE item_id=item) IS DISTINCT FROM stock_before
 OR (SELECT count(*) FROM public.management_consumable_movements)<>movement_count THEN RAISE EXCEPTION 'Physical container move consumed/transferred stock'; END IF;
 IF (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.currency) FROM public.management_reconciliation_summary() r) IS DISTINCT FROM primary_before
 OR (SELECT count(*) FROM public.cost_entries)<>cost_count OR (public.project_management_cost_summary(project)->>'totalCost')::numeric<>360 THEN RAISE EXCEPTION 'Double counting or primary reconciliation changed'; END IF;
 BEGIN
  UPDATE public.management_consumable_items SET unit='kg' WHERE id=item;
  RAISE EXCEPTION 'Unit changed after movement';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  UPDATE public.management_container_consumables SET quantity=1000 WHERE item_id=item;
  RAISE EXCEPTION 'Direct stock mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  DELETE FROM public.management_consumable_movements WHERE id=consumption;
  RAISE EXCEPTION 'Historical consumption deleted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- A failure after decrementing origin must roll back the entire transfer.
 INSERT INTO public.management_consumable_items(item_code,name,unit) VALUES('P15-Z','Zero cost test','pcs') RETURNING id INTO zero_item;
 PERFORM public.record_consumable_movement(zero_item,'load',NULL,first_container,NULL,1,0,'2027-01-01',NULL);
 PERFORM public.record_consumable_movement(zero_item,'load',NULL,second_container,NULL,99999999999.999,0,'2027-01-01',NULL);
 SELECT count(*) INTO movement_count FROM public.management_consumable_movements;
 BEGIN
  PERFORM public.record_consumable_movement(zero_item,'transfer',first_container,second_container,NULL,1,NULL,'2027-01-02',NULL);
  RAISE EXCEPTION 'Destination quantity overflow accepted';
 EXCEPTION WHEN numeric_value_out_of_range THEN NULL; END;
 IF (SELECT quantity FROM public.management_container_consumables WHERE item_id=zero_item AND container_id=first_container)<>1
 OR (SELECT count(*) FROM public.management_consumable_movements)<>movement_count THEN RAISE EXCEPTION 'Partial transfer committed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='management_consumable_movements' AND entity_id=consumption AND action='insert') THEN RAISE EXCEPTION 'Audit missing'; END IF;
END; $$;
RESET ROLE;
UPDATE public.profiles SET role='management' WHERE id='36000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.management_consumable_items WHERE item_code='P15-I') THEN RAISE EXCEPTION 'Read-only access failed'; END IF;
 BEGIN
  PERFORM public.record_consumable_movement(gen_random_uuid(),'load',NULL,gen_random_uuid(),NULL,1,1,'2027-01-01',NULL);
  RAISE EXCEPTION 'Read-only mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
UPDATE public.profiles SET role='viewer' WHERE id='36000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.management_consumable_items) OR EXISTS(SELECT 1 FROM public.management_container_consumables)
 OR EXISTS(SELECT 1 FROM public.management_consumable_movements) OR EXISTS(SELECT 1 FROM public.management_consumption_summary()) THEN RAISE EXCEPTION 'RLS bypass'; END IF;
END; $$;
\echo 'PASS: load, weighted cost, transfer valuation, consumption snapshot, stock limits, adjustment, rollback, logistics separation, summaries, audit and RLS'
ROLLBACK;
