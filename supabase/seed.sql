INSERT INTO public.companies (company_type, business_name, short_name, vat_number, tax_code, country, address, postal_code, city, province, email, phone, website, active)
VALUES
  ('customer', 'Cliente Demo Milano', 'Cliente Demo Milano', 'IT12345678901', '12345678901', 'Italia', 'Via Roma 12', '20100', 'Milano', 'MI', 'info@clientedemo.it', '+39 02 1234 5678', 'https://clientedemo.it', true),
  ('customer', 'Cliente Demo Parigi', 'Cliente Demo Parigi', 'FR98765432109', '98765432109', 'Francia', 'Rue de la Paix 8', '75002', 'Parigi', 'PAR', 'info@clientedemo.fr', '+33 1 2345 6789', 'https://clientedemo.fr', true),
  ('supplier', 'Fornitore Demo S.r.l.', 'Fornitore Demo', 'IT98765432109', '98765432109', 'Italia', 'Via Torino 45', '00100', 'Roma', 'RM', 'amministrazione@fornitore-demo.it', '+39 06 9876 5432', 'https://fornitore-demo.it', true),
  ('both', 'Cliente Demo S.p.A.', 'Cliente Demo SPA', 'IT11223344556', '11223344556', 'Italia', 'Corso Italia 67', '40100', 'Bologna', 'BO', 'info@clientedemo-spa.it', '+39 051 234 567', 'https://clientedemo-spa.it', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.projects (project_code, name, description, country, city, address, customer_id, status, opening_date, expected_closing_date, notes)
VALUES
  ('C1001', 'Cliente Demo Milano', 'Prima commessa demo di Milano', 'Italia', 'Milano', 'Via Roma 12', (SELECT id FROM public.companies WHERE business_name = 'Cliente Demo Milano' LIMIT 1), 'active', '2026-09-01', '2026-12-31', 'Commessa di esempio per il portale amministrativo.'),
  ('C1002', 'Cliente Demo Parigi', 'Seconda commessa demo di Parigi', 'Francia', 'Parigi', 'Rue de la Paix 8', (SELECT id FROM public.companies WHERE business_name = 'Cliente Demo Parigi' LIMIT 1), 'draft', '2026-09-10', '2027-01-15', 'Commessa in preparazione.'),
  ('C1003', 'Fornitore Demo S.r.l.', 'Progetto per fornitore demo', 'Italia', 'Roma', 'Via Torino 45', (SELECT id FROM public.companies WHERE business_name = 'Cliente Demo S.p.A.' LIMIT 1), 'completed', '2026-08-15', '2026-09-15', 'Conclusa con documentazione completata.')
ON CONFLICT (project_code) DO NOTHING;

INSERT INTO public.employees (first_name, last_name, employee_code, role_title, legal_entity_id, email, phone, hire_date, status)
VALUES
  ('Mario', 'Rossi', 'EMP-101', 'Amministrazione', (SELECT id FROM public.legal_entities WHERE code = 'SIMI-IT' LIMIT 1), 'mario.rossi@simi.it', '+39 02 5555 0001', '2020-01-15', 'active'),
  ('Laura', 'Verdi', 'EMP-205', 'Responsabile Progetto', (SELECT id FROM public.legal_entities WHERE code = 'SIMI-IT' LIMIT 1), 'laura.verdi@simi.it', '+39 02 5555 0002', '2021-06-01', 'active')
ON CONFLICT DO NOTHING;
