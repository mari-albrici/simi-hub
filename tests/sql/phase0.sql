\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('10000000-0000-4000-8000-000000000001','admin@simisrl.eu'),
 ('10000000-0000-4000-8000-000000000002','viewer@simisrl.eu'),
 ('10000000-0000-4000-8000-000000000003','hr@simisrl.eu'),
 ('10000000-0000-4000-8000-000000000004','technical@simisrl.eu'),
 ('10000000-0000-4000-8000-000000000005','disabled@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='10000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role='hr' WHERE id='10000000-0000-4000-8000-000000000003';
UPDATE public.profiles SET role='technical' WHERE id='10000000-0000-4000-8000-000000000004';
UPDATE public.profiles SET active=false WHERE id='10000000-0000-4000-8000-000000000005';
INSERT INTO public.companies(id,company_type,business_name) VALUES('20000000-0000-4000-8000-000000000001','both','SQL Test');
INSERT INTO public.projects(id,project_code,name,customer_id) VALUES
 ('30000000-0000-4000-8000-000000000001','SQL-1','SQL Test','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','SQL-2','SQL Test','20000000-0000-4000-8000-000000000001');
INSERT INTO public.employees(id,first_name,last_name) VALUES('40000000-0000-4000-8000-000000000001','Test','HR');
INSERT INTO public.documents(id,original_filename,stored_filename,storage_path,employee_id) VALUES
 ('50000000-0000-4000-8000-000000000001','private.pdf','private.pdf','private.pdf','40000000-0000-4000-8000-000000000001');
INSERT INTO storage.objects(bucket_id,name) VALUES('simi-documents','private.pdf');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.legal_entities)<>3 THEN RAISE EXCEPTION 'Legal entities unreadable'; END IF;
 IF EXISTS(SELECT 1 FROM public.employees) OR EXISTS(SELECT 1 FROM public.documents WHERE id='50000000-0000-4000-8000-000000000001') OR EXISTS(SELECT 1 FROM storage.objects WHERE name='private.pdf') THEN RAISE EXCEPTION 'HR leaked to viewer'; END IF;
 BEGIN UPDATE public.profiles SET role='admin' WHERE id=auth.uid(); RAISE EXCEPTION 'Privilege escalation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.profiles SET active=false WHERE id=auth.uid(); RAISE EXCEPTION 'Active change allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.activity_logs(user_id,entity_type,action) VALUES(auth.uid(),'test','forged'); RAISE EXCEPTION 'Forged audit allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.projects(project_code,name) VALUES('FORBIDDEN','Forbidden'); RAISE EXCEPTION 'Viewer write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.save_invoice('{}'); RAISE EXCEPTION 'Viewer RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('simi-documents','unreserved.pdf'); RAISE EXCEPTION 'Unreserved upload allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
SELECT public.ensure_my_profile();
DO $$ BEGIN IF (SELECT active FROM public.profiles WHERE id=auth.uid()) OR public.app_role() IS NOT NULL THEN RAISE EXCEPTION 'Disabled user reactivated'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN IF (SELECT count(*) FROM public.employees)<>1 OR (SELECT count(*) FROM storage.objects WHERE name='private.pdf')<>1 THEN RAISE EXCEPTION 'HR cannot read HR records'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT public.ensure_my_profile();
DO $$ BEGIN IF public.app_role()<>'admin' THEN RAISE EXCEPTION 'Sync reset role'; END IF; END $$;
DO $$ BEGIN
 IF NOT public.app_has_permission('future.module.create') THEN RAISE EXCEPTION 'Admin wildcard permission missing'; END IF;
 IF NOT public.app_has_permission('document.upload') OR NOT public.app_has_permission('employee.read') OR NOT public.app_has_permission('admin.settings') THEN RAISE EXCEPTION 'Admin capability missing'; END IF;
END $$;
DO $$
#variable_conflict use_variable
DECLARE payload jsonb; invoice_id uuid; line_id uuid; installment_id uuid; stamp timestamptz; count_before integer; doc record;
BEGIN
 payload=jsonb_build_object('invoice_type','purchase','invoice_number','SQL-INVOICE','legal_entity_id',(SELECT id FROM public.legal_entities WHERE code='SIMI-IT'),
 'counterparty_id','20000000-0000-4000-8000-000000000001','new_counterparty',NULL,'invoice_date','2026-09-17','due_date','2026-10-17',
 'amount_net',100,'vat_amount',22,'amount_total',122,'vat_rate',22,'vat_exempt_reason',NULL,'payment_method','bank_transfer','status','to_register','notes','test',
 'project_ids',jsonb_build_array('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002'),
 'lines','[{"description":"Service","quantity":1,"unit_price":100,"vat_rate":22,"amount_net":100,"amount_vat":22,"amount_total":122,"project_id":"30000000-0000-4000-8000-000000000001"}]'::jsonb,
 'installments','[{"due_date":"2026-10-17","amount":122,"paid":false}]'::jsonb);
 invoice_id=public.save_invoice(payload);
 IF (SELECT count(*) FROM public.invoice_projects p WHERE p.invoice_id=invoice_id)<>2 THEN RAISE EXCEPTION 'Multicommessa not saved'; END IF;
 SELECT id INTO line_id FROM public.invoice_lines l WHERE l.invoice_id=invoice_id;
 SELECT id INTO installment_id FROM public.invoice_installments i WHERE i.invoice_id=invoice_id;
 SELECT updated_at INTO stamp FROM public.invoices WHERE id=invoice_id;
 payload=payload||jsonb_build_object('id',invoice_id,'expected_updated_at',stamp);
 payload=jsonb_set(payload,'{lines,0,id}',to_jsonb(line_id)); payload=jsonb_set(payload,'{installments,0,id}',to_jsonb(installment_id));
 PERFORM public.save_invoice(payload||'{"notes":"updated"}'::jsonb);
 IF NOT EXISTS(SELECT 1 FROM public.invoice_lines WHERE id=line_id) OR NOT EXISTS(SELECT 1 FROM public.invoice_installments WHERE id=installment_id) THEN RAISE EXCEPTION 'Detail IDs changed'; END IF;
 BEGIN PERFORM public.save_invoice(jsonb_set(payload,'{installments,0,amount}','121')); RAISE EXCEPTION 'Bad installment accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT amount FROM public.invoice_installments WHERE id=installment_id)<>122 OR (SELECT notes FROM public.invoices WHERE id=invoice_id)<>'updated' THEN RAISE EXCEPTION 'Failed save did not rollback'; END IF;
 BEGIN PERFORM public.save_invoice(payload||'{"expected_updated_at":"2000-01-01T00:00:00Z"}'); RAISE EXCEPTION 'Stale write accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN PERFORM public.save_invoice(jsonb_set(payload,'{lines,0,id}','"99999999-9999-4999-8999-999999999999"')); RAISE EXCEPTION 'Foreign detail accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.invoices SET amount_total=999 WHERE id=invoice_id; RAISE EXCEPTION 'Direct invoice mutation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT count(*) INTO count_before FROM public.invoices;
 BEGIN PERFORM public.save_invoice((payload-'id'-'expected_updated_at')||'{"lines":[],"installments":[{"due_date":"2026-10-17","amount":1,"paid":false}]}'); RAISE EXCEPTION 'Invalid new invoice accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT count(*) FROM public.invoices)<>count_before THEN RAISE EXCEPTION 'Partial header retained'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='invoices' AND entity_id=invoice_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Audit missing'; END IF;
 SELECT * INTO doc FROM public.reserve_document('test.pdf','application/pdf',100,NULL);
 BEGIN PERFORM public.finalize_document(doc.id); RAISE EXCEPTION 'Missing file finalized'; EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO storage.objects(bucket_id,name) VALUES('simi-documents',doc.storage_path);
 PERFORM public.finalize_document(doc.id);
 IF NOT public.document_storage_access(doc.storage_path,'read') THEN RAISE EXCEPTION 'Finalized file unavailable'; END IF;
 PERFORM public.archive_record('document',doc.id);
 IF public.document_storage_access(doc.storage_path,'read') THEN RAISE EXCEPTION 'Archived file accessible'; END IF;
 PERFORM set_config('test.archived_path',doc.storage_path,true);
 PERFORM public.archive_record('invoice',invoice_id);
 IF NOT EXISTS(SELECT 1 FROM public.invoice_lines WHERE id=line_id) THEN RAISE EXCEPTION 'Archive deleted details'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE name=current_setting('test.archived_path')) THEN RAISE EXCEPTION 'Archive deleted physical object'; END IF; END $$;
ROLLBACK;
\echo 'PASS: roles, profile sync, HR privacy, invoice transaction/rollback/IDs/concurrency, audit and document lifecycle'
