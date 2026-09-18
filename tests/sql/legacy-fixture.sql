INSERT INTO auth.users(id,email) VALUES('10000000-0000-4000-8000-000000000001','legacy@simisrl.eu');
INSERT INTO public.profiles(id,email,role,active) VALUES('10000000-0000-4000-8000-000000000001','legacy@simisrl.eu','admin',false);
INSERT INTO public.legal_entities(id,code,business_name,country) VALUES('20000000-0000-4000-8000-000000000001','SIMI-IT','Existing legal name','Italia');
INSERT INTO public.projects(id,project_code,name,customer_id) VALUES('30000000-0000-4000-8000-000000000001','LEGACY','Existing project','99999999-9999-4999-8999-999999999999');
INSERT INTO public.invoices(id,invoice_type,invoice_number,legal_entity_id,project_id,amount_net,vat_amount,amount_total) VALUES('40000000-0000-4000-8000-000000000001','purchase','LEGACY','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',100,22,122);
INSERT INTO public.documents(id,original_filename,stored_filename,storage_path,employee_id) VALUES('50000000-0000-4000-8000-000000000001','legacy.pdf','legacy.pdf','legacy.pdf','88888888-8888-4888-8888-888888888888');
