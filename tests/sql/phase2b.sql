\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO auth.users(id,email) VALUES
 ('22000000-0000-4000-8000-000000000001','work-admin@simisrl.eu'),
 ('22000000-0000-4000-8000-000000000002','work-office@simisrl.eu'),
 ('22000000-0000-4000-8000-000000000003','work-tech@simisrl.eu'),
 ('22000000-0000-4000-8000-000000000004','work-viewer@simisrl.eu'),
 ('22000000-0000-4000-8000-000000000005','work-hr@simisrl.eu'),
 ('22000000-0000-4000-8000-000000000006','work-disabled@simisrl.eu');
UPDATE public.profiles SET role=CASE right(id::text,1) WHEN '1' THEN 'admin' WHEN '2' THEN 'administration' WHEN '3' THEN 'technical' WHEN '5' THEN 'hr' ELSE 'viewer' END,active=right(id::text,1)<>'6' WHERE id::text LIKE '22000000%';
INSERT INTO public.companies(id,company_type,business_name) VALUES('22000000-0000-4000-8000-000000000010','both','Work company');
INSERT INTO public.projects(id,project_code,name,legal_entity_id) SELECT '22000000-0000-4000-8000-000000000011','WORK-1','Work project',id FROM public.legal_entities WHERE code='SIMI-IT';
INSERT INTO public.employees(id,first_name,last_name,legal_entity_id) SELECT '22000000-0000-4000-8000-000000000012','Work','HR secret',id FROM public.legal_entities WHERE code='SIMI-IT';
INSERT INTO public.documents(id,original_filename,stored_filename,storage_path,title,legal_entity_id,expiry_date,employee_id,access_scope)
SELECT ('22000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'work.pdf','work.pdf','work/'||n,'Work document '||n,id,CURRENT_DATE-1,CASE WHEN n=14 THEN '22000000-0000-4000-8000-000000000012'::uuid END,CASE WHEN n=14 THEN 'hr' ELSE 'general' END FROM public.legal_entities CROSS JOIN generate_series(13,14)n WHERE code='SIMI-IT';
INSERT INTO public.invoices(id,invoice_type,invoice_number,legal_entity_id,supplier_id,amount_net,amount_total,currency,due_date,project_required)
SELECT ('22000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'purchase','WORK-INV-'||n,id,'22000000-0000-4000-8000-000000000010',100,100,'EUR',CURRENT_DATE-2,n=15 FROM public.legal_entities CROSS JOIN generate_series(15,16)n WHERE code='SIMI-IT';
INSERT INTO public.invoice_installments(id,invoice_id,due_date,amount) VALUES('22000000-0000-4000-8000-000000000017','22000000-0000-4000-8000-000000000016',CURRENT_DATE-2,80);
INSERT INTO public.deadlines(id,title,due_date,legal_entity_id,employee_id) SELECT '22000000-0000-4000-8000-000000000018','HR appointment',CURRENT_DATE,id,'22000000-0000-4000-8000-000000000012' FROM public.legal_entities WHERE code='SIMI-IT';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE entity uuid; task uuid; payload jsonb; a uuid; total int; o uuid; d uuid; ol uuid; offer uuid; contract uuid; movement uuid; links jsonb; BEGIN
 SELECT id INTO entity FROM public.legal_entities WHERE code='SIMI-IT';
 PERFORM pg_temp.assert(public.app_has_permission('future.capability'),'admin wildcard');
 PERFORM public.sync_anomalies();
 SELECT count(*) INTO total FROM public.anomalies;PERFORM public.sync_anomalies();
 PERFORM pg_temp.assert((SELECT count(*) FROM public.anomalies)=total,'Stable deduplication');
 PERFORM pg_temp.assert((SELECT count(*) FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.invoice_id='22000000-0000-4000-8000-000000000015' AND a.code='invoice.project_required')=1,'Explicit project requirement');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.invoice_id='22000000-0000-4000-8000-000000000016' AND a.code='invoice.project_required'),'No invented requirement');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.anomalies WHERE code='invoice.installments'),'Legacy installment mismatch');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.anomalies WHERE code='invoice.overdue'),'Overdue residual');
 SELECT a.id INTO a FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.invoice_id='22000000-0000-4000-8000-000000000015' AND code='invoice.project_required';
 BEGIN PERFORM public.update_anomaly(a,'ignore',NULL,'   ');RAISE EXCEPTION 'Ignored without reason';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Motivazione obbligatoria' THEN RAISE; END IF; END;
 PERFORM public.update_anomaly(a,'assign','22000000-0000-4000-8000-000000000002');
 PERFORM public.update_anomaly(a,'ignore',NULL,'In attesa di conferma');PERFORM public.sync_anomalies();
 PERFORM pg_temp.assert((SELECT status='ignored' AND reason='In attesa di conferma' FROM public.anomalies WHERE id=a),'Ignore persists');
 payload=jsonb_build_object('title','Chiarire fattura','description','Lavoro reale','notes','Nota','legal_entity_id',entity,'assigned_to','22000000-0000-4000-8000-000000000002','priority','urgent','due_date',CURRENT_DATE-1,'status','todo','anomaly_id',a,'records','[]'::jsonb);
 task=public.save_task(payload);
 PERFORM pg_temp.assert((SELECT count(*) FROM public.task_records WHERE task_id=task)=1,'Anomaly source inherited');
 PERFORM pg_temp.assert((SELECT anomaly_id=a AND origin='anomaly' AND created_by=auth.uid() AND due_date=CURRENT_DATE-1 FROM public.tasks WHERE id=task),'Task origin and due date');
 payload=payload||jsonb_build_object('id',task,'revision',0,'status','completed');PERFORM public.save_task(payload);
 PERFORM pg_temp.assert((SELECT completed_at IS NOT NULL AND status='completed' FROM public.tasks WHERE id=task),'Completion stamp');
 BEGIN PERFORM public.save_task(payload);RAISE EXCEPTION 'Stale task accepted';EXCEPTION WHEN serialization_failure THEN NULL;END;
 payload=payload||jsonb_build_object('revision',1,'status','in_progress');PERFORM public.save_task(payload);
 PERFORM pg_temp.assert((SELECT completed_at IS NULL FROM public.tasks WHERE id=task),'Reopen clears completion');
 PERFORM public.archive_task(task,true);PERFORM pg_temp.assert((SELECT archived_at IS NOT NULL FROM public.tasks WHERE id=task),'Archive');PERFORM public.archive_task(task,false);
 PERFORM public.save_invoice((SELECT to_jsonb(i)||jsonb_build_object('expected_updated_at',i.updated_at,'counterparty_id',i.supplier_id,'lines','[]'::jsonb,'installments','[]'::jsonb,'project_ids',jsonb_build_array('22000000-0000-4000-8000-000000000011')) FROM public.invoices i WHERE i.id='22000000-0000-4000-8000-000000000015'));
 PERFORM public.sync_anomalies();PERFORM pg_temp.assert((SELECT status='resolved' AND resolved_at IS NOT NULL FROM public.anomalies WHERE id=a),'Automatic resolution even ignored');
 PERFORM public.save_invoice((SELECT to_jsonb(i)||jsonb_build_object('expected_updated_at',i.updated_at,'counterparty_id',i.supplier_id,'lines','[]'::jsonb,'installments','[]'::jsonb,'project_ids','[]'::jsonb) FROM public.invoices i WHERE i.id='22000000-0000-4000-8000-000000000015'));PERFORM public.sync_anomalies();
 PERFORM pg_temp.assert((SELECT status='open' AND resolved_at IS NULL FROM public.anomalies WHERE id=a),'Same identity reopens');
 movement=public.save_financial_movement(jsonb_build_object('direction','payment','legal_entity_id',entity,'counterparty_id','22000000-0000-4000-8000-000000000010','movement_date',CURRENT_DATE,'amount',100,'currency','EUR','allocations',jsonb_build_array(jsonb_build_object('invoice_id','22000000-0000-4000-8000-000000000015','amount',100))));
 PERFORM public.sync_anomalies();PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.invoice_id='22000000-0000-4000-8000-000000000015' AND a.code='invoice.overdue' AND a.status='resolved'),'Paid invoice resolves');
 -- Existing commercial rules are the only source of quantitative calculations.
 o=public.save_order(jsonb_build_object('order_number','WORK-ORDER','order_type','purchase','status','confirmed','legal_entity_id',entity,'counterparty_id','22000000-0000-4000-8000-000000000010','order_date',CURRENT_DATE,'currency','EUR','lines',jsonb_build_array(jsonb_build_object('description','Materiale','quantity',10,'unit','pz','unit_price',1))));
 PERFORM public.sync_anomalies();PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.order_id=o AND a.code='commercial.not_delivered' AND severity='info'),'Confirmed undelivered informational');
 SELECT id INTO ol FROM public.order_lines WHERE order_id=o;
 d=public.save_delivery_note(jsonb_build_object('note_number','WORK-DDT','note_date',CURRENT_DATE,'direction','inbound','legal_entity_id',entity,'counterparty_id','22000000-0000-4000-8000-000000000010','lines',jsonb_build_array(jsonb_build_object('description','Materiale','quantity',11,'unit','pz','order_line_id',ol))));
 PERFORM public.sync_anomalies();PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.order_id=o AND a.code='commercial.overdelivery' AND a.status='open'),'Overdelivery central');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.order_id=o AND a.code='commercial.not_delivered' AND a.status='resolved'),'Delivery resolves missing delivery');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.delivery_note_id=d AND a.code='commercial.not_invoiced'),'DDT not invoiced');
 PERFORM public.set_commercial_invoice('delivery_note',d,'22000000-0000-4000-8000-000000000015',true);PERFORM public.sync_anomalies();
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.delivery_note_id=d AND a.code='commercial.not_invoiced' AND a.status='resolved'),'DDT invoicing resolves');
 offer=public.save_offer(jsonb_build_object('offer_number','WORK-OFFER','legal_entity_id',entity,'counterparty_id','22000000-0000-4000-8000-000000000010','lines',jsonb_build_array(jsonb_build_object('description','Offer item','quantity',1,'unit_price',10,'amount_net',10,'amount_total',10))));
 contract=public.save_contract(jsonb_build_object('reference','WORK-CONTRACT','title','Contract','legal_entity_id',entity,'counterparty_id','22000000-0000-4000-8000-000000000010'));
 links=jsonb_build_array(jsonb_build_object('kind','project','id','22000000-0000-4000-8000-000000000011'),jsonb_build_object('kind','invoice','id','22000000-0000-4000-8000-000000000015'),jsonb_build_object('kind','document','id','22000000-0000-4000-8000-000000000013'),jsonb_build_object('kind','company','id','22000000-0000-4000-8000-000000000010'),jsonb_build_object('kind','employee','id','22000000-0000-4000-8000-000000000012'),jsonb_build_object('kind','deadline','id','22000000-0000-4000-8000-000000000018'),jsonb_build_object('kind','installment','id','22000000-0000-4000-8000-000000000017'),jsonb_build_object('kind','order','id',o),jsonb_build_object('kind','delivery_note','id',d),jsonb_build_object('kind','offer','id',offer),jsonb_build_object('kind','contract','id',contract),jsonb_build_object('kind','movement','id',movement));
 task=public.save_task(jsonb_build_object('title','All structured relations','legal_entity_id',entity,'records',links));
 PERFORM pg_temp.assert((SELECT count(*) FROM public.task_records WHERE task_id=task)=12,'All 12 FK source kinds');
 PERFORM set_config('test.work_private_task',task::text,true);
 PERFORM set_config('test.work_entity',entity::text,true);
 SELECT a.id INTO a FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.document_id='22000000-0000-4000-8000-000000000014';
 PERFORM set_config('test.work_hr_anomaly',a::text,true);
 task=public.save_task(jsonb_build_object('title','Private HR followup','legal_entity_id',entity,'anomaly_id',a,'assigned_to','22000000-0000-4000-8000-000000000003'));
 PERFORM public.update_anomaly(a,'ignore',NULL,'Rinnovo previsto');
 UPDATE public.documents SET expiry_date=CURRENT_DATE+10 WHERE id='22000000-0000-4000-8000-000000000014';PERFORM public.sync_anomalies();
 PERFORM pg_temp.assert((SELECT status='open' FROM public.anomalies WHERE id=a),'Expiry context change reopens');
 UPDATE public.documents SET expiry_date=CURRENT_DATE+60 WHERE id='22000000-0000-4000-8000-000000000014';PERFORM public.sync_anomalies();
 PERFORM pg_temp.assert((SELECT status='resolved' FROM public.anomalies WHERE id=a),'Renewal resolves');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='tasks' AND new_data->>'status'='completed'),'Completion audited');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='anomalies' AND new_data->>'status'='ignored'),'Ignore audited');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='anomalies' AND old_data->>'status'='resolved' AND new_data->>'status'='open'),'Reopen audited');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='tasks' AND new_data->>'archived_at' IS NOT NULL),'Archive audited');
 BEGIN UPDATE public.tasks SET created_by='22000000-0000-4000-8000-000000000002' WHERE id=task;RAISE EXCEPTION 'Direct task mutation allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000003',true);
DO $$ DECLARE tid uuid; BEGIN
 PERFORM public.sync_anomalies();
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=current_setting('test.work_private_task')::uuid),'HR linked task invisible');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.tasks WHERE title='Private HR followup'),'HR task invisible even assigned');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.anomalies WHERE id=current_setting('test.work_hr_anomaly')::uuid),'HR anomaly invisible');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.anomalies a JOIN public.work_records r ON r.id=a.record_id WHERE r.invoice_id IS NOT NULL),'Technical invoice anomalies invisible');
 BEGIN PERFORM public.register_work_record('document','22000000-0000-4000-8000-000000000014');RAISE EXCEPTION 'HR source registered';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.save_task(jsonb_build_object('title','Leak','legal_entity_id',current_setting('test.work_entity'),'anomaly_id',current_setting('test.work_hr_anomaly')));RAISE EXCEPTION 'HR source task created';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.save_task(jsonb_build_object('title','Bad assignment','legal_entity_id',current_setting('test.work_entity'),'assigned_to','22000000-0000-4000-8000-000000000002'));RAISE EXCEPTION 'Technical assigned another';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 tid=public.save_task(jsonb_build_object('title','Technical own work','legal_entity_id',current_setting('test.work_entity'),'assigned_to',auth.uid()));
 PERFORM pg_temp.assert((SELECT assigned_to=auth.uid() FROM public.tasks WHERE id=tid),'Technical self assignment');
 BEGIN PERFORM public.update_anomaly((SELECT id FROM public.anomalies LIMIT 1),'ignore',NULL,'Unauthorized');RAISE EXCEPTION 'Technical ignored';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000004',true);
DO $$ BEGIN
 BEGIN PERFORM public.save_task('{}');RAISE EXCEPTION 'Viewer task write';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.archive_task(current_setting('test.work_private_task')::uuid,true);RAISE EXCEPTION 'Viewer archive';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.task_records WHERE task_id=current_setting('test.work_private_task')::uuid),'Relation privacy');
END $$;
SELECT set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.anomalies WHERE id=current_setting('test.work_hr_anomaly')::uuid),'Administration HR privacy');
SELECT set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000005',true);
SELECT pg_temp.assert(EXISTS(SELECT 1 FROM public.anomalies WHERE id=current_setting('test.work_hr_anomaly')::uuid),'HR can read own domain anomaly');
SELECT set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000006',true);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.tasks) AND NOT EXISTS(SELECT 1 FROM public.anomalies),'Disabled user cannot read');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.sync_anomalies();RAISE EXCEPTION 'Anonymous sync';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
ROLLBACK;
\echo 'PASS: phase2b tasks, all FK links, assignment, completion, archive, optimistic locking, stable anomalies, resolution, ignore, finance, commercial, HR privacy, RBAC and audit'
