-- Disposable local UI fixture only; follows tests/e2e/fixture.sql.
UPDATE companies SET company_type='both', business_name='Impresa internazionale di costruzioni e manutenzioni con denominazione molto lunga S.r.l.',country='FR',vat_number='FR12345678901' WHERE id='25000000-0000-4000-8000-000000000001';
INSERT INTO company_contacts(company_id,first_name,last_name) VALUES('25000000-0000-4000-8000-000000000001','Referente','Amministrativo');
UPDATE projects SET customer_id='25000000-0000-4000-8000-000000000001',city='Luxembourg',project_manager_id='15000000-0000-4000-8000-000000000001',expected_closing_date='2026-12-31',name='Manutenzione impianti industriali e riqualificazione degli edifici amministrativi',status='active' WHERE id='35000000-0000-4000-8000-000000000001';
INSERT INTO offers(id,offer_group_id,offer_number,revision,issued_at,valid_until,legal_entity_id,counterparty_id,amount_total,status)
SELECT '81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','OFF-123',2,'2026-09-18','2026-11-30',id,'25000000-0000-4000-8000-000000000001',20659.46,'under_review' FROM legal_entities WHERE code='SIMI-IT';
INSERT INTO offer_projects VALUES('81000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001');
INSERT INTO contracts(id,reference,title,contract_type,legal_entity_id,counterparty_id,starts_at,expires_at,contract_value,currency,status)
SELECT '82000000-0000-4000-8000-000000000001','CTR-123','Contratto di manutenzione e assistenza per impianti industriali','supplier',id,'25000000-0000-4000-8000-000000000001','2026-09-18','2026-12-31',20659.46,'EUR','active' FROM legal_entities WHERE code='SIMI-IT';
INSERT INTO contract_projects VALUES('82000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001');
INSERT INTO employees(id,first_name,last_name,legal_entity_id,role_title,hire_date,status,country)
SELECT '83000000-0000-4000-8000-000000000001','Alessandro','De Angelis',id,'Responsabile manutenzione','2026-09-18','active','IT' FROM legal_entities WHERE code='SIMI-IT';
INSERT INTO deadlines(title,due_date,legal_entity_id,employee_id,status,priority)
SELECT 'Visita periodica dipendente',CURRENT_DATE+7,id,'83000000-0000-4000-8000-000000000001','open','high' FROM legal_entities WHERE code='SIMI-IT';
UPDATE invoices SET due_date='2026-09-18' WHERE id='65000000-0000-4000-8000-000000000001';
INSERT INTO financial_movements(id,direction,legal_entity_id,counterparty_id,movement_date,amount,currency,reference)
SELECT '84000000-0000-4000-8000-000000000001','payment',id,'25000000-0000-4000-8000-000000000001','2026-09-18',1004.41,'EUR','BON-123' FROM legal_entities WHERE code='SIMI-IT';
INSERT INTO financial_allocations(movement_id,invoice_id,amount) VALUES('84000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001',500);
