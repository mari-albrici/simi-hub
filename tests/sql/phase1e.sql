\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('13000000-0000-4000-8000-000000000001','projectsadmin@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='13000000-0000-4000-8000-000000000001';
INSERT INTO public.companies(id,company_type,business_name) VALUES('23000000-0000-4000-8000-000000000001','customer','Cliente commessa');
INSERT INTO public.company_contacts(id,company_id,first_name,last_name) VALUES('24000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Referente','Cliente');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
INSERT INTO public.projects(id,project_code,name,customer_id,customer_contact_id,status,planned_start_date,expected_closing_date) VALUES('33000000-0000-4000-8000-000000000001','C-1E-001','Commessa test','23000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','active',CURRENT_DATE,CURRENT_DATE+30);
DO $$ DECLARE s jsonb; BEGIN s:=public.project_operational_summary('33000000-0000-4000-8000-000000000001'); IF (s->>'documents')::int<>0 OR (s->>'invoices')::int<>0 THEN RAISE EXCEPTION 'summary'; END IF; IF NOT EXISTS(SELECT 1 FROM public.project_activity_events('33000000-0000-4000-8000-000000000001')) THEN RAISE EXCEPTION 'timeline'; END IF; END $$;
DO $$ BEGIN INSERT INTO public.projects(project_code,name) VALUES('C-1E-001','Duplicata'); RAISE EXCEPTION 'duplicate project code accepted'; EXCEPTION WHEN unique_violation THEN NULL; END $$;
UPDATE public.projects SET status='closed' WHERE id='33000000-0000-4000-8000-000000000001';
RESET ROLE;
\echo 'PASS: phase1e project relations, uniqueness, summary, timeline and status'
ROLLBACK;
