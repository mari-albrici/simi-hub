\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('11000000-0000-4000-8000-000000000001','deadlines@simisrl.eu'),('11000000-0000-4000-8000-000000000002','technicaldeadline@simisrl.eu'),('11000000-0000-4000-8000-000000000003','viewerdeadline@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='11000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role='technical' WHERE id='11000000-0000-4000-8000-000000000002';
INSERT INTO public.projects(id,project_code,name) VALUES('31000000-0000-4000-8000-000000000001','D1','D1'),('31000000-0000-4000-8000-000000000002','D2','D2');
INSERT INTO public.invoices(id,invoice_type,invoice_number,legal_entity_id,amount_total,due_date)
SELECT ('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=6 THEN 'sale' ELSE 'purchase' END,'D'||n,(SELECT id FROM public.legal_entities WHERE code='SIMI-IT'),100,CASE WHEN n=1 THEN CURRENT_DATE+20 WHEN n=2 THEN CURRENT_DATE ELSE CURRENT_DATE-10 END FROM generate_series(1,7) n;
INSERT INTO public.invoice_installments(id,invoice_id,due_date,amount)
SELECT ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=1 THEN CURRENT_DATE+20 WHEN n=2 THEN CURRENT_DATE ELSE CURRENT_DATE-10 END,100 FROM generate_series(1,6) n;
INSERT INTO public.invoice_projects VALUES('61000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000001'),('61000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE entity uuid; m uuid; manual uuid; before_count int; BEGIN
 SELECT id INTO entity FROM public.legal_entities WHERE code='SIMI-IT';
 m:=public.save_financial_movement(jsonb_build_object('direction','payment','legal_entity_id',entity,'movement_date',CURRENT_DATE,'amount',40,'currency','EUR','allocations',jsonb_build_array(jsonb_build_object('invoice_id','61000000-0000-4000-8000-000000000004','installment_id','71000000-0000-4000-8000-000000000004','amount',40))));
 PERFORM public.save_financial_movement(jsonb_build_object('direction','payment','legal_entity_id',entity,'movement_date',CURRENT_DATE,'amount',100,'currency','EUR','allocations',jsonb_build_array(jsonb_build_object('invoice_id','61000000-0000-4000-8000-000000000005','amount',100))));
 IF (SELECT temporal_status FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000001')<>'future' THEN RAISE EXCEPTION 'future'; END IF;
 IF (SELECT temporal_status FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000002')<>'today' THEN RAISE EXCEPTION 'today'; END IF;
 IF (SELECT temporal_status FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000003')<>'overdue' THEN RAISE EXCEPTION 'unpaid overdue'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000004' AND residual=60 AND settled_amount=40 AND temporal_status='overdue' AND cardinality(project_ids)=2) THEN RAISE EXCEPTION 'partial multi-project'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000005' AND completed AND residual=0) THEN RAISE EXCEPTION 'paid overdue'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000006' AND kind='receipt') THEN RAISE EXCEPTION 'receipt'; END IF;
 IF (SELECT count(*) FROM public.operational_deadlines WHERE source='financial')<>7 OR (SELECT count(DISTINCT id) FROM public.operational_deadlines)<>7 THEN RAISE EXCEPTION 'duplicates or fallback missing'; END IF;
 IF (SELECT sum(amount) FROM public.deadline_financial_kpis() WHERE kind='payment')<>460 THEN RAISE EXCEPTION 'residual KPI'; END IF;
 IF (SELECT sum(amount) FROM public.deadline_financial_kpis() WHERE kind='payment' AND overdue)<>260 THEN RAISE EXCEPTION 'overdue KPI'; END IF;
 INSERT INTO public.deadlines(title,due_date,legal_entity_id,assigned_to,priority) VALUES('Manual',CURRENT_DATE,entity,auth.uid(),'high') RETURNING id INTO manual;
 UPDATE public.deadlines SET title='Modified',due_date=CURRENT_DATE+2 WHERE id=manual;
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE id='manual:'||manual AND assigned_to=auth.uid() AND temporal_status='soon' AND title='Modified') THEN RAISE EXCEPTION 'manual filter'; END IF;
 UPDATE public.deadlines SET status='completed' WHERE id=manual;
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE id='manual:'||manual AND completed) THEN RAISE EXCEPTION 'manual completion'; END IF;
 UPDATE public.deadlines SET archived_at=now() WHERE id=manual;
 IF EXISTS(SELECT 1 FROM public.operational_deadlines WHERE id='manual:'||manual AND archived_at IS NULL) THEN RAISE EXCEPTION 'archive'; END IF;
 IF (SELECT count(*) FROM public.activity_logs WHERE entity_id=manual)<4 THEN RAISE EXCEPTION 'audit missing'; END IF;
 BEGIN INSERT INTO public.deadlines(title,due_date,legal_entity_id,invoice_id,priority) VALUES('duplicate',CURRENT_DATE,entity,'61000000-0000-4000-8000-000000000001','medium'); RAISE EXCEPTION 'financial manual copy'; EXCEPTION WHEN check_violation THEN NULL; END;
 PERFORM public.archive_financial_movement(m);
 IF (SELECT residual FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000004')<>100 THEN RAISE EXCEPTION 'archive movement refresh'; END IF;
END $$;
RESET ROLE;
UPDATE public.invoice_installments SET due_date=CURRENT_DATE+5 WHERE invoice_id='61000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT temporal_status FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000003')<>'soon' THEN RAISE EXCEPTION 'source date refresh'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.operational_deadlines WHERE source='financial') OR EXISTS(SELECT 1 FROM public.invoice_financial_summary) OR EXISTS(SELECT 1 FROM public.deadline_financial_kpis()) THEN RAISE EXCEPTION 'financial RLS leak'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 BEGIN INSERT INTO public.deadlines(title,due_date,legal_entity_id,priority) SELECT 'Denied',CURRENT_DATE,id,'medium' FROM public.legal_entities LIMIT 1; RAISE EXCEPTION 'viewer write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE source='financial') THEN RAISE EXCEPTION 'viewer read denied'; END IF;
END $$;
-- Two installments: invoice-level settlement is distributed once, oldest first.
RESET ROLE;
INSERT INTO public.invoice_installments(id,invoice_id,due_date,amount) VALUES('71000000-0000-4000-8000-000000000007','61000000-0000-4000-8000-000000000007',CURRENT_DATE-2,30),('71000000-0000-4000-8000-000000000008','61000000-0000-4000-8000-000000000007',CURRENT_DATE+2,70);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE e uuid; m uuid; BEGIN
 SELECT id INTO e FROM public.legal_entities WHERE code='SIMI-IT';
 m:=public.save_financial_movement(jsonb_build_object('direction','payment','legal_entity_id',e,'movement_date',CURRENT_DATE,'amount',50,'currency','EUR','allocations',jsonb_build_array(jsonb_build_object('invoice_id','61000000-0000-4000-8000-000000000007','amount',50))));
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE installment_id='71000000-0000-4000-8000-000000000007' AND completed AND residual=0) OR NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE installment_id='71000000-0000-4000-8000-000000000008' AND residual=50) THEN RAISE EXCEPTION 'invoice-level distribution duplicated'; END IF;
 IF (SELECT count(*) FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000007')<>2 THEN RAISE EXCEPTION 'fallback duplicated'; END IF;
 PERFORM public.save_financial_movement(jsonb_build_object('id',m,'direction','payment','legal_entity_id',e,'movement_date',CURRENT_DATE,'amount',70,'currency','EUR','allocations',jsonb_build_array(jsonb_build_object('invoice_id','61000000-0000-4000-8000-000000000007','amount',70))));
 IF (SELECT sum(residual) FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000007')<>30 THEN RAISE EXCEPTION 'movement update not reflected'; END IF;
 PERFORM public.save_financial_movement(jsonb_build_object('direction','receipt','legal_entity_id',e,'movement_date',CURRENT_DATE,'amount',35,'currency','EUR','allocations',jsonb_build_array(jsonb_build_object('invoice_id','61000000-0000-4000-8000-000000000006','amount',35))));
 IF NOT EXISTS(SELECT 1 FROM public.operational_deadlines WHERE invoice_id='61000000-0000-4000-8000-000000000006' AND kind='receipt' AND residual=65 AND temporal_status='overdue') THEN RAISE EXCEPTION 'receipt residual'; END IF;
END $$;
\echo 'PASS: phase1c states, balances, allocations, manual lifecycle, audit, RLS, KPI, source updates and uniqueness'
ROLLBACK;
