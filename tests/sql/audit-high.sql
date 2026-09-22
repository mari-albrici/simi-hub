\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;

INSERT INTO auth.users(id,email) VALUES
 ('24000000-0000-4000-8000-000000000001','audit-admin@simisrl.eu'),
 ('24000000-0000-4000-8000-000000000002','audit-office@simisrl.eu'),
 ('24000000-0000-4000-8000-000000000003','audit-tech@simisrl.eu'),
 ('24000000-0000-4000-8000-000000000004','audit-hr@simisrl.eu'),
 ('24000000-0000-4000-8000-000000000005','audit-viewer@simisrl.eu');
UPDATE public.profiles SET role=CASE right(id::text,1) WHEN '1' THEN 'admin' WHEN '2' THEN 'administration' WHEN '3' THEN 'technical' WHEN '4' THEN 'hr' ELSE 'viewer' END WHERE id::text LIKE '24000000%';
INSERT INTO public.companies(id,company_type,business_name) VALUES('24000000-0000-4000-8000-000000000010','both','Audit company');
INSERT INTO public.projects(id,project_code,name,legal_entity_id,cig,cup)
SELECT ('24000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'AUDIT-'||n,'Audit project',id,'CIG-'||n,'CUP-'||n
FROM public.legal_entities CROSS JOIN generate_series(11,12)n WHERE code='SIMI-IT';
INSERT INTO public.employees(id,first_name,last_name,legal_entity_id)
SELECT '24000000-0000-4000-8000-000000000013','Audit','Employee',id FROM public.legal_entities WHERE code='SIMI-IT';
INSERT INTO public.documents(id,original_filename,stored_filename,storage_path,title,legal_entity_id,expiry_date,employee_id,access_scope,status)
SELECT ('24000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'audit.pdf','audit.pdf','audit/'||n,'Audit document '||n,id,CURRENT_DATE+5,
 CASE WHEN n=15 THEN '24000000-0000-4000-8000-000000000013'::uuid END,CASE WHEN n=15 THEN 'hr' ELSE 'general' END,'valid'
FROM public.legal_entities CROSS JOIN generate_series(14,15)n WHERE code='SIMI-IT';
INSERT INTO public.document_projects(document_id,project_id) VALUES
 ('24000000-0000-4000-8000-000000000014','24000000-0000-4000-8000-000000000011'),
 ('24000000-0000-4000-8000-000000000015','24000000-0000-4000-8000-000000000011');
INSERT INTO public.deadlines(id,title,due_date,legal_entity_id,employee_id,project_id)
SELECT '24000000-0000-4000-8000-000000000016','Private HR deadline',CURRENT_DATE+5,id,'24000000-0000-4000-8000-000000000013','24000000-0000-4000-8000-000000000011'
FROM public.legal_entities WHERE code='SIMI-IT';
INSERT INTO public.invoices(id,invoice_type,invoice_number,legal_entity_id,supplier_id,amount_net,amount_total,currency,due_date,status)
SELECT ('24000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'purchase','AUDIT-INV-'||n,id,'24000000-0000-4000-8000-000000000010',200,200,
 CASE WHEN n=19 THEN 'USD' ELSE 'EUR' END,CURRENT_DATE+5,'to_pay'
FROM public.legal_entities CROSS JOIN generate_series(17,19)n WHERE code='SIMI-IT';
INSERT INTO public.invoice_lines(invoice_id,position,description,quantity,unit_price,vat_rate,amount_net,amount_vat,amount_total,project_id)
SELECT ('24000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,pos,'Audit line',1,100,0,100,0,100,
 CASE WHEN n=18 AND pos=1 THEN '24000000-0000-4000-8000-000000000012'::uuid ELSE '24000000-0000-4000-8000-000000000011'::uuid END
FROM generate_series(17,18)n CROSS JOIN generate_series(0,1)pos;
INSERT INTO public.invoice_projects(invoice_id,project_id) VALUES
 ('24000000-0000-4000-8000-000000000017','24000000-0000-4000-8000-000000000011'),
 ('24000000-0000-4000-8000-000000000018','24000000-0000-4000-8000-000000000011'),
 ('24000000-0000-4000-8000-000000000018','24000000-0000-4000-8000-000000000012');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE entity uuid; movement uuid; s jsonb; BEGIN
 SELECT id INTO entity FROM public.legal_entities WHERE code='SIMI-IT';
 PERFORM pg_temp.assert(public.app_has_permission('future.capability'),'Admin wildcard preserved');
 UPDATE public.projects SET cig='UPDATED-CIG',cup='UPDATED-CUP' WHERE id='24000000-0000-4000-8000-000000000011';
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.projects WHERE cig='UPDATED-CIG' AND cup='UPDATED-CUP'),'CIG/CUP writes');
 movement:=public.save_financial_movement(jsonb_build_object('direction','payment','legal_entity_id',entity,'counterparty_id','24000000-0000-4000-8000-000000000010','movement_date',CURRENT_DATE,'amount',50,'currency','EUR','allocations',jsonb_build_array(jsonb_build_object('invoice_id','24000000-0000-4000-8000-000000000017','amount',50))));
 PERFORM set_config('test.audit_movement',movement::text,true);
 s:=public.project_operational_summary('24000000-0000-4000-8000-000000000011');
 PERFORM pg_temp.assert((s->>'documents')::int=2 AND (s->>'invoices')::int=2,'Admin sees own permitted aggregates');
 PERFORM pg_temp.assert(jsonb_array_length(s->'financial')=1 AND (s->'financial'->0->>'original')::numeric=200 AND (s->'financial'->0->>'settled')::numeric=50 AND (s->'financial'->0->>'residual')::numeric=150,'Two lines: payment counted once');
 PERFORM pg_temp.assert((s->>'unattributed_invoices')::int=1,'Mixed invoice explicitly excluded');
 s:=public.project_operational_summary('24000000-0000-4000-8000-000000000012');
 PERFORM pg_temp.assert(s->'financial'='[]'::jsonb AND (s->>'unattributed_invoices')::int=1,'Other project cannot reuse the same invoice payment');
 -- Notes-only updates must be available through the replayed 023 definition.
 PERFORM public.save_document_metadata('24000000-0000-4000-8000-000000000014','{"notes":"Audit note"}');
 PERFORM pg_temp.assert((SELECT notes='Audit note' FROM public.documents WHERE id='24000000-0000-4000-8000-000000000014'),'Notes API preserved');
END $$;

-- Database-side privacy, not just page guards.
SELECT set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000002',true);
DO $$ DECLARE entity uuid; s jsonb; changed int; BEGIN
 SELECT id INTO entity FROM public.legal_entities WHERE code='SIMI-IT';
 PERFORM pg_temp.assert(NOT public.app_has_permission('employee.read') AND NOT public.app_has_permission('employee.create') AND NOT public.app_has_permission('employee.update') AND NOT public.app_has_permission('employee.archive'),'Application/SQL administration parity');
 PERFORM pg_temp.assert(public.app_has_permission('task.create') AND public.app_has_permission('invoice.update'),'Unrelated permissions preserved');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.employees WHERE id='24000000-0000-4000-8000-000000000013'),'Employee RLS references corrected function');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.deadlines WHERE id='24000000-0000-4000-8000-000000000016'),'HR deadline hidden');
 UPDATE public.deadlines SET notes='Not allowed' WHERE id='24000000-0000-4000-8000-000000000016'; GET DIAGNOSTICS changed=ROW_COUNT;
 PERFORM pg_temp.assert(changed=0,'HR deadline update denied');
 BEGIN
   INSERT INTO public.deadlines(title,due_date,legal_entity_id,employee_id) VALUES('Forbidden',CURRENT_DATE,entity,'24000000-0000-4000-8000-000000000013');
   RAISE EXCEPTION 'HR deadline insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.archive_employee('24000000-0000-4000-8000-000000000013',true);RAISE EXCEPTION 'Employee archive allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 s:=public.project_operational_summary('24000000-0000-4000-8000-000000000011');
 PERFORM pg_temp.assert((s->>'documents')::int=1 AND (s->>'open_deadlines')::int=3,'Office aggregates exclude private document/manual deadline');
END $$;
SELECT set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000003',true);
DO $$ DECLARE s jsonb; BEGIN
 s:=public.project_operational_summary('24000000-0000-4000-8000-000000000011');
 PERFORM pg_temp.assert(s->'financial'='[]'::jsonb AND (s->>'invoices')::int=0 AND (s->>'unattributed_invoices')::int=0,'Technical cannot obtain financial aggregates');
 PERFORM pg_temp.assert((s->>'documents')::int=1 AND (s->>'open_deadlines')::int=1,'Technical sees only public document deadline');
END $$;
SELECT set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000004',true);
DO $$ DECLARE s jsonb; BEGIN
 PERFORM pg_temp.assert(public.app_has_permission('employee.hr.read'),'HR retains access');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.deadlines WHERE id='24000000-0000-4000-8000-000000000016'),'HR sees manual deadline');
 UPDATE public.deadlines SET notes='HR note' WHERE id='24000000-0000-4000-8000-000000000016';
 s:=public.project_operational_summary('24000000-0000-4000-8000-000000000011');
 PERFORM pg_temp.assert((s->>'documents')::int=2 AND (s->>'open_deadlines')::int=3 AND s->'financial'='[]'::jsonb,'HR summary obeys each source permission');
END $$;

SELECT set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE entity uuid; payload jsonb; total bigint; movement uuid:=current_setting('test.audit_movement')::uuid; BEGIN
 SELECT id INTO entity FROM public.legal_entities WHERE code='SIMI-IT';
 SELECT count(*) INTO total FROM public.financial_movements;
 payload:=jsonb_build_object('direction','payment','legal_entity_id',entity,'movement_date',CURRENT_DATE,'amount',50,'currency','USD','allocations',jsonb_build_array(jsonb_build_object('invoice_id','24000000-0000-4000-8000-000000000017','amount',50)));
 BEGIN PERFORM public.save_financial_movement(payload);RAISE EXCEPTION 'Cross-currency allocation allowed';EXCEPTION WHEN check_violation THEN NULL;END;
 PERFORM pg_temp.assert((SELECT count(*) FROM public.financial_movements)=total,'Invalid movement rolled back');
 BEGIN PERFORM public.save_financial_movement(payload||jsonb_build_object('id',movement));RAISE EXCEPTION 'Currency edit retained incompatible allocations';EXCEPTION WHEN check_violation THEN NULL;END;
 PERFORM pg_temp.assert((SELECT currency='EUR' FROM public.financial_movements WHERE id=movement),'Failed edit retains currency');
 SELECT to_jsonb(i)||jsonb_build_object('currency','USD','counterparty_id',i.supplier_id,'expected_updated_at',i.updated_at,'lines',(SELECT jsonb_agg(to_jsonb(l)) FROM public.invoice_lines l WHERE l.invoice_id=i.id),'installments','[]'::jsonb,'project_ids',jsonb_build_array('24000000-0000-4000-8000-000000000011'))
 INTO payload FROM public.invoices i WHERE id='24000000-0000-4000-8000-000000000017';
 BEGIN
   PERFORM public.save_invoice_phase1(payload);
   SET CONSTRAINTS invoice_settlement_currency IMMEDIATE;
   RAISE EXCEPTION 'Allocated invoice currency changed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 PERFORM pg_temp.assert((SELECT currency='EUR' FROM public.invoices WHERE id='24000000-0000-4000-8000-000000000017'),'Invoice edit rolled back');
 -- A legitimate change with allocations removed is still allowed atomically.
 PERFORM public.save_financial_movement(jsonb_build_object('id',movement,'direction','payment','legal_entity_id',entity,'movement_date',CURRENT_DATE,'amount',50,'currency','USD','allocations','[]'::jsonb));
 SET CONSTRAINTS ALL IMMEDIATE;
 PERFORM pg_temp.assert((SELECT currency='USD' FROM public.financial_movements WHERE id=movement) AND NOT EXISTS(SELECT 1 FROM public.financial_allocations WHERE movement_id=movement),'Unallocated currency edit allowed');
 -- New allocations in the matching foreign currency remain supported.
 PERFORM public.save_financial_movement(jsonb_build_object('id',movement,'direction','payment','legal_entity_id',entity,'movement_date',CURRENT_DATE,'amount',50,'currency','USD','allocations',jsonb_build_array(jsonb_build_object('invoice_id','24000000-0000-4000-8000-000000000019','amount',50))));
 SET CONSTRAINTS ALL DEFERRED;
END $$;

DO $$ DECLARE entity uuid; contract uuid; deadline uuid; registry uuid; task uuid; stamp timestamptz; payload jsonb; BEGIN
 SELECT id INTO entity FROM public.legal_entities WHERE code='SIMI-IT';
 payload:=jsonb_build_object('reference','AUDIT-CONTRACT','title','Audit contract','legal_entity_id',entity,'expires_at',CURRENT_DATE+30,'project_ids','[]'::jsonb);
 contract:=public.save_contract(payload);
 SELECT id INTO deadline FROM public.deadlines WHERE contract_id=contract;
 task:=public.save_task(jsonb_build_object('title','Renew contract','legal_entity_id',entity,'records',jsonb_build_array(jsonb_build_object('kind','deadline','id',deadline))));
 SELECT id INTO registry FROM public.work_records WHERE deadline_id=deadline;
 UPDATE public.deadlines SET status='completed',notes='Keep this note',assigned_to=auth.uid() WHERE id=deadline RETURNING completed_at INTO stamp;
 PERFORM public.save_contract(payload||jsonb_build_object('id',contract,'reference','AUDIT-CONTRACT-RENAMED','expires_at',CURRENT_DATE+60));
 PERFORM pg_temp.assert((SELECT count(*) FROM public.deadlines WHERE contract_id=contract)=1,'Contract update preserves deadline identity');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.deadlines WHERE id=deadline AND status='completed' AND completed_at=stamp AND notes='Keep this note' AND due_date=CURRENT_DATE+60 AND assigned_to=auth.uid()),'Deadline state/notes/assignee preserved');
 PERFORM public.archive_contract(contract);
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.deadlines WHERE id=deadline AND archived_at IS NOT NULL),'Contract archive keeps deadline');
 PERFORM public.archive_contract(contract,true);
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.deadlines WHERE id=deadline AND archived_at IS NULL AND status='completed'),'Contract restore reuses same deadline');
 PERFORM public.save_contract(payload||jsonb_build_object('id',contract,'expires_at',NULL));
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.deadlines WHERE id=deadline AND archived_at IS NOT NULL),'Removing expiry archives instead of deleting');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.task_records WHERE task_id=task AND record_id=registry),'Task reference survives every contract change');
END $$;

DO $$ DECLARE entity uuid; first_offer uuid; second_offer uuid; payload jsonb; BEGIN
 SELECT id INTO entity FROM public.legal_entities WHERE code='SIMI-IT';
 payload:=jsonb_build_object('offer_number','AUDIT-OFFER','revision',0,'legal_entity_id',entity,'currency','EUR','lines',jsonb_build_array(jsonb_build_object('description','Original line','quantity',1,'unit_price',100,'vat_rate',0)));
 first_offer:=public.save_offer(payload);
 second_offer:=public.save_offer(payload||jsonb_build_object('offer_group_id',first_offer,'revision',1));
 PERFORM pg_temp.assert(first_offer<>second_offer AND (SELECT count(*) FROM public.offers WHERE offer_number='AUDIT-OFFER')=2,'New revision creates a distinct row');
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.offers WHERE id=first_offer AND revision=0 AND NOT is_current) AND EXISTS(SELECT 1 FROM public.offers WHERE id=second_offer AND revision=1 AND is_current AND offer_group_id=first_offer),'Exactly the new revision is current');
 PERFORM pg_temp.assert((SELECT count(*) FROM public.offer_lines WHERE offer_id IN(first_offer,second_offer))=2,'Historical lines preserved');
 BEGIN PERFORM public.save_offer(payload||jsonb_build_object('offer_group_id',first_offer,'revision',1));RAISE EXCEPTION 'Duplicate revision allowed';EXCEPTION WHEN unique_violation THEN NULL;END;
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.offers WHERE id=second_offer AND is_current),'Failed revision rolls back retirement of current row');
 PERFORM set_config('test.audit_offer',second_offer::text,true);
END $$;
SELECT set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000005',true);
DO $$ BEGIN
 BEGIN PERFORM public.save_offer(jsonb_build_object('offer_number','AUDIT-OFFER'));RAISE EXCEPTION 'Viewer can publish';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM pg_temp.assert(EXISTS(SELECT 1 FROM public.offers WHERE id=current_setting('test.audit_offer')::uuid AND is_current),'Denied save does not retire current revision');
END $$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
\echo 'PASS: HIGH audit fixes, RLS, project balances, currency guards, stable contract deadlines and offer revisions'
