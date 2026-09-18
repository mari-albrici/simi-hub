-- Local disposable integration database only. Never run against an operational project.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
INSERT INTO auth.users(id,email) VALUES('15000000-0000-4000-8000-000000000001','e2e@simisrl.eu');
UPDATE public.profiles SET role='admin',first_name='Test',last_name='Locale' WHERE id='15000000-0000-4000-8000-000000000001';
INSERT INTO public.companies(id,company_type,business_name) VALUES('25000000-0000-4000-8000-000000000001','supplier','Fornitore test locale');
INSERT INTO public.projects(id,project_code,name,legal_entity_id) SELECT '35000000-0000-4000-8000-000000000001','E2E-01','Commessa test locale',id FROM public.legal_entities WHERE code='SIMI-IT';
INSERT INTO public.invoices(id,invoice_type,invoice_number,invoice_date,legal_entity_id,supplier_id,currency,amount_net,amount_total) SELECT '65000000-0000-4000-8000-000000000001','purchase','E2E-INV',CURRENT_DATE,id,'25000000-0000-4000-8000-000000000001','EUR',1000,1000 FROM public.legal_entities WHERE code='SIMI-IT';
INSERT INTO public.invoice_lines(id,invoice_id,description,quantity,unit,project_id,unit_price,amount_net,amount_total) VALUES('75000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','Materiale E2E',100,'pz','35000000-0000-4000-8000-000000000001',10,1000,1000);
INSERT INTO public.invoice_projects VALUES('65000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001');
