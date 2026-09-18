-- Atomic, permission-checked invoice aggregate. No financial table is writable via REST.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_invoice(payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<invoice_save>>
DECLARE
 invoice_id uuid := NULLIF(payload->>'id','')::uuid;
 counterparty_id uuid := NULLIF(payload->>'counterparty_id','')::uuid;
 existing public.invoices;
 item jsonb; detail_id uuid; project_ids uuid[]; line_ids uuid[] := '{}'; installment_ids uuid[] := '{}';
 net numeric; vat numeric; total numeric; line_net numeric; line_vat numeric; qty numeric; price numeric; rate numeric;
 net_sum numeric := 0; vat_sum numeric := 0; total_sum numeric := 0; installments_sum numeric := 0;
 new_party jsonb := payload->'new_counterparty';
BEGIN
 IF NOT public.app_has_permission(CASE WHEN invoice_id IS NULL THEN 'invoice.create' ELSE 'invoice.update' END) THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(payload->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'installments') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'project_ids') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Missing invoice details' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(payload->'lines')>1000 OR jsonb_array_length(payload->'installments')>500 OR jsonb_array_length(payload->'project_ids')>500 THEN RAISE EXCEPTION 'Too many details' USING ERRCODE='22023'; END IF;
 IF invoice_id IS NOT NULL THEN
  SELECT * INTO existing FROM public.invoices WHERE id=invoice_id FOR UPDATE;
  IF NOT FOUND OR existing.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501'; END IF;
  IF NULLIF(payload->>'expected_updated_at','')::timestamptz IS DISTINCT FROM existing.updated_at THEN RAISE EXCEPTION 'Concurrent update' USING ERRCODE='40001'; END IF;
 END IF;
 IF payload->>'invoice_type' IS NULL OR payload->>'status' IS NULL OR payload->>'invoice_type' NOT IN ('purchase','sale') OR COALESCE(length(trim(payload->>'invoice_number')),0) NOT BETWEEN 1 AND 120
 OR payload->>'status' NOT IN ('received','to_check','to_register','registered','to_pay','scheduled','paid','anomaly','archived') THEN RAISE EXCEPTION 'Invalid invoice' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.legal_entities WHERE id=(payload->>'legal_entity_id')::uuid AND active) THEN RAISE EXCEPTION 'Invalid entity' USING ERRCODE='23514'; END IF;
 IF counterparty_id IS NULL THEN
  IF jsonb_typeof(new_party) IS DISTINCT FROM 'object' OR COALESCE(length(trim(new_party->>'business_name')),0) NOT BETWEEN 2 AND 250 THEN RAISE EXCEPTION 'Invalid counterparty' USING ERRCODE='22023'; END IF;
  IF COALESCE(new_party->>'email','')<>'' AND (new_party->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid email' USING ERRCODE='22023'; END IF;
  INSERT INTO public.companies(company_type,business_name,vat_number,address,iban,country,email,phone)
  VALUES(CASE WHEN payload->>'invoice_type'='purchase' THEN 'supplier' ELSE 'customer' END,trim(new_party->>'business_name'),NULLIF(new_party->>'vat_number',''),NULLIF(new_party->>'address',''),NULLIF(new_party->>'iban',''),NULLIF(new_party->>'country',''),NULLIF(new_party->>'email',''),NULLIF(new_party->>'phone','')) RETURNING id INTO counterparty_id;
 ELSIF new_party IS NOT NULL AND new_party<>'null'::jsonb THEN RAISE EXCEPTION 'Ambiguous counterparty' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.id=counterparty_id AND c.active AND c.archived_at IS NULL AND (c.company_type='both' OR c.company_type=CASE WHEN payload->>'invoice_type'='purchase' THEN 'supplier' ELSE 'customer' END)) THEN RAISE EXCEPTION 'Invalid counterparty type' USING ERRCODE='23514'; END IF;
 net=(payload->>'amount_net')::numeric; vat=(payload->>'vat_amount')::numeric; total=(payload->>'amount_total')::numeric;
 IF net IS NULL OR vat IS NULL OR total IS NULL OR net<0 OR vat<0 OR total<0 OR total>=1e12 OR net<>round(net,2) OR vat<>round(vat,2) OR total<>round(total,2) OR net+vat<>total OR total='NaN'::numeric THEN RAISE EXCEPTION 'Invalid totals' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(array_agg(value::uuid),'{}') INTO project_ids FROM jsonb_array_elements_text(payload->'project_ids');
 IF cardinality(project_ids)<>(SELECT count(DISTINCT x) FROM unnest(project_ids) x) OR EXISTS(SELECT 1 FROM unnest(project_ids) x WHERE NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=x AND p.archived_at IS NULL)) THEN RAISE EXCEPTION 'Invalid projects' USING ERRCODE='23514'; END IF;
 IF NULLIF(payload->>'invoice_date','')::date < DATE '1900-01-01' OR NULLIF(payload->>'due_date','')::date < DATE '1900-01-01' THEN RAISE EXCEPTION 'Invalid date' USING ERRCODE='23514'; END IF;
 IF NULLIF(payload->>'payment_method','') IS NOT NULL AND payload->>'payment_method' NOT IN ('bank_transfer','sepa_direct_debit','credit_card','check','cash','other') THEN RAISE EXCEPTION 'Invalid payment method' USING ERRCODE='23514'; END IF;
 IF invoice_id IS NULL THEN
  INSERT INTO public.invoices(invoice_type,invoice_number,legal_entity_id,created_by) VALUES(payload->>'invoice_type',payload->>'invoice_number',(payload->>'legal_entity_id')::uuid,auth.uid()) RETURNING id INTO invoice_id;
 END IF;
 UPDATE public.invoices SET invoice_type=payload->>'invoice_type',invoice_number=trim(payload->>'invoice_number'),
  legal_entity_id=(payload->>'legal_entity_id')::uuid,
  supplier_id=CASE WHEN payload->>'invoice_type'='purchase' THEN counterparty_id ELSE NULL END,
  customer_id=CASE WHEN payload->>'invoice_type'='sale' THEN counterparty_id ELSE NULL END,
  invoice_date=NULLIF(payload->>'invoice_date','')::date,due_date=NULLIF(payload->>'due_date','')::date,
  amount_net=net,vat_amount=vat,amount_total=total,vat_rate=NULLIF(payload->>'vat_rate','')::numeric,
  vat_exempt_reason=NULLIF(payload->>'vat_exempt_reason',''),payment_method=NULLIF(payload->>'payment_method',''),
  status=payload->>'status',notes=payload->>'notes',revision=revision+1 WHERE id=invoice_id;
 FOR item IN SELECT value FROM jsonb_array_elements(payload->'lines') LOOP
  detail_id=NULLIF(item->>'id','')::uuid;
  IF detail_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.invoice_lines l WHERE l.id=detail_id AND l.invoice_id=invoice_save.invoice_id) THEN RAISE EXCEPTION 'Foreign line id' USING ERRCODE='42501'; END IF;
  detail_id=COALESCE(detail_id,gen_random_uuid());
  IF detail_id=ANY(line_ids) THEN RAISE EXCEPTION 'Duplicate line id' USING ERRCODE='23514'; END IF;
  qty=(item->>'quantity')::numeric; price=(item->>'unit_price')::numeric; rate=NULLIF(item->>'vat_rate','')::numeric;
  IF qty IS NULL OR price IS NULL OR qty<=0 OR qty>1e9 OR price<0 OR price>1e9 OR qty<>round(qty,3) OR price<>round(price,4) OR rate='NaN'::numeric OR rate<>round(rate,2) OR qty='NaN'::numeric OR price='NaN'::numeric OR (rate IS NULL AND COALESCE(item->>'vat_exempt_reason','')='') OR rate<0 OR rate>100 OR COALESCE(length(trim(item->>'description')),0)=0 THEN RAISE EXCEPTION 'Invalid line' USING ERRCODE='23514'; END IF;
  line_net=round(qty*price,2); line_vat=CASE WHEN COALESCE(item->>'vat_exempt_reason','')<>'' THEN 0 ELSE round(line_net*rate/100,2) END;
  IF (item->>'amount_net')::numeric IS DISTINCT FROM line_net OR (item->>'amount_vat')::numeric IS DISTINCT FROM line_vat OR (item->>'amount_total')::numeric IS DISTINCT FROM line_net+line_vat THEN RAISE EXCEPTION 'Inconsistent line amounts' USING ERRCODE='23514'; END IF;
  IF NULLIF(item->>'project_id','') IS NOT NULL AND NOT ((item->>'project_id')::uuid=ANY(project_ids)) THEN RAISE EXCEPTION 'Line project not linked' USING ERRCODE='23514'; END IF;
  INSERT INTO public.invoice_lines(id,invoice_id,position,description,quantity,unit_price,vat_rate,vat_exempt_reason,amount_net,amount_vat,amount_total,project_id)
  VALUES(detail_id,invoice_id,cardinality(line_ids),item->>'description',qty,price,rate,NULLIF(item->>'vat_exempt_reason',''),line_net,line_vat,line_net+line_vat,NULLIF(item->>'project_id','')::uuid)
  ON CONFLICT(id) DO UPDATE SET position=EXCLUDED.position,description=EXCLUDED.description,quantity=EXCLUDED.quantity,unit_price=EXCLUDED.unit_price,vat_rate=EXCLUDED.vat_rate,vat_exempt_reason=EXCLUDED.vat_exempt_reason,amount_net=EXCLUDED.amount_net,amount_vat=EXCLUDED.amount_vat,amount_total=EXCLUDED.amount_total,project_id=EXCLUDED.project_id;
  line_ids=array_append(line_ids,detail_id); net_sum=net_sum+line_net; vat_sum=vat_sum+line_vat; total_sum=total_sum+line_net+line_vat;
 END LOOP;
 IF cardinality(line_ids)>0 AND (net_sum<>net OR vat_sum<>vat OR total_sum<>total) THEN RAISE EXCEPTION 'Line totals mismatch' USING ERRCODE='23514'; END IF;
 IF cardinality(line_ids)=0 THEN
  rate=NULLIF(payload->>'vat_rate','')::numeric;
  IF rate<0 OR rate>100 OR rate='NaN'::numeric OR rate<>round(rate,2) OR (COALESCE(payload->>'vat_exempt_reason','')<>'' AND vat<>0) OR (COALESCE(payload->>'vat_exempt_reason','')='' AND rate IS NOT NULL AND round(net*rate/100,2)<>vat) THEN RAISE EXCEPTION 'Invalid VAT' USING ERRCODE='23514'; END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(payload->'installments') LOOP
  detail_id=NULLIF(item->>'id','')::uuid;
  IF detail_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.invoice_installments i WHERE i.id=detail_id AND i.invoice_id=invoice_save.invoice_id) THEN RAISE EXCEPTION 'Foreign installment id' USING ERRCODE='42501'; END IF;
  detail_id=COALESCE(detail_id,gen_random_uuid());
  IF detail_id=ANY(installment_ids) OR NULLIF(item->>'due_date','') IS NULL OR (item->>'amount')::numeric IS NULL OR (item->>'due_date')::date < DATE '1900-01-01' OR (item->>'amount')::numeric='NaN'::numeric OR (item->>'amount')::numeric<=0 OR (item->>'amount')::numeric>=1e12 OR (item->>'amount')::numeric<>round((item->>'amount')::numeric,2) OR jsonb_typeof(item->'paid') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid installment' USING ERRCODE='23514'; END IF;
  INSERT INTO public.invoice_installments(id,invoice_id,position,due_date,amount,paid)
  VALUES(detail_id,invoice_id,cardinality(installment_ids),(item->>'due_date')::date,(item->>'amount')::numeric,(item->>'paid')::boolean)
  ON CONFLICT(id) DO UPDATE SET position=EXCLUDED.position,due_date=EXCLUDED.due_date,amount=EXCLUDED.amount,paid=EXCLUDED.paid;
  installment_ids=array_append(installment_ids,detail_id); installments_sum=installments_sum+(item->>'amount')::numeric;
 END LOOP;
 IF cardinality(installment_ids)>0 AND installments_sum<>total THEN RAISE EXCEPTION 'Installment sum mismatch' USING ERRCODE='23514'; END IF;
 -- Delete only details explicitly removed from the submitted aggregate, inside this transaction.
 DELETE FROM public.invoice_lines l WHERE l.invoice_id=invoice_save.invoice_id AND NOT(l.id=ANY(line_ids));
 DELETE FROM public.invoice_installments i WHERE i.invoice_id=invoice_save.invoice_id AND NOT(i.id=ANY(installment_ids));
 INSERT INTO public.invoice_projects(invoice_id,project_id) SELECT invoice_id,x FROM unnest(project_ids) x ON CONFLICT DO NOTHING;
 DELETE FROM public.invoice_projects ip WHERE ip.invoice_id=invoice_save.invoice_id AND NOT(ip.project_id=ANY(project_ids));
 RETURN invoice_id;
END $$;
REVOKE ALL ON FUNCTION public.save_invoice(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_invoice(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_record(kind text, record_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE table_name text; permission text; affected integer;
BEGIN
 CASE kind WHEN 'project' THEN table_name='projects';permission='project.delete';
 WHEN 'company' THEN table_name='companies';permission='company.delete';
 WHEN 'invoice' THEN table_name='invoices';permission='invoice.delete';
 WHEN 'document' THEN table_name='documents';permission='document.delete';
 ELSE RAISE EXCEPTION 'Invalid kind' USING ERRCODE='22023'; END CASE;
 IF NOT public.app_has_permission(permission) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF kind='document' AND EXISTS(SELECT 1 FROM public.documents WHERE id=record_id AND (employee_id IS NOT NULL OR access_scope='hr')) AND NOT public.app_has_permission('employee.read') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 EXECUTE format('UPDATE public.%I SET archived_at=now() WHERE id=$1 AND archived_at IS NULL',table_name) USING record_id;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'Record unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.archive_record(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_record(text,uuid) TO authenticated;
COMMIT;
