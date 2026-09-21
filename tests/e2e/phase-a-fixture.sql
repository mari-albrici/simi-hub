-- Disposable integration database only, after fixture.sql.
INSERT INTO public.employees(first_name,last_name,employee_code,legal_entity_id,country,status)
SELECT 'Phase A',lpad(n::text,3,'0'),'PHASE-A-'||n,(SELECT id FROM public.legal_entities WHERE code='SIMI-IT'),'IT','active' FROM generate_series(1,127) n;
INSERT INTO public.employees(first_name,last_name,legal_entity_id,country,status)
SELECT 'Excluded','FR',(SELECT id FROM public.legal_entities WHERE code='SIMI-IT'),'FR','active';
INSERT INTO public.tasks(legal_entity_id,title,status,assigned_to,created_by,due_date,completed_at,archived_at)
SELECT (SELECT id FROM public.legal_entities WHERE code='SIMI-IT'),'PHASE-A-TASK-'||n,CASE WHEN n=3 THEN 'completed' WHEN n=2 THEN 'in_progress' ELSE 'todo' END,
CASE WHEN n=5 THEN NULL ELSE '15000000-0000-4000-8000-000000000001'::uuid END,'15000000-0000-4000-8000-000000000001',CASE WHEN n=1 THEN CURRENT_DATE ELSE CURRENT_DATE+20 END,CASE WHEN n=3 THEN now() END,CASE WHEN n=4 THEN now() END FROM generate_series(1,5) n;
INSERT INTO public.deadlines(title,due_date,legal_entity_id,priority,status)
SELECT 'PHASE-A-DUE-'||n,CASE WHEN n=1 THEN CURRENT_DATE-1 WHEN n=2 THEN CURRENT_DATE WHEN n=3 THEN CURRENT_DATE+7 ELSE CURRENT_DATE+8 END,(SELECT id FROM public.legal_entities WHERE code='SIMI-IT'),'medium',CASE WHEN n=5 THEN 'completed' ELSE 'open' END FROM generate_series(1,5) n;
INSERT INTO public.invoices(invoice_type,invoice_number,legal_entity_id,amount_net,amount_total,currency,due_date)
SELECT 'purchase','PHASE-A-USD',(SELECT id FROM public.legal_entities WHERE code='SIMI-IT'),700,700,'USD',CURRENT_DATE+3;
