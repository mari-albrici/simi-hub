-- External accounting identifier: optional text, preserves leading zeroes.
-- Codes are not assumed unique across companies or accounting registers.
ALTER TABLE public.companies ADD COLUMN esolver_code text;
COMMENT ON COLUMN public.companies.esolver_code IS 'Optional customer/supplier eSolver code; not globally unique.';
