\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('18000000-0000-4000-8000-000000000003','hr2@simisrl.eu');
UPDATE public.profiles SET role='hr',active=true WHERE id='18000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000003',true);
INSERT INTO public.employees(first_name,last_name,legal_entity_id,country,status,employment_level,contract_type)
SELECT 'Jean','Dupont',id,'FR','active','B1','service' FROM public.legal_entities WHERE code='SIMI-FR' RETURNING id;
DO $$ DECLARE eid uuid; BEGIN SELECT id INTO eid FROM public.employees WHERE first_name='Jean'; IF NOT public.app_has_permission('employee.hr.read') THEN RAISE EXCEPTION 'HR capability missing'; END IF; IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=eid) THEN RAISE EXCEPTION 'Employee create failed'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','17000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.employees WHERE first_name='Jean') THEN RAISE EXCEPTION 'Employee privacy leak'; END IF; IF public.app_has_permission('employee.hr.read') THEN RAISE EXCEPTION 'HR capability leaked'; END IF; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','18000000-0000-4000-8000-000000000003',true);
DO $$ DECLARE eid uuid; doc uuid; BEGIN SELECT id INTO eid FROM public.employees WHERE first_name='Jean'; INSERT INTO public.documents(id,original_filename,stored_filename,storage_path,employee_id,access_scope,file_state,title,legal_entity_id,expiry_date) SELECT gen_random_uuid(),'id.pdf','id.pdf','hr/'||eid||'.pdf',eid,'hr','ready','Documento identità',legal_entity_id,'2026-10-01' FROM public.employees WHERE id=eid RETURNING id INTO doc; IF NOT EXISTS(SELECT 1 FROM public.employee_deadlines WHERE employee_id=eid AND document_id=doc) THEN RAISE EXCEPTION 'Derived HR deadline missing'; END IF; UPDATE public.employees SET status='terminated',termination_date='2026-09-18' WHERE id=eid; PERFORM public.archive_employee(eid,true); IF (SELECT status FROM public.employees WHERE id=eid)<>'archived' THEN RAISE EXCEPTION 'Archive failed'; END IF; PERFORM public.archive_employee(eid,false); IF (SELECT status FROM public.employees WHERE id=eid)<>'terminated' THEN RAISE EXCEPTION 'Restore lost termination'; END IF; IF NOT EXISTS(SELECT 1 FROM public.activity_logs WHERE entity_type='employees' AND entity_id=eid) THEN RAISE EXCEPTION 'Employee audit missing'; END IF; END $$;
SET LOCAL ROLE authenticated;
ROLLBACK;
\echo 'PASS: employee HR privacy, FR anagraphic, derived deadline, termination and archive/restore'
