\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('1a000000-0000-4000-8000-000000000001','phase-a@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='1a000000-0000-4000-8000-000000000001';
INSERT INTO public.invoices(id,invoice_type,invoice_number,legal_entity_id,amount_total,due_date,currency)
SELECT ('6a000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=7 THEN 'sale' ELSE 'purchase' END,'A-'||n,(SELECT id FROM public.legal_entities WHERE code='SIMI-IT'),CASE WHEN n=5 THEN 500 ELSE 1000 END,CURRENT_DATE+10,CASE WHEN n=6 THEN 'USD' ELSE 'EUR' END FROM generate_series(1,7) n;
INSERT INTO public.invoice_installments(id,invoice_id,due_date,amount) VALUES
('7a000000-0000-4000-8000-000000000001','6a000000-0000-4000-8000-000000000003',CURRENT_DATE+5,500),
('7a000000-0000-4000-8000-000000000002','6a000000-0000-4000-8000-000000000003',CURRENT_DATE+40,500),
('7a000000-0000-4000-8000-000000000003','6a000000-0000-4000-8000-000000000005',CURRENT_DATE-1,500);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE e uuid; item record; BEGIN
 SELECT id INTO e FROM public.legal_entities WHERE code='SIMI-IT';
 FOR item IN SELECT * FROM (VALUES (2,400,NULL::uuid),(3,500,'7a000000-0000-4000-8000-000000000001'::uuid),(4,1000,NULL::uuid),(5,200,'7a000000-0000-4000-8000-000000000003'::uuid),(7,400,NULL::uuid)) v(n,amount,installment) LOOP
 PERFORM public.save_financial_movement(jsonb_build_object('direction',CASE WHEN item.n=7 THEN 'receipt' ELSE 'payment' END,'legal_entity_id',e,'movement_date',CURRENT_DATE,'amount',item.amount,'currency','EUR','allocations',jsonb_build_array(jsonb_build_object('invoice_id','6a000000-0000-4000-8000-'||lpad(item.n::text,12,'0'),'installment_id',item.installment,'amount',item.amount))));
 END LOOP;
 IF (SELECT residual FROM public.operational_deadlines WHERE invoice_id='6a000000-0000-4000-8000-000000000001')<>1000 THEN RAISE EXCEPTION 'A1 unpaid'; END IF;
 IF (SELECT residual FROM public.operational_deadlines WHERE invoice_id='6a000000-0000-4000-8000-000000000002')<>600 THEN RAISE EXCEPTION 'A2 partial'; END IF;
 IF (SELECT sum(residual) FROM public.operational_deadlines WHERE invoice_id='6a000000-0000-4000-8000-000000000003')<>500 OR (SELECT count(*) FROM public.operational_deadlines WHERE invoice_id='6a000000-0000-4000-8000-000000000003')<>2 THEN RAISE EXCEPTION 'A3 installments double count'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE installment_id='7a000000-0000-4000-8000-000000000002' AND residual=500 AND due_date=CURRENT_DATE+40 AND NOT completed) OR EXISTS(SELECT 1 FROM public.operational_deadlines WHERE installment_id='7a000000-0000-4000-8000-000000000001' AND NOT completed) THEN RAISE EXCEPTION 'A3 cash flow date'; END IF;
 IF EXISTS(SELECT 1 FROM public.operational_deadlines WHERE invoice_id='6a000000-0000-4000-8000-000000000004' AND (NOT completed OR residual<>0)) THEN RAISE EXCEPTION 'A4 fully paid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE invoice_id='6a000000-0000-4000-8000-000000000005' AND residual=300 AND temporal_status='overdue') THEN RAISE EXCEPTION 'A5 overdue residual'; END IF;
 IF (SELECT sum(amount) FROM public.deadline_financial_kpis() WHERE kind='payment' AND currency='EUR')<>2400 OR (SELECT sum(amount) FROM public.deadline_financial_kpis() WHERE kind='payment' AND currency='USD')<>1000 THEN RAISE EXCEPTION 'A6 currency separation'; END IF;
 IF (SELECT sum(amount) FROM public.deadline_financial_kpis() WHERE kind='receipt' AND currency='EUR')<>600 THEN RAISE EXCEPTION 'Receipt residual'; END IF;
 IF (SELECT sum(amount) FROM public.financial_movements WHERE direction='payment' AND archived_at IS NULL)<>2100 THEN RAISE EXCEPTION 'Registered payments'; END IF;
END $$;
ROLLBACK;
\echo 'PASS: phase A six financial scenarios, receipts and actual movements'
