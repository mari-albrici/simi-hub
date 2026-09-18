\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('16000000-0000-4000-8000-000000000001','invoicehotfix@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='16000000-0000-4000-8000-000000000001';
INSERT INTO public.companies(id,company_type,business_name) VALUES('26000000-0000-4000-8000-000000000001','supplier','Hotfix supplier');
INSERT INTO public.projects(id,project_code,name,legal_entity_id) SELECT ('36000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'HF-'||n,'Hotfix project '||n,e.id FROM public.legal_entities e CROSS JOIN generate_series(1,2)n WHERE e.code='SIMI-IT';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE e uuid; inv uuid; line uuid; p1 uuid; p2 uuid; payload jsonb; BEGIN
 SELECT id INTO e FROM public.legal_entities WHERE code='SIMI-IT'; SELECT id INTO p1 FROM public.projects WHERE project_code='HF-1'; SELECT id INTO p2 FROM public.projects WHERE project_code='HF-2';
 payload=jsonb_build_object('invoice_type','purchase','invoice_number','HF-001','esolver_registration_number','REG-0007/A','legal_entity_id',e,'counterparty_id','26000000-0000-4000-8000-000000000001','invoice_date',CURRENT_DATE,'status','registered','currency','EUR','amount_net',90,'vat_amount',19.80,'amount_total',109.80,'vat_rate',22,'project_ids',jsonb_build_array(p1),'lines',jsonb_build_array(jsonb_build_object('description','Sconto','quantity',1,'unit_price',100,'discount',10,'vat_rate',22,'amount_net',90,'amount_vat',19.80,'amount_total',109.80,'project_id',p1)),'installments',jsonb_build_array(jsonb_build_object('due_date',CURRENT_DATE+30,'amount',109.80,'paid',false)));
 inv=public.save_invoice_phase1(payload); SELECT id INTO line FROM public.invoice_lines WHERE invoice_id=inv;
 IF (SELECT esolver_registration_number FROM public.invoices WHERE id=inv)<>'REG-0007/A' THEN RAISE EXCEPTION 'eSolver reference not saved'; END IF;
 IF (SELECT amount_net FROM public.invoice_lines WHERE id=line)<>90 OR (SELECT amount_vat FROM public.invoice_lines WHERE id=line)<>19.80 THEN RAISE EXCEPTION 'discount/VAT mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.invoice_projects WHERE invoice_id=inv AND project_id=p1) THEN RAISE EXCEPTION 'header project missing'; END IF;
 payload=payload||jsonb_build_object('id',inv,'expected_updated_at',(SELECT updated_at FROM public.invoices WHERE id=inv),'esolver_registration_number','REG-0008','project_ids',jsonb_build_array(p1,p2),'lines',jsonb_build_array(jsonb_build_object('id',line,'description','Sconto','quantity',1,'unit_price',100,'discount',10,'vat_rate',22,'amount_net',90,'amount_vat',19.80,'amount_total',109.80,'project_id',p1)));
 inv=public.save_invoice_phase1(payload);
 IF (SELECT count(*) FROM public.invoice_projects WHERE invoice_id=inv)<>2 OR (SELECT esolver_registration_number FROM public.invoices WHERE id=inv)<>'REG-0008' THEN RAISE EXCEPTION 'edit project/eSolver failed'; END IF;
 payload=payload||jsonb_build_object('expected_updated_at',(SELECT updated_at FROM public.invoices WHERE id=inv),'project_ids',jsonb_build_array(p2),'lines',jsonb_build_array(jsonb_build_object('id',line,'description','Sconto','quantity',1,'unit_price',100,'discount',10,'vat_rate',22,'amount_net',90,'amount_vat',19.80,'amount_total',109.80,'project_id',p2))); PERFORM public.save_invoice_phase1(payload);
 IF EXISTS(SELECT 1 FROM public.invoice_projects WHERE invoice_id=inv AND project_id=p1) OR NOT EXISTS(SELECT 1 FROM public.invoice_projects WHERE invoice_id=inv AND project_id=p2) THEN RAISE EXCEPTION 'project replacement/removal failed'; END IF;
 -- Negative quantity and monetary values remain signed and mathematically coherent.
 payload=jsonb_build_object('invoice_type','purchase','invoice_number','HF-NEG','legal_entity_id',e,'counterparty_id','26000000-0000-4000-8000-000000000001','status','registered','currency','EUR','amount_net',-100,'vat_amount',-22,'amount_total',-122,'vat_rate',22,'project_ids','[]'::jsonb,'lines',jsonb_build_array(jsonb_build_object('description','Rettifica','quantity',-1,'unit_price',100,'discount',0,'vat_rate',22,'amount_net',-100,'amount_vat',-22,'amount_total',-122)),'installments',jsonb_build_array(jsonb_build_object('due_date',CURRENT_DATE+30,'amount',-122,'paid',false)));
 inv=public.save_invoice_phase1(payload);
 IF (SELECT amount_total FROM public.invoices WHERE id=inv)<>-122 OR (SELECT quantity FROM public.invoice_lines WHERE invoice_id=inv)<>-1 THEN RAISE EXCEPTION 'negative values not persisted'; END IF;
END $$;
\echo 'PASS: invoice hotfix eSolver, invoice_projects, percentage discount, VAT and signed values'
ROLLBACK;
