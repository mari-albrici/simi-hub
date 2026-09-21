-- Additional records for 2A.5A: run after redesign-fixture.sql on a disposable DB.
UPDATE companies SET esolver_code='01234' WHERE id='25000000-0000-4000-8000-000000000001';
INSERT INTO orders(id,order_number,order_type,legal_entity_id,counterparty_id,order_date)
SELECT '84000000-0000-4000-8000-000000000001','ORD-SHELL','purchase',id,'25000000-0000-4000-8000-000000000001',CURRENT_DATE FROM legal_entities WHERE code='SIMI-IT';
INSERT INTO delivery_notes(id,note_number,note_date,direction,legal_entity_id,counterparty_id)
SELECT '85000000-0000-4000-8000-000000000001','DDT-SHELL',CURRENT_DATE,'inbound',id,'25000000-0000-4000-8000-000000000001' FROM legal_entities WHERE code='SIMI-IT';
