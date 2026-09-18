\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES('14000000-0000-4000-8000-000000000001','ordersadmin@simisrl.eu');
UPDATE public.profiles SET role='admin' WHERE id='14000000-0000-4000-8000-000000000001';
INSERT INTO public.companies(id,company_type,business_name) VALUES('25000000-0000-4000-8000-000000000001','supplier','Fornitore ordini');
SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','14000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE o uuid; d1 uuid; d2 uuid; l uuid; s jsonb; BEGIN
 o=public.save_order(jsonb_build_object('order_number','PO-1','order_type','purchase','status','confirmed','legal_entity_id',(SELECT id FROM public.legal_entities LIMIT 1),'counterparty_id','25000000-0000-4000-8000-000000000001','order_date',CURRENT_DATE,'currency','EUR','lines',jsonb_build_array(jsonb_build_object('description','Materiale','quantity',100,'unit','pz','unit_price',10))));
 l=(SELECT id FROM public.order_lines WHERE order_id=o); d1=public.save_delivery_note(jsonb_build_object('note_number','DDT-1','note_date',CURRENT_DATE,'direction','inbound','legal_entity_id',(SELECT legal_entity_id FROM public.orders WHERE id=o),'counterparty_id','25000000-0000-4000-8000-000000000001','lines',jsonb_build_array(jsonb_build_object('description','Materiale','quantity',40,'unit','pz','order_line_id',l)))); d2=public.save_delivery_note(jsonb_build_object('note_number','DDT-2','note_date',CURRENT_DATE,'direction','inbound','legal_entity_id',(SELECT legal_entity_id FROM public.orders WHERE id=o),'counterparty_id','25000000-0000-4000-8000-000000000001','lines',jsonb_build_array(jsonb_build_object('description','Materiale','quantity',60,'unit','pz','order_line_id',l))));
 IF (SELECT sum(quantity) FROM public.delivery_note_lines WHERE order_line_id=l)<>100 THEN RAISE EXCEPTION 'partial delivery aggregation'; END IF;
 IF (SELECT ordered_value FROM public.order_reconciliation WHERE id=o)<>1000 THEN RAISE EXCEPTION 'order value'; END IF;
 IF NOT public.app_has_permission('order.create') OR NOT public.app_has_permission('delivery_note.create') THEN RAISE EXCEPTION 'admin capability'; END IF;
END $$;
\echo 'PASS: phase1f orders, DDT, partial delivery, quantities, reconciliation and RBAC'
ROLLBACK;
