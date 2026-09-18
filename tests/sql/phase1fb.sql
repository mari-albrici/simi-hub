\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('15000000-0000-4000-8000-000000000001','cycleadmin@simisrl.eu'),('15000000-0000-4000-8000-000000000002','cycletech@simisrl.eu'),('15000000-0000-4000-8000-000000000003','cycleoffice@simisrl.eu'),('15000000-0000-4000-8000-000000000004','cycleviewer@simisrl.eu');
UPDATE public.profiles SET role=CASE right(id::text,1) WHEN '1' THEN 'admin' WHEN '2' THEN 'technical' WHEN '3' THEN 'administration' ELSE 'viewer' END WHERE id::text LIKE '15000000%';
INSERT INTO public.companies(id,company_type,business_name) VALUES('25000000-0000-4000-8000-000000000001','supplier','Cycle supplier');
INSERT INTO public.projects(id,project_code,name,legal_entity_id) SELECT ('35000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'CYCLE-'||n,'Cycle project',(SELECT id FROM public.legal_entities WHERE code='SIMI-IT') FROM generate_series(1,2)n;
INSERT INTO public.invoices(id,invoice_type,invoice_number,legal_entity_id,supplier_id,amount_total,amount_net,currency) SELECT ('65000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'purchase','CYCLE-INV-'||n,(SELECT id FROM public.legal_entities WHERE code='SIMI-IT'),'25000000-0000-4000-8000-000000000001',1500,1500,CASE n WHEN 3 THEN 'USD' ELSE 'EUR' END FROM generate_series(1,3)n;
INSERT INTO public.invoice_lines(id,invoice_id,description,quantity,unit,unit_price,amount_net,amount_total,project_id) VALUES('75000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','Materiale',150,'pz',10,1500,1500,'35000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE entity uuid; o uuid; d1 uuid; d2 uuid; standalone uuid; l uuid; dl uuid; op jsonb; dp jsonb; lines jsonb; doc record; version record; iid uuid:='65000000-0000-4000-8000-000000000001'; il uuid:='75000000-0000-4000-8000-000000000001'; BEGIN
 SELECT id INTO entity FROM public.legal_entities WHERE code='SIMI-IT';
 op=jsonb_build_object('order_number','CYCLE-100','order_type','purchase','status','confirmed','legal_entity_id',entity,'counterparty_id','25000000-0000-4000-8000-000000000001','order_date',CURRENT_DATE,'currency','EUR','project_ids',jsonb_build_array('35000000-0000-4000-8000-000000000002'),'lines',jsonb_build_array(jsonb_build_object('description','Materiale','quantity',100,'unit_price',10,'unit','pz','project_id','35000000-0000-4000-8000-000000000001')));
 o=public.save_order(op);SELECT id INTO l FROM public.order_lines WHERE order_id=o;
 IF (SELECT fulfillment_status FROM public.order_reconciliation WHERE id=o)<>'confirmed' THEN RAISE EXCEPTION 'confirmed/not delivered'; END IF;
 IF (SELECT severity FROM public.commercial_anomalies WHERE record_id=o AND code='not_delivered')<>'info' THEN RAISE EXCEPTION 'false positive no delivery'; END IF;
 IF (SELECT count(*) FROM public.order_projects WHERE order_id=o)<>2 THEN RAISE EXCEPTION 'multi project order'; END IF;
 dp=jsonb_build_object('note_number','CYCLE-DDT-40','note_date',CURRENT_DATE,'direction','inbound','legal_entity_id',entity,'counterparty_id','25000000-0000-4000-8000-000000000001','lines',jsonb_build_array(jsonb_build_object('description','Materiale','quantity',40,'unit','pz','project_id','35000000-0000-4000-8000-000000000001','order_line_id',l)));
 d1=public.save_delivery_note(dp);
 IF (SELECT remaining_quantity FROM public.order_line_progress WHERE id=l)<>60 OR (SELECT fulfillment_status FROM public.order_reconciliation WHERE id=o)<>'partially_fulfilled' THEN RAISE EXCEPTION '100-40=60'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_note_orders WHERE delivery_note_id=d1 AND order_id=o) THEN RAISE EXCEPTION 'derived header link'; END IF;
 d2=public.save_delivery_note(dp||jsonb_build_object('note_number','CYCLE-DDT-60','lines',jsonb_build_array((dp->'lines'->0)||jsonb_build_object('quantity',60))));
 IF (SELECT remaining_quantity FROM public.order_line_progress WHERE id=l)<>0 OR (SELECT fulfillment_status FROM public.order_reconciliation WHERE id=o)<>'fulfilled' THEN RAISE EXCEPTION '100-40-60 fulfilled'; END IF;
 SELECT id INTO dl FROM public.delivery_note_lines WHERE delivery_note_id=d2;
 PERFORM public.save_delivery_note(dp||jsonb_build_object('id',d2,'note_number','CYCLE-DDT-60','expected_updated_at',(SELECT updated_at FROM public.delivery_notes WHERE id=d2),'lines',jsonb_build_array((dp->'lines'->0)||jsonb_build_object('id',dl,'quantity',70))));
 IF (SELECT remaining_quantity FROM public.order_line_progress WHERE id=l)<>-10 OR (SELECT fulfillment_status FROM public.order_reconciliation WHERE id=o)<>'overdelivered' OR NOT EXISTS(SELECT 1 FROM public.commercial_anomalies WHERE record_id=o AND code='overdelivery' AND severity='anomaly') THEN RAISE EXCEPTION '100-110 overdelivery'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_note_lines WHERE id=dl AND quantity=70) THEN RAISE EXCEPTION 'DDT line ID changed'; END IF;
 -- Safe update retains line IDs; lowering below delivered is rejected.
 op=op||jsonb_build_object('id',o,'expected_updated_at',(SELECT updated_at FROM public.orders WHERE id=o),'lines',jsonb_build_array((op->'lines'->0)||jsonb_build_object('id',l)));
 PERFORM public.save_order(op||jsonb_build_object('notes','Safe edit'));
 BEGIN PERFORM public.save_order(op||jsonb_build_object('expected_updated_at',(SELECT updated_at FROM public.orders WHERE id=o),'lines',jsonb_build_array((op->'lines'->0)||jsonb_build_object('quantity',90)))); RAISE EXCEPTION 'reduced below delivered'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM public.save_order(op||jsonb_build_object('expected_updated_at',(SELECT updated_at FROM public.orders WHERE id=o),'lines',jsonb_build_array(jsonb_build_object('description','Replacement','quantity',100,'unit_price',10)))); RAISE EXCEPTION 'destroyed referenced line'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN PERFORM public.save_order(op||jsonb_build_object('expected_updated_at','2000-01-01T00:00:00Z')); RAISE EXCEPTION 'stale update'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM public.save_delivery_note(dp||jsonb_build_object('note_number','BAD-DIRECTION','direction','outbound')); RAISE EXCEPTION 'incompatible direction'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM public.save_delivery_note(dp||jsonb_build_object('note_number','BAD-ENTITY','legal_entity_id',(SELECT id FROM public.legal_entities WHERE code='SIMI-FR'))); RAISE EXCEPTION 'incompatible entity'; EXCEPTION WHEN check_violation THEN NULL; END;
 -- Header links, partial allocation and quantities are separate.
 PERFORM public.set_commercial_invoice('order',o,iid,true,1200);
 PERFORM public.set_commercial_invoice('delivery_note',d1,iid,true);
 PERFORM public.set_commercial_invoice('delivery_note',d2,iid,true);
 IF (SELECT count(*) FROM public.delivery_note_invoices WHERE invoice_id=iid)<>2 THEN RAISE EXCEPTION 'multiple DDT per invoice'; END IF;
 IF (SELECT invoiced_value FROM public.order_reconciliation WHERE id=o)<>1200 OR NOT EXISTS(SELECT 1 FROM public.commercial_anomalies WHERE record_id=o AND code='overinvoiced') THEN RAISE EXCEPTION 'invoice amount reconciliation'; END IF;
 BEGIN PERFORM public.set_commercial_invoice('order',o,'65000000-0000-4000-8000-000000000003',true,100); RAISE EXCEPTION 'mixed currency'; EXCEPTION WHEN check_violation THEN NULL; END;
 PERFORM public.set_commercial_invoice_line(jsonb_build_object('invoice_line_id',il,'delivery_note_line_id',(SELECT id FROM public.delivery_note_lines WHERE delivery_note_id=d1),'quantity',40));
 BEGIN PERFORM public.set_commercial_invoice('order',o,iid,false);RAISE EXCEPTION 'header unlink destroyed line mapping';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN PERFORM public.set_commercial_invoice_line(jsonb_build_object('invoice_line_id',il,'delivery_note_line_id',dl,'quantity',80));RAISE EXCEPTION 'over invoice DDT quantity';EXCEPTION WHEN check_violation THEN NULL;END;
 PERFORM public.set_commercial_invoice('delivery_note',d2,'65000000-0000-4000-8000-000000000002',true);
 PERFORM public.set_commercial_invoice('delivery_note',d2,'65000000-0000-4000-8000-000000000002',false);
 -- Archive recomputes delivery without deleting any history or invoice relation.
 PERFORM public.archive_delivery_note(d2);
 IF (SELECT remaining_quantity FROM public.order_line_progress WHERE id=l)<>60 OR (SELECT fulfillment_status FROM public.order_reconciliation WHERE id=o)<>'partially_fulfilled' THEN RAISE EXCEPTION 'archive did not recompute'; END IF;
 IF EXISTS(SELECT 1 FROM public.commercial_anomalies WHERE record_id=d2) OR NOT EXISTS(SELECT 1 FROM public.delivery_note_invoices WHERE delivery_note_id=d2 AND invoice_id=iid) THEN RAISE EXCEPTION 'archived anomaly/history'; END IF;
 -- Multiple rows / projects; amounts are attributed by row, never duplicated per project.
 op=op||jsonb_build_object('expected_updated_at',(SELECT updated_at FROM public.orders WHERE id=o),'lines',(op->'lines')||jsonb_build_array(jsonb_build_object('description','Altra commessa','quantity',5,'unit_price',20,'unit','pz','project_id','35000000-0000-4000-8000-000000000002')));
 PERFORM public.save_order(op);
 SELECT jsonb_agg(jsonb_build_object('description',description,'quantity',1,'unit',unit,'project_id',project_id,'order_line_id',id)) INTO lines FROM public.order_lines WHERE order_id=o;
 standalone=public.save_delivery_note(dp||jsonb_build_object('note_number','MULTI-DDT','lines',lines));
 IF (SELECT count(*) FROM public.delivery_note_projects WHERE delivery_note_id=standalone)<>2 THEN RAISE EXCEPTION 'multicommessa DDT'; END IF;
 IF (SELECT sum(amount_total) FROM public.order_lines WHERE order_id=o AND project_id='35000000-0000-4000-8000-000000000002')<>100 THEN RAISE EXCEPTION 'project amount duplicated'; END IF;
 standalone=public.save_delivery_note(dp||jsonb_build_object('note_number','NO-ORDER','lines',jsonb_build_array(jsonb_build_object('description','Trasporto libero','quantity',1))));
 IF EXISTS(SELECT 1 FROM public.commercial_anomalies WHERE record_id=standalone AND severity<>'info') OR NOT EXISTS(SELECT 1 FROM public.commercial_anomalies WHERE record_id=standalone AND code='no_order') THEN RAISE EXCEPTION 'standalone false positive'; END IF;
 -- Native document workflow: two cycle contexts, one physical version.
 SELECT * INTO doc FROM public.reserve_document_upload('ordine.pdf','application/pdf',100,repeat('e',64),'2026-09-18 - Ordine.pdf',jsonb_build_object('title','Allegato ciclo','status','valid','access_scope','general','legal_entity_id',entity,'category_id',(SELECT id FROM public.document_categories WHERE code='01')));
 PERFORM public.link_commercial_document(doc.document_id,'order',o);
 PERFORM public.link_commercial_document(doc.document_id,'delivery_note',d1);
 INSERT INTO storage.objects(bucket_id,name) VALUES('simi-documents',doc.storage_path);PERFORM public.finalize_document_version(doc.version_id);
 IF NOT EXISTS(SELECT 1 FROM public.document_register WHERE id=doc.document_id AND cardinality(project_ids)=2 AND cardinality(company_ids)=1) THEN RAISE EXCEPTION 'document contexts missing'; END IF;
 SELECT * INTO version FROM public.reserve_document_upload('firmato.pdf','application/pdf',100,repeat('f',64),'2026-09-18 - Ordine firmato.pdf','{}',doc.document_id,'Firmata');
 INSERT INTO storage.objects(bucket_id,name) VALUES('simi-documents',version.storage_path);PERFORM public.finalize_document_version(version.version_id);
 IF (SELECT count(*) FROM public.document_versions WHERE document_id=doc.document_id)<>2 OR NOT public.document_storage_access(doc.storage_path,'read') THEN RAISE EXCEPTION 'version history'; END IF;
 PERFORM public.archive_order(o);
 IF EXISTS(SELECT 1 FROM public.order_reconciliation WHERE id=o) OR NOT EXISTS(SELECT 1 FROM public.document_orders WHERE order_id=o) OR NOT EXISTS(SELECT 1 FROM public.order_invoices WHERE order_id=o) THEN RAISE EXCEPTION 'archive order history'; END IF;
 IF (SELECT count(*) FROM public.commercial_events('order',o))<10 THEN RAISE EXCEPTION 'audit absent'; END IF;
 IF NOT public.app_has_permission('future.capability') THEN RAISE EXCEPTION 'admin wildcard'; END IF;
 PERFORM set_config('test.cycle_order',o::text,true);PERFORM set_config('test.cycle_note',d1::text,true);PERFORM set_config('test.cycle_doc',doc.document_id::text,true);
END $$;
SELECT set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.orders) THEN RAISE EXCEPTION 'technical cannot read'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_invoices) OR EXISTS(SELECT 1 FROM public.commercial_invoice_lines) THEN RAISE EXCEPTION 'technical invoice leak'; END IF;
 BEGIN PERFORM public.save_order('{}');RAISE EXCEPTION 'technical write allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.archive_delivery_note(current_setting('test.cycle_note')::uuid);RAISE EXCEPTION 'technical archive';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.orders SET status='cancelled';RAISE EXCEPTION 'direct write bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN DELETE FROM public.delivery_notes;RAISE EXCEPTION 'hard delete';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.link_commercial_document(current_setting('test.cycle_doc')::uuid,'delivery_note',current_setting('test.cycle_note')::uuid);RAISE EXCEPTION 'document link bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN IF NOT public.app_has_permission('order.update') OR NOT public.app_has_permission('delivery_note.create') OR NOT public.app_has_permission('invoice.update') OR public.app_has_permission('order.delete') THEN RAISE EXCEPTION 'administration capabilities'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000004',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.orders) OR EXISTS(SELECT 1 FROM public.delivery_notes) OR EXISTS(SELECT 1 FROM public.commercial_events('order',current_setting('test.cycle_order')::uuid)) THEN RAISE EXCEPTION 'viewer RLS bypass'; END IF; END $$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
\echo 'PASS: 1F.1B stable IDs, partial/full/over delivery, archive, compatibility, multi-project, invoice links/quantities/currencies, native documents/versioning, anomaly severities, RBAC/RLS and audit'
ROLLBACK;
