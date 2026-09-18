\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('12000000-0000-4000-8000-000000000001','docsadmin@simisrl.eu'),('12000000-0000-4000-8000-000000000002','docsviewer@simisrl.eu'),('12000000-0000-4000-8000-000000000003','docshr@simisrl.eu'),('12000000-0000-4000-8000-000000000004','docstech@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='12000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role='hr' WHERE id='12000000-0000-4000-8000-000000000003';
UPDATE public.profiles SET role='technical' WHERE id='12000000-0000-4000-8000-000000000004';
INSERT INTO public.companies(id,company_type,business_name) VALUES('22000000-0000-4000-8000-000000000001','both','Controparte documenti');
INSERT INTO public.projects(id,project_code,name,legal_entity_id) SELECT ('32000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'DOC-'||n,'Commessa documenti',(SELECT id FROM public.legal_entities WHERE code='SIMI-IT') FROM generate_series(1,2) n;
INSERT INTO public.invoices(id,invoice_type,invoice_number,legal_entity_id,supplier_id) SELECT '62000000-0000-4000-8000-000000000001','purchase','DOC-INVOICE',id,'22000000-0000-4000-8000-000000000001' FROM public.legal_entities WHERE code='SIMI-IT';
INSERT INTO public.invoice_projects VALUES('62000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE payload jsonb; d record; v record; pending record; original uuid; hash text:=repeat('a',64); BEGIN
 payload=jsonb_build_object('title','Contratto operativo','status','valid','access_scope','general','legal_entity_id',(SELECT id FROM public.legal_entities WHERE code='SIMI-IT'),'category_id',(SELECT id FROM public.document_categories WHERE code='01'),'assigned_to',auth.uid(),'reference','REF-1071','document_date',CURRENT_DATE);
 SELECT * INTO d FROM public.reserve_document_upload('originale.pdf','application/pdf',100,hash,'2026-09-18 - Contratto - Operativo.pdf',payload);
 PERFORM set_config('test.doc',d.document_id::text,true);original=d.version_id;
 BEGIN PERFORM public.finalize_document_version(d.version_id);RAISE EXCEPTION 'finalized missing object';EXCEPTION WHEN check_violation THEN NULL;END;
 INSERT INTO storage.objects(bucket_id,name) VALUES('simi-documents',d.storage_path);
 PERFORM public.finalize_document_version(d.version_id);
 IF NOT public.document_storage_access(d.storage_path,'read') THEN RAISE EXCEPTION 'signed URL access contract denied'; END IF;
 IF EXISTS(SELECT 1 FROM public.operational_deadlines WHERE id='document:'||d.document_id) THEN RAISE EXCEPTION 'deadline without expiry'; END IF;
 PERFORM public.link_document_context(d.document_id,'32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001');
 PERFORM public.link_document_context(d.document_id,'32000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001');
 IF NOT EXISTS(SELECT 1 FROM public.document_register WHERE id=d.document_id AND cardinality(project_ids)=2 AND cardinality(company_ids)=1 AND cardinality(invoice_ids)=1 AND search_text LIKE '%DOC-1%' AND search_text LIKE '%Controparte documenti%' AND reference='REF-1071') THEN RAISE EXCEPTION 'typed contexts or search'; END IF;
 payload=payload||jsonb_build_object('expiry_date',CURRENT_DATE-1);
 PERFORM public.save_document_metadata(d.document_id,payload);
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE id='document:'||d.document_id AND temporal_status='overdue' AND source='document') THEN RAISE EXCEPTION 'expired deadline missing'; END IF;
 IF (SELECT count(*) FROM public.operational_deadlines WHERE document_id=d.document_id AND source='document')<>1 THEN RAISE EXCEPTION 'duplicate generated deadlines'; END IF;
 PERFORM public.save_document_metadata(d.document_id,payload||jsonb_build_object('expiry_date',CURRENT_DATE+5));
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE id='document:'||d.document_id AND temporal_status='soon' AND due_date=CURRENT_DATE+5) THEN RAISE EXCEPTION 'deadline date not updated'; END IF;
 PERFORM public.save_document_metadata(d.document_id,payload||jsonb_build_object('status','superseded'));
 IF EXISTS(SELECT 1 FROM public.operational_deadlines WHERE id='document:'||d.document_id) THEN RAISE EXCEPTION 'superseded generates alert'; END IF;
 PERFORM public.save_document_metadata(d.document_id,payload);
 SELECT * INTO v FROM public.reserve_document_upload('firmata.pdf','application/pdf',100,hash,'2026-09-18 - Contratto - Firmato.pdf','{}',d.document_id,'Firmata','Versione firmata');
 IF (SELECT current_version_id FROM public.documents WHERE id=d.document_id)<>original THEN RAISE EXCEPTION 'pending replaced current'; END IF;
 INSERT INTO storage.objects(bucket_id,name) VALUES('simi-documents',v.storage_path);
 BEGIN PERFORM public.finalize_document_version(v.version_id);RAISE EXCEPTION 'duplicate not acknowledged';EXCEPTION WHEN unique_violation THEN NULL;END;
 PERFORM public.finalize_document_version(v.version_id,true);
 IF NOT EXISTS(SELECT 1 FROM public.documents WHERE id=d.document_id AND current_version_id=v.version_id AND original_filename='firmata.pdf' AND normalized_filename='2026-09-18 - Contratto - Firmato.pdf') THEN RAISE EXCEPTION 'current version'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.document_versions WHERE id=original AND original_filename='originale.pdf' AND file_state='ready') OR NOT public.document_storage_access(d.storage_path,'read') THEN RAISE EXCEPTION 'old version lost'; END IF;
 IF (SELECT count(*) FROM public.document_versions WHERE content_hash=hash AND file_state='ready')<>2 THEN RAISE EXCEPTION 'hash lookup'; END IF;
 PERFORM public.finalize_document_version(v.version_id,true);
 IF (SELECT count(*) FROM public.document_versions WHERE document_id=d.document_id)<>2 OR (SELECT count(*) FROM public.operational_deadlines WHERE id='document:'||d.document_id)<>1 THEN RAISE EXCEPTION 'idempotency'; END IF;
 SELECT * INTO pending FROM public.reserve_document_upload('failure.pdf','application/pdf',100,repeat('b',64),'2026-09-18 - Documento - Failure.pdf','{}',d.document_id);
 PERFORM public.fail_document_version(pending.version_id);
 IF (SELECT file_state FROM public.document_versions WHERE id=pending.version_id)<>'failed' OR (SELECT current_version_id FROM public.documents WHERE id=d.document_id)<>v.version_id THEN RAISE EXCEPTION 'failed upload changed current'; END IF;
 PERFORM public.set_document_archive(d.document_id,true);
 IF EXISTS(SELECT 1 FROM public.operational_deadlines WHERE id='document:'||d.document_id) OR public.document_storage_access(v.storage_path,'read') THEN RAISE EXCEPTION 'archive visibility'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.document_register WHERE id=d.document_id AND display_status='archived') THEN RAISE EXCEPTION 'archive history lost'; END IF;
 PERFORM public.set_document_archive(d.document_id,false);
 IF NOT public.document_storage_access(v.storage_path,'read') THEN RAISE EXCEPTION 'restore file'; END IF;
 IF (SELECT count(*) FROM public.document_events(d.document_id))<10 THEN RAISE EXCEPTION 'audit missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_document_categories('32000000-0000-4000-8000-000000000001') WHERE code='01' AND items=1) OR NOT EXISTS(SELECT 1 FROM public.project_document_categories('32000000-0000-4000-8000-000000000001') WHERE code='00' AND items=0) THEN RAISE EXCEPTION 'category tree'; END IF;
 -- Sensitive document: hash, versions, event feed and generated deadlines all remain private.
 SELECT * INTO v FROM public.reserve_document_upload('hr.pdf','application/pdf',100,repeat('c',64),'2026-09-18 - Documento - HR.pdf',payload||jsonb_build_object('title','Privato HR','access_scope','hr'));
 INSERT INTO storage.objects(bucket_id,name) VALUES('simi-documents',v.storage_path);PERFORM public.finalize_document_version(v.version_id);
 PERFORM set_config('test.hr_doc',v.document_id::text,true);PERFORM set_config('test.hr_path',v.storage_path,true);
 SELECT * INTO v FROM public.reserve_document_upload('reserved.pdf','application/pdf',100,repeat('d',64),'2026-09-18 - Documento - Riservato.pdf',payload||jsonb_build_object('title','Riservato','access_scope','restricted'));
 INSERT INTO storage.objects(bucket_id,name) VALUES('simi-documents',v.storage_path);PERFORM public.finalize_document_version(v.version_id);
 PERFORM set_config('test.restricted_doc',v.document_id::text,true);
END $$;
-- Exercise the actual phase1 invoice RPC with an existing shared document.
DO $$ DECLARE inv uuid; entity uuid; payload jsonb; pending record; BEGIN
 SELECT id INTO entity FROM public.legal_entities WHERE code='SIMI-IT';
 payload=jsonb_build_object('invoice_type','purchase','invoice_number','PDF-INTEGRATION','legal_entity_id',entity,'counterparty_id','22000000-0000-4000-8000-000000000001','amount_net',100,'vat_amount',0,'amount_total',100,'vat_rate',0,'status','received','currency','EUR','invoice_date',CURRENT_DATE,'document_id',current_setting('test.doc'),'lines','[]'::jsonb,'installments','[]'::jsonb,'project_ids',jsonb_build_array('32000000-0000-4000-8000-000000000002'));
 inv=public.save_invoice_phase1(payload);
 IF NOT EXISTS(SELECT 1 FROM public.document_invoice_context WHERE document_id=current_setting('test.doc')::uuid AND invoice_id=inv) THEN RAISE EXCEPTION 'invoice RPC PDF missing from archive contexts'; END IF;
 IF (SELECT count(*) FROM public.operational_deadlines WHERE source='document' AND document_id=current_setting('test.doc')::uuid)<>1 THEN RAISE EXCEPTION 'invoice multiplied document expiry'; END IF;
 SELECT * INTO pending FROM public.reserve_document('not-uploaded.pdf','application/pdf',100,entity);
 BEGIN PERFORM public.save_invoice_phase1(payload||jsonb_build_object('invoice_number','NO-OBJECT','document_id',pending.id));RAISE EXCEPTION 'invoice finalized absent Storage object';EXCEPTION WHEN check_violation THEN NULL;END;
END $$;
-- Invoice's authoritative PDF relation derives all contexts without another file.
RESET ROLE;
UPDATE public.invoices SET document_id=current_setting('test.doc')::uuid WHERE id='62000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.document_invoice_context WHERE document_id=current_setting('test.doc')::uuid AND invoice_id='62000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'invoice PDF relation duplicated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.document_register WHERE id=current_setting('test.doc')::uuid AND search_text LIKE '%originale.pdf%') THEN RAISE EXCEPTION 'historical filename not searchable'; END IF;
 BEGIN PERFORM public.reserve_document('../bad.pdf','application/pdf',100,NULL); RAISE EXCEPTION 'path traversal filename accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.reserve_document('wrong.png','application/pdf',100,NULL); RAISE EXCEPTION 'extension accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.document_register WHERE id IN (current_setting('test.hr_doc')::uuid,current_setting('test.restricted_doc')::uuid)) OR EXISTS(SELECT 1 FROM public.document_versions WHERE content_hash=repeat('c',64)) OR EXISTS(SELECT 1 FROM public.operational_deadlines WHERE id='document:'||current_setting('test.hr_doc')) OR EXISTS(SELECT 1 FROM public.document_events(current_setting('test.hr_doc')::uuid)) OR public.document_storage_access(current_setting('test.hr_path'),'read') THEN RAISE EXCEPTION 'HR/privacy leaked'; END IF;
 BEGIN UPDATE public.document_versions SET original_filename='forged.pdf'; RAISE EXCEPTION 'version mutable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.document_register WHERE id=current_setting('test.doc')::uuid) THEN RAISE EXCEPTION 'viewer cannot read'; END IF;
 BEGIN PERFORM public.reserve_document('deny.pdf','application/pdf',100,NULL);RAISE EXCEPTION 'viewer upload allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.set_document_archive(current_setting('test.doc')::uuid,true);RAISE EXCEPTION 'viewer archive allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.link_document_context(current_setting('test.doc')::uuid,'32000000-0000-4000-8000-000000000002');RAISE EXCEPTION 'viewer link allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.document_register WHERE id=current_setting('test.hr_doc')::uuid) OR NOT public.document_storage_access(current_setting('test.hr_path'),'read') OR EXISTS(SELECT 1 FROM public.document_register WHERE id=current_setting('test.restricted_doc')::uuid) THEN RAISE EXCEPTION 'HR scope'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000004',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.document_register WHERE id=current_setting('test.hr_doc')::uuid) OR EXISTS(SELECT 1 FROM public.document_invoices) THEN RAISE EXCEPTION 'technical HR or invoice link leak'; END IF;
 BEGIN PERFORM public.link_document_context(current_setting('test.doc')::uuid,NULL,NULL,'62000000-0000-4000-8000-000000000001');RAISE EXCEPTION 'technical invoice link allowed';EXCEPTION WHEN check_violation THEN NULL;END;
END $$;
\echo 'PASS: phase1d upload, versions, duplicates, contexts, search, expiry, archive, restore, RLS/RBAC, Storage access and audit'
ROLLBACK;
