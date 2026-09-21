-- Disposable browser database only.
INSERT INTO public.invoices(id,invoice_type,invoice_number,legal_entity_id,supplier_id,amount_net,amount_total,vat_amount,currency,due_date,project_required)
SELECT '2b000000-0000-4000-8000-000000000001','purchase','E2E-WORK-REQUIRED',id,'25000000-0000-4000-8000-000000000001',100,100,0,'EUR',CURRENT_DATE-1,true FROM public.legal_entities WHERE code='SIMI-IT'
ON CONFLICT(id) DO UPDATE SET project_required=true,due_date=CURRENT_DATE-1;
INSERT INTO public.documents(id,title,original_filename,stored_filename,storage_path,legal_entity_id,expiry_date)
SELECT '2b000000-0000-4000-8000-000000000002','E2E Work expired document','work.pdf','work.pdf','e2e/work.pdf',id,CURRENT_DATE-1 FROM public.legal_entities WHERE code='SIMI-IT' ON CONFLICT(id) DO NOTHING;
