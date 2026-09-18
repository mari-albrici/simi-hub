\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('19000000-0000-4000-8000-000000000001','admin2@simisrl.eu');
UPDATE public.profiles SET role='admin',active=true WHERE id='19000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE it_count int; BEGIN SELECT count(*) INTO it_count FROM public.legal_entities WHERE active AND entity_key='IT'; IF it_count<>1 THEN RAISE EXCEPTION 'Expected one active Italian entity, got %',it_count; END IF; IF (SELECT business_name FROM public.legal_entities WHERE active AND entity_key='IT')<>'SIMI S.r.l.' THEN RAISE EXCEPTION 'Canonical Italian label missing'; END IF; BEGIN INSERT INTO public.legal_entities(code,business_name,country,active) VALUES('SIMI-IT-DUP','SIMI Italia S.R.L.','IT',true); RAISE EXCEPTION 'Duplicate Italian entity accepted'; EXCEPTION WHEN unique_violation THEN NULL; END; END $$;
DO $$ BEGIN IF to_regclass('public.general_document_register') IS NULL THEN RAISE EXCEPTION 'General document view missing'; END IF; END $$;
ROLLBACK;
\echo 'PASS: Italian legal entity merge, canonical label, duplicate prevention and general document ownership view'
