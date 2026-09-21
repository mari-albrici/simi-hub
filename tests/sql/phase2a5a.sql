\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('19000000-0000-4000-8000-000000000005','shell-test@simisrl.eu');
UPDATE profiles SET role='admin',active=true WHERE id='19000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000005',true);
INSERT INTO companies(company_type,business_name,esolver_code) VALUES ('customer','eSolver test customer','01234'),('supplier','eSolver test supplier','01234');
DO $$ BEGIN
 IF (SELECT count(*) FROM companies WHERE esolver_code='01234')<>2 THEN RAISE EXCEPTION 'eSolver must preserve zeroes and allow duplicate codes'; END IF;
END $$;
UPDATE companies SET esolver_code=NULL WHERE business_name='eSolver test supplier';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM companies WHERE business_name='eSolver test supplier' AND esolver_code IS NULL) THEN RAISE EXCEPTION 'eSolver must be clearable'; END IF;
END $$;
ROLLBACK;
\echo 'PASS: optional editable eSolver text preserves zeroes and allows duplicate codes under existing RLS'
