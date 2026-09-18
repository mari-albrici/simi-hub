-- Fase 1F.1B. Additive completion; 013/014 remain immutable.
BEGIN;

-- Header relations never imply an allocation of an entire multi-order invoice.
ALTER TABLE public.order_invoices ADD COLUMN allocated_amount numeric(14,2) CHECK(allocated_amount>=0);
CREATE TABLE public.commercial_invoice_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_line_id uuid NOT NULL REFERENCES public.invoice_lines(id),
 order_line_id uuid REFERENCES public.order_lines(id),
 delivery_note_line_id uuid REFERENCES public.delivery_note_lines(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 CHECK(order_line_id IS NOT NULL OR delivery_note_line_id IS NOT NULL),
 UNIQUE NULLS NOT DISTINCT(invoice_line_id,order_line_id,delivery_note_line_id)
);
ALTER TABLE public.commercial_invoice_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_invoice_lines FROM anon,authenticated;
GRANT SELECT ON public.commercial_invoice_lines TO authenticated;
CREATE POLICY commercial_invoice_lines_read ON public.commercial_invoice_lines FOR SELECT TO authenticated
 USING(public.app_has_permission('invoice.read') AND (order_line_id IS NULL OR public.app_has_permission('order.read')) AND (delivery_note_line_id IS NULL OR public.app_has_permission('delivery_note.read')));

-- Writes go through validated transactional RPCs; no direct header bypass.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['orders','order_lines','order_projects','delivery_notes','delivery_note_lines','delivery_note_projects','delivery_note_orders','order_invoices','delivery_note_invoices','document_orders','document_delivery_notes'] LOOP
 EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON public.%I FROM authenticated,anon',t);
 END LOOP;
END $$;
DROP POLICY doc_order_links_read ON public.document_orders;
DROP POLICY doc_ddt_links_read ON public.document_delivery_notes;
CREATE POLICY doc_order_links_read ON public.document_orders FOR SELECT TO authenticated USING(public.app_has_permission('order.read') AND public.document_visible(document_id));
CREATE POLICY doc_ddt_links_read ON public.document_delivery_notes FOR SELECT TO authenticated USING(public.app_has_permission('delivery_note.read') AND public.document_visible(document_id));
DROP POLICY order_invoice_links_read ON public.order_invoices;
DROP POLICY ddt_invoice_links_read ON public.delivery_note_invoices;
CREATE POLICY order_invoice_links_read ON public.order_invoices FOR SELECT TO authenticated USING(public.app_has_permission('order.read') AND public.app_has_permission('invoice.read'));
CREATE POLICY ddt_invoice_links_read ON public.delivery_note_invoices FOR SELECT TO authenticated USING(public.app_has_permission('delivery_note.read') AND public.app_has_permission('invoice.read'));

CREATE VIEW public.order_line_progress WITH(security_invoker=true) AS
 SELECT l.*,coalesce(d.quantity,0) delivered_quantity,l.quantity-coalesce(d.quantity,0) remaining_quantity,
 coalesce(d.quantity,0)>l.quantity overdelivered
 FROM public.order_lines l LEFT JOIN LATERAL (
 SELECT sum(dl.quantity) quantity FROM public.delivery_note_lines dl JOIN public.delivery_notes n ON n.id=dl.delivery_note_id
 WHERE dl.order_line_id=l.id AND n.archived_at IS NULL) d ON true;
CREATE OR REPLACE VIEW public.order_reconciliation WITH(security_invoker=true) AS
 SELECT o.id,o.order_number,o.order_type,o.legal_entity_id,o.counterparty_id,o.order_date,o.currency,o.status,o.archived_at,
 coalesce((SELECT sum(l.amount_total) FROM public.order_lines l WHERE l.order_id=o.id),0) ordered_value,
 coalesce((SELECT sum(l.delivered_quantity*l.amount_total/l.quantity) FROM public.order_line_progress l WHERE l.order_id=o.id),0) delivered_value,
 CASE WHEN EXISTS(SELECT 1 FROM public.order_invoices oi JOIN public.invoices i ON i.id=oi.invoice_id WHERE oi.order_id=o.id AND i.archived_at IS NULL AND (oi.allocated_amount IS NULL OR i.currency<>o.currency)) THEN NULL
 ELSE coalesce((SELECT sum(oi.allocated_amount) FROM public.order_invoices oi JOIN public.invoices i ON i.id=oi.invoice_id WHERE oi.order_id=o.id AND i.archived_at IS NULL AND i.currency=o.currency),0) END invoiced_value,
 CASE WHEN o.status='cancelled' THEN 'cancelled'
 WHEN EXISTS(SELECT 1 FROM public.order_line_progress l WHERE l.order_id=o.id AND overdelivered) THEN 'overdelivered'
 WHEN NOT EXISTS(SELECT 1 FROM public.order_line_progress l WHERE l.order_id=o.id AND delivered_quantity>0) THEN CASE WHEN o.status='draft' THEN 'draft' ELSE 'confirmed' END
 WHEN NOT EXISTS(SELECT 1 FROM public.order_line_progress l WHERE l.order_id=o.id AND remaining_quantity<>0) THEN 'fulfilled'
 ELSE 'partially_fulfilled' END fulfillment_status
 FROM public.orders o WHERE o.archived_at IS NULL;
GRANT SELECT ON public.order_line_progress,public.order_reconciliation TO authenticated;

-- Shared invariants are also checked when invoices/documents are edited elsewhere.
CREATE FUNCTION public.check_commercial_integrity() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.delivery_note_lines dl JOIN public.delivery_notes d ON d.id=dl.delivery_note_id JOIN public.order_lines l ON l.id=dl.order_line_id JOIN public.orders o ON o.id=l.order_id
 WHERE d.legal_entity_id<>o.legal_entity_id OR d.counterparty_id IS DISTINCT FROM o.counterparty_id OR d.direction<>CASE o.order_type WHEN 'purchase' THEN 'inbound' ELSE 'outbound' END OR dl.project_id IS DISTINCT FROM l.project_id OR dl.unit IS DISTINCT FROM l.unit) THEN RAISE EXCEPTION 'Riga DDT incompatibile con ordine, commessa o unità' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_note_orders x JOIN public.delivery_notes d ON d.id=x.delivery_note_id JOIN public.orders o ON o.id=x.order_id WHERE d.legal_entity_id<>o.legal_entity_id OR d.counterparty_id IS DISTINCT FROM o.counterparty_id OR d.direction<>CASE o.order_type WHEN 'purchase' THEN 'inbound' ELSE 'outbound' END) THEN RAISE EXCEPTION 'Ordine e DDT incompatibili' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_invoices x JOIN public.orders o ON o.id=x.order_id JOIN public.invoices i ON i.id=x.invoice_id WHERE o.legal_entity_id<>i.legal_entity_id OR o.counterparty_id IS DISTINCT FROM (CASE i.invoice_type WHEN 'purchase' THEN i.supplier_id ELSE i.customer_id END) OR o.order_type<>i.invoice_type OR o.currency<>i.currency) THEN RAISE EXCEPTION 'Ordine e fattura incompatibili (società, controparte, tipo o valuta)' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_note_invoices x JOIN public.delivery_notes d ON d.id=x.delivery_note_id JOIN public.invoices i ON i.id=x.invoice_id WHERE d.legal_entity_id<>i.legal_entity_id OR d.counterparty_id IS DISTINCT FROM (CASE i.invoice_type WHEN 'purchase' THEN i.supplier_id ELSE i.customer_id END) OR d.direction<>CASE i.invoice_type WHEN 'purchase' THEN 'inbound' ELSE 'outbound' END) THEN RAISE EXCEPTION 'DDT e fattura incompatibili' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_invoices x JOIN public.invoices i ON i.id=x.invoice_id GROUP BY i.id HAVING sum(x.allocated_amount)>i.amount_total) THEN RAISE EXCEPTION 'Importo attribuito agli ordini superiore alla fattura' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_projects x JOIN public.orders o ON o.id=x.order_id JOIN public.projects p ON p.id=x.project_id WHERE p.legal_entity_id IS NOT NULL AND p.legal_entity_id<>o.legal_entity_id)
 OR EXISTS(SELECT 1 FROM public.delivery_note_projects x JOIN public.delivery_notes d ON d.id=x.delivery_note_id JOIN public.projects p ON p.id=x.project_id WHERE p.legal_entity_id IS NOT NULL AND p.legal_entity_id<>d.legal_entity_id) THEN RAISE EXCEPTION 'Commessa di altra società' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.document_orders x JOIN public.documents d ON d.id=x.document_id JOIN public.orders o ON o.id=x.order_id WHERE d.legal_entity_id IS DISTINCT FROM o.legal_entity_id)
 OR EXISTS(SELECT 1 FROM public.document_delivery_notes x JOIN public.documents d ON d.id=x.document_id JOIN public.delivery_notes n ON n.id=x.delivery_note_id WHERE d.legal_entity_id IS DISTINCT FROM n.legal_entity_id) THEN RAISE EXCEPTION 'Documento di altra società' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.commercial_invoice_lines x JOIN public.invoice_lines il ON il.id=x.invoice_line_id LEFT JOIN public.order_lines ol ON ol.id=x.order_line_id LEFT JOIN public.delivery_note_lines dl ON dl.id=x.delivery_note_line_id
 WHERE (ol.id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.order_invoices oi WHERE oi.order_id=ol.order_id AND oi.invoice_id=il.invoice_id) OR il.project_id IS DISTINCT FROM ol.project_id OR il.unit IS DISTINCT FROM ol.unit))
 OR (dl.id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.delivery_note_invoices di WHERE di.delivery_note_id=dl.delivery_note_id AND di.invoice_id=il.invoice_id) OR il.project_id IS DISTINCT FROM dl.project_id OR il.unit IS DISTINCT FROM dl.unit OR (ol.id IS NOT NULL AND dl.order_line_id IS DISTINCT FROM ol.id)))) THEN RAISE EXCEPTION 'Allocazione righe incompatibile' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.commercial_invoice_lines x JOIN public.invoice_lines l ON l.id=x.invoice_line_id GROUP BY l.id HAVING sum(x.quantity)>l.quantity)
 OR EXISTS(SELECT 1 FROM public.commercial_invoice_lines x JOIN public.delivery_note_lines d ON d.id=x.delivery_note_line_id JOIN public.invoice_lines l ON l.id=x.invoice_line_id JOIN public.invoices i ON i.id=l.invoice_id AND i.archived_at IS NULL GROUP BY d.id HAVING sum(x.quantity)>d.quantity) THEN RAISE EXCEPTION 'Quantità fatturata superiore alla riga disponibile' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.check_commercial_integrity() FROM PUBLIC;
CREATE FUNCTION public.commercial_integrity_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN PERFORM public.check_commercial_integrity(); RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.commercial_integrity_trigger() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER commercial_invoice_guard AFTER UPDATE ON public.invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commercial_integrity_trigger();
CREATE CONSTRAINT TRIGGER commercial_invoice_line_guard AFTER UPDATE ON public.invoice_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commercial_integrity_trigger();
CREATE CONSTRAINT TRIGGER commercial_document_guard AFTER UPDATE ON public.documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commercial_integrity_trigger();

CREATE OR REPLACE FUNCTION public.save_order(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oid uuid:=NULLIF(payload->>'id','')::uuid; old public.orders; l public.order_lines; item jsonb; lid uuid; kept uuid[]:='{}'; p uuid; net numeric; vat numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(15101);
 IF NOT public.app_has_permission(CASE WHEN oid IS NULL THEN 'order.create' ELSE 'order.update' END) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'lines')=0 OR trim(coalesce(payload->>'order_number',''))='' THEN RAISE EXCEPTION 'Numero e righe obbligatori' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=(payload->>'counterparty_id')::uuid AND archived_at IS NULL AND company_type IN ('both',CASE payload->>'order_type' WHEN 'purchase' THEN 'supplier' ELSE 'customer' END)) THEN RAISE EXCEPTION 'Controparte non compatibile' USING ERRCODE='23514'; END IF;
 IF oid IS NOT NULL THEN
 SELECT * INTO old FROM public.orders WHERE id=oid AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order unavailable' USING ERRCODE='42501'; END IF;
 IF (payload->>'expected_updated_at')::timestamptz IS DISTINCT FROM old.updated_at THEN RAISE EXCEPTION 'Concurrent update' USING ERRCODE='40001'; END IF;
 IF (payload->>'status') IN ('draft','cancelled') AND EXISTS(SELECT 1 FROM public.delivery_note_orders x JOIN public.delivery_notes d ON d.id=x.delivery_note_id WHERE x.order_id=oid AND d.archived_at IS NULL) THEN RAISE EXCEPTION 'Ordine con consegne attive: impossibile annullare o riportare in bozza' USING ERRCODE='23514'; END IF;
 ELSE oid=gen_random_uuid(); END IF;
 INSERT INTO public.orders(id,order_number,order_type,legal_entity_id,counterparty_id,order_date,counterparty_reference,currency,status,subject,description,notes,created_by)
 VALUES(oid,trim(payload->>'order_number'),payload->>'order_type',(payload->>'legal_entity_id')::uuid,(payload->>'counterparty_id')::uuid,(payload->>'order_date')::date,NULLIF(payload->>'counterparty_reference',''),upper(payload->>'currency'),coalesce(NULLIF(payload->>'status',''),'draft'),NULLIF(payload->>'subject',''),NULLIF(payload->>'description',''),NULLIF(payload->>'notes',''),auth.uid())
 ON CONFLICT(id) DO UPDATE SET order_number=excluded.order_number,order_type=excluded.order_type,legal_entity_id=excluded.legal_entity_id,counterparty_id=excluded.counterparty_id,order_date=excluded.order_date,counterparty_reference=excluded.counterparty_reference,currency=excluded.currency,status=excluded.status,subject=excluded.subject,description=excluded.description,notes=excluded.notes;
 FOR item IN SELECT value FROM jsonb_array_elements(payload->'lines') LOOP
 lid=NULLIF(item->>'id','')::uuid;
 IF lid IS NOT NULL THEN
 SELECT * INTO l FROM public.order_lines WHERE id=lid AND order_id=oid;
 IF NOT FOUND OR lid=ANY(kept) THEN RAISE EXCEPTION 'Invalid line ID' USING ERRCODE='23514'; END IF;
 IF (item->>'quantity')::numeric<l.quantity AND (item->>'quantity')::numeric<(SELECT coalesce(sum(dl.quantity),0) FROM public.delivery_note_lines dl JOIN public.delivery_notes d ON d.id=dl.delivery_note_id WHERE dl.order_line_id=lid AND d.archived_at IS NULL) THEN RAISE EXCEPTION 'Quantità inferiore al già consegnato' USING ERRCODE='23514'; END IF;
 ELSE lid=gen_random_uuid(); END IF;
 net=round((item->>'quantity')::numeric*(item->>'unit_price')::numeric-coalesce((item->>'discount')::numeric,0),2); vat=round(net*coalesce((item->>'vat_rate')::numeric,0)/100,2);
 IF trim(coalesce(item->>'description',''))='' OR net<0 OR coalesce((item->>'vat_rate')::numeric,0) NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Riga non valida' USING ERRCODE='23514'; END IF;
 INSERT INTO public.order_lines(id,order_id,position,description,quantity,unit,unit_price,discount,vat_rate,vat_amount,amount_net,amount_total,project_id,notes)
 VALUES(lid,oid,coalesce((item->>'position')::int,0),item->>'description',(item->>'quantity')::numeric,NULLIF(item->>'unit',''),(item->>'unit_price')::numeric,coalesce((item->>'discount')::numeric,0),NULLIF(item->>'vat_rate','')::numeric,vat,net,net+vat,NULLIF(item->>'project_id','')::uuid,NULLIF(item->>'notes',''))
 ON CONFLICT(id) DO UPDATE SET position=excluded.position,description=excluded.description,quantity=excluded.quantity,unit=excluded.unit,unit_price=excluded.unit_price,discount=excluded.discount,vat_rate=excluded.vat_rate,vat_amount=excluded.vat_amount,amount_net=excluded.amount_net,amount_total=excluded.amount_total,project_id=excluded.project_id,notes=excluded.notes;
 kept=array_append(kept,lid);
 END LOOP;
 -- FK RESTRICT deliberately protects even archived DDT/invoice references.
 DELETE FROM public.order_lines WHERE order_id=oid AND NOT(id=ANY(kept));
 DELETE FROM public.order_projects WHERE order_id=oid;
 INSERT INTO public.order_projects SELECT oid,project_id FROM public.order_lines WHERE order_id=oid AND project_id IS NOT NULL ON CONFLICT DO NOTHING;
 FOR p IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(payload->'project_ids','[]')) LOOP INSERT INTO public.order_projects VALUES(oid,p) ON CONFLICT DO NOTHING; END LOOP;
 PERFORM public.check_commercial_integrity(); RETURN oid;
END $$;

CREATE OR REPLACE FUNCTION public.save_delivery_note(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE did uuid:=NULLIF(payload->>'id','')::uuid; old public.delivery_notes; item jsonb; lid uuid; kept uuid[]:='{}'; o uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(15101);
 IF NOT public.app_has_permission(CASE WHEN did IS NULL THEN 'delivery_note.create' ELSE 'delivery_note.update' END) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'lines')=0 OR trim(coalesce(payload->>'note_number',''))='' THEN RAISE EXCEPTION 'Numero e righe obbligatori' USING ERRCODE='23514'; END IF;
 IF did IS NOT NULL THEN SELECT * INTO old FROM public.delivery_notes WHERE id=did AND archived_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'DDT unavailable' USING ERRCODE='42501'; END IF;
 IF (payload->>'expected_updated_at')::timestamptz IS DISTINCT FROM old.updated_at THEN RAISE EXCEPTION 'Concurrent update' USING ERRCODE='40001'; END IF;
 ELSE did=gen_random_uuid(); END IF;
 INSERT INTO public.delivery_notes(id,note_number,note_date,direction,legal_entity_id,counterparty_id,sender_id,recipient_id,departure_place,destination_place,transport_reason,carrier,notes,created_by)
 VALUES(did,trim(payload->>'note_number'),(payload->>'note_date')::date,payload->>'direction',(payload->>'legal_entity_id')::uuid,NULLIF(payload->>'counterparty_id','')::uuid,NULLIF(payload->>'sender_id','')::uuid,NULLIF(payload->>'recipient_id','')::uuid,NULLIF(payload->>'departure_place',''),NULLIF(payload->>'destination_place',''),NULLIF(payload->>'transport_reason',''),NULLIF(payload->>'carrier',''),NULLIF(payload->>'notes',''),auth.uid())
 ON CONFLICT(id) DO UPDATE SET note_number=excluded.note_number,note_date=excluded.note_date,direction=excluded.direction,legal_entity_id=excluded.legal_entity_id,counterparty_id=excluded.counterparty_id,sender_id=excluded.sender_id,recipient_id=excluded.recipient_id,departure_place=excluded.departure_place,destination_place=excluded.destination_place,transport_reason=excluded.transport_reason,carrier=excluded.carrier,notes=excluded.notes;
 FOR item IN SELECT value FROM jsonb_array_elements(payload->'lines') LOOP
 lid=NULLIF(item->>'id','')::uuid;
 IF lid IS NOT NULL AND (lid=ANY(kept) OR NOT EXISTS(SELECT 1 FROM public.delivery_note_lines WHERE id=lid AND delivery_note_id=did)) THEN RAISE EXCEPTION 'Invalid line ID' USING ERRCODE='23514'; END IF;
 IF NULLIF(item->>'order_line_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.order_lines l JOIN public.orders ord ON ord.id=l.order_id WHERE l.id=(item->>'order_line_id')::uuid AND ((ord.archived_at IS NULL AND ord.status NOT IN ('draft','cancelled')) OR EXISTS(SELECT 1 FROM public.delivery_note_lines prev WHERE prev.id=lid AND prev.order_line_id=l.id))) THEN RAISE EXCEPTION 'Ordine non selezionabile' USING ERRCODE='23514'; END IF;
 IF trim(coalesce(item->>'description',''))='' THEN RAISE EXCEPTION 'Descrizione obbligatoria' USING ERRCODE='23514'; END IF;
 lid=coalesce(lid,gen_random_uuid());
 INSERT INTO public.delivery_note_lines(id,delivery_note_id,position,description,quantity,unit,project_id,order_line_id,notes)
 VALUES(lid,did,coalesce((item->>'position')::int,0),item->>'description',(item->>'quantity')::numeric,NULLIF(item->>'unit',''),NULLIF(item->>'project_id','')::uuid,NULLIF(item->>'order_line_id','')::uuid,NULLIF(item->>'notes',''))
 ON CONFLICT(id) DO UPDATE SET position=excluded.position,description=excluded.description,quantity=excluded.quantity,unit=excluded.unit,project_id=excluded.project_id,order_line_id=excluded.order_line_id,notes=excluded.notes;
 kept=array_append(kept,lid);
 END LOOP;
 DELETE FROM public.delivery_note_lines WHERE delivery_note_id=did AND NOT(id=ANY(kept));
 DELETE FROM public.delivery_note_projects WHERE delivery_note_id=did;
 INSERT INTO public.delivery_note_projects SELECT did,project_id FROM public.delivery_note_lines WHERE delivery_note_id=did AND project_id IS NOT NULL ON CONFLICT DO NOTHING;
 DELETE FROM public.delivery_note_orders WHERE delivery_note_id=did;
 INSERT INTO public.delivery_note_orders SELECT DISTINCT did,l.order_id FROM public.delivery_note_lines dl JOIN public.order_lines l ON l.id=dl.order_line_id WHERE dl.delivery_note_id=did ON CONFLICT DO NOTHING;
 FOR o IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(payload->'order_ids','[]')) LOOP
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=o AND archived_at IS NULL AND status NOT IN ('draft','cancelled')) THEN RAISE EXCEPTION 'Ordine non disponibile' USING ERRCODE='23514'; END IF;
 INSERT INTO public.delivery_note_orders VALUES(did,o) ON CONFLICT DO NOTHING; END LOOP;
 PERFORM public.check_commercial_integrity(); RETURN did;
END $$;

CREATE FUNCTION public.set_commercial_invoice(kind text,record_id uuid,invoice uuid,linked boolean,amount numeric DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(15101);
 IF kind NOT IN ('order','delivery_note') OR NOT public.app_has_permission(kind||'.update') OR NOT public.app_has_permission('invoice.read') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.invoices WHERE id=invoice AND archived_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='23514'; END IF;
 IF kind='order' THEN
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=record_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Order unavailable' USING ERRCODE='23514'; END IF;
 IF linked THEN INSERT INTO public.order_invoices VALUES(record_id,invoice,amount) ON CONFLICT(order_id,invoice_id) DO UPDATE SET allocated_amount=excluded.allocated_amount;
 ELSE DELETE FROM public.order_invoices WHERE order_id=record_id AND invoice_id=invoice; END IF;
 ELSE
 IF NOT EXISTS(SELECT 1 FROM public.delivery_notes WHERE id=record_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'DDT unavailable' USING ERRCODE='23514'; END IF;
 IF linked THEN INSERT INTO public.delivery_note_invoices VALUES(record_id,invoice) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.delivery_note_invoices WHERE delivery_note_id=record_id AND invoice_id=invoice; END IF;
 END IF;
 PERFORM public.check_commercial_integrity();
END $$;
CREATE FUNCTION public.set_commercial_invoice_line(payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE il public.invoice_lines; ol public.order_lines; dl public.delivery_note_lines;
BEGIN
 PERFORM pg_advisory_xact_lock(15101);
 IF NOT public.app_has_permission('invoice.read') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF NULLIF(payload->>'id','') IS NOT NULL THEN
 IF NOT public.app_has_permission('invoice.update') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 DELETE FROM public.commercial_invoice_lines WHERE id=(payload->>'id')::uuid; RETURN; END IF;
 SELECT * INTO il FROM public.invoice_lines WHERE id=(payload->>'invoice_line_id')::uuid;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=il.invoice_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Invalid invoice line' USING ERRCODE='23514'; END IF;
 SELECT * INTO dl FROM public.delivery_note_lines WHERE id=NULLIF(payload->>'delivery_note_line_id','')::uuid;
 SELECT * INTO ol FROM public.order_lines WHERE id=coalesce(NULLIF(payload->>'order_line_id','')::uuid,dl.order_line_id);
 IF ol.id IS NOT NULL THEN
 IF NOT public.app_has_permission('order.update') OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id=ol.order_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.order_invoices(order_id,invoice_id) VALUES(ol.order_id,il.invoice_id) ON CONFLICT DO NOTHING; END IF;
 IF dl.id IS NOT NULL THEN
 IF NOT public.app_has_permission('delivery_note.update') OR NOT EXISTS(SELECT 1 FROM public.delivery_notes WHERE id=dl.delivery_note_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.delivery_note_invoices VALUES(dl.delivery_note_id,il.invoice_id) ON CONFLICT DO NOTHING; END IF;
 INSERT INTO public.commercial_invoice_lines(invoice_line_id,order_line_id,delivery_note_line_id,quantity) VALUES(il.id,ol.id,dl.id,(payload->>'quantity')::numeric);
 PERFORM public.check_commercial_integrity();
END $$;

CREATE FUNCTION public.link_commercial_document(doc uuid,kind text,record_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entity uuid; company uuid; projects uuid[]; p uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(15101);
 IF kind NOT IN ('order','delivery_note') OR NOT public.app_has_permission(kind||'.update') OR NOT public.app_has_permission('document.update') OR NOT public.document_visible(doc) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF kind='order' THEN SELECT legal_entity_id,counterparty_id INTO entity,company FROM public.orders WHERE id=record_id AND archived_at IS NULL; SELECT array_agg(project_id) INTO projects FROM public.order_projects WHERE order_id=record_id;
 ELSE SELECT legal_entity_id,counterparty_id INTO entity,company FROM public.delivery_notes WHERE id=record_id AND archived_at IS NULL; SELECT array_agg(project_id) INTO projects FROM public.delivery_note_projects WHERE delivery_note_id=record_id; END IF;
 IF entity IS NULL OR NOT EXISTS(SELECT 1 FROM public.documents WHERE id=doc AND archived_at IS NULL AND legal_entity_id=entity) THEN RAISE EXCEPTION 'Documento o società incompatibile' USING ERRCODE='23514'; END IF;
 IF kind='order' THEN INSERT INTO public.document_orders VALUES(doc,record_id) ON CONFLICT DO NOTHING; ELSE INSERT INTO public.document_delivery_notes VALUES(doc,record_id) ON CONFLICT DO NOTHING; END IF;
 -- Context views derive projects and counterparties from the authoritative cycle relations.
END $$;

CREATE OR REPLACE FUNCTION public.archive_order(order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN PERFORM pg_advisory_xact_lock(15101); IF NOT public.app_has_permission('order.delete') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; UPDATE public.orders SET archived_at=now() WHERE id=order_id AND archived_at IS NULL; END $$;
CREATE OR REPLACE FUNCTION public.archive_delivery_note(note_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN PERFORM pg_advisory_xact_lock(15101); IF NOT public.app_has_permission('delivery_note.delete') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; UPDATE public.delivery_notes SET archived_at=now() WHERE id=note_id AND archived_at IS NULL; END $$;

CREATE VIEW public.commercial_anomalies WITH(security_invoker=true) AS
 SELECT 'order'::text kind,id record_id,'overdelivery'::text code,'anomaly'::text severity,'Quantità consegnata superiore all’ordinato'::text message FROM public.order_reconciliation WHERE fulfillment_status='overdelivered'
 UNION ALL SELECT 'order',id,'partial','attention','Ordine parzialmente evaso' FROM public.order_reconciliation WHERE fulfillment_status='partially_fulfilled'
 UNION ALL SELECT 'order',id,'not_delivered','info','Ordine confermato, nessuna consegna registrata' FROM public.order_reconciliation WHERE fulfillment_status='confirmed'
 UNION ALL SELECT 'order',id,'overinvoiced','anomaly','Importo fatturato attribuito superiore al valore ordine' FROM public.order_reconciliation WHERE invoiced_value>ordered_value
 UNION ALL SELECT 'delivery_note',d.id,'no_order','info','DDT senza ordine: verificare se previsto dal flusso' FROM public.delivery_notes d WHERE d.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_note_orders x WHERE x.delivery_note_id=d.id)
 UNION ALL SELECT 'delivery_note',d.id,'not_invoiced','info','Nessuna fattura attiva collegata al DDT' FROM public.delivery_notes d WHERE d.archived_at IS NULL AND public.app_has_permission('invoice.read') AND NOT EXISTS(SELECT 1 FROM public.delivery_note_invoices x JOIN public.invoices i ON i.id=x.invoice_id AND i.archived_at IS NULL WHERE x.delivery_note_id=d.id)
 UNION ALL SELECT 'order',o.id,'invoice_without_ddt','info','Fattura collegata senza DDT: il flusso può essere legittimo' FROM public.orders o WHERE o.archived_at IS NULL AND EXISTS(SELECT 1 FROM public.order_invoices oi JOIN public.invoices i ON i.id=oi.invoice_id AND i.archived_at IS NULL WHERE oi.order_id=o.id AND NOT EXISTS(SELECT 1 FROM public.delivery_note_invoices di JOIN public.delivery_notes d ON d.id=di.delivery_note_id AND d.archived_at IS NULL JOIN public.delivery_note_orders dor ON dor.delivery_note_id=d.id AND dor.order_id=o.id WHERE di.invoice_id=i.id));
GRANT SELECT ON public.commercial_anomalies TO authenticated;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['order_lines','order_projects','delivery_note_lines','delivery_note_projects','delivery_note_orders','order_invoices','delivery_note_invoices','document_orders','document_delivery_notes','commercial_invoice_lines'] LOOP
 EXECUTE format('CREATE TRIGGER audit_cycle AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_mutation()',t);
 END LOOP;
END $$;
CREATE FUNCTION public.commercial_events(kind text,record_id uuid) RETURNS TABLE(id uuid,user_id uuid,action text,created_at timestamptz,entity_type text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.id,a.user_id,a.action,a.created_at,a.entity_type FROM public.activity_logs a
 WHERE kind IN ('order','delivery_note') AND public.app_has_permission(kind||'.read') AND
 ((a.entity_type=CASE kind WHEN 'order' THEN 'orders' ELSE 'delivery_notes' END AND a.entity_id=record_id)
 OR (a.entity_type IN ('order_lines','order_projects','delivery_note_lines','delivery_note_projects','delivery_note_orders','order_invoices','delivery_note_invoices','document_orders','document_delivery_notes') AND (a.old_data->>(kind||'_id')=record_id::text OR a.new_data->>(kind||'_id')=record_id::text)))
 AND (a.entity_type NOT IN ('order_invoices','delivery_note_invoices') OR public.app_has_permission('invoice.read'))
 ORDER BY a.created_at DESC LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.set_commercial_invoice(text,uuid,uuid,boolean,numeric),public.set_commercial_invoice_line(jsonb),public.link_commercial_document(uuid,text,uuid),public.commercial_events(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_commercial_invoice(text,uuid,uuid,boolean,numeric),public.set_commercial_invoice_line(jsonb),public.link_commercial_document(uuid,text,uuid),public.commercial_events(text,uuid) TO authenticated;

-- Dynamic contexts: edits to projects/parties propagate without duplicated metadata.
CREATE OR REPLACE VIEW public.document_project_context WITH(security_invoker=true) AS
 SELECT document_id,project_id FROM public.document_projects
 UNION SELECT dc.document_id,ip.project_id FROM public.document_invoice_context dc JOIN public.invoice_projects ip ON ip.invoice_id=dc.invoice_id
 UNION SELECT dc.document_id,l.project_id FROM public.document_invoice_context dc JOIN public.invoice_lines l ON l.invoice_id=dc.invoice_id WHERE l.project_id IS NOT NULL
 UNION SELECT d.document_id,p.project_id FROM public.document_orders d JOIN public.order_projects p ON p.order_id=d.order_id
 UNION SELECT d.document_id,p.project_id FROM public.document_delivery_notes d JOIN public.delivery_note_projects p ON p.delivery_note_id=d.delivery_note_id;
CREATE OR REPLACE VIEW public.document_company_context WITH(security_invoker=true) AS
 SELECT document_id,company_id FROM public.document_companies
 UNION SELECT dc.document_id,coalesce(i.supplier_id,i.customer_id) FROM public.document_invoice_context dc JOIN public.invoices i ON i.id=dc.invoice_id WHERE coalesce(i.supplier_id,i.customer_id) IS NOT NULL
 UNION SELECT d.document_id,o.counterparty_id FROM public.document_orders d JOIN public.orders o ON o.id=d.order_id
 UNION SELECT d.document_id,n.counterparty_id FROM public.document_delivery_notes d JOIN public.delivery_notes n ON n.id=d.delivery_note_id WHERE n.counterparty_id IS NOT NULL;
-- Recover existing line-level links and legacy authoritative PDFs additively.
INSERT INTO public.delivery_note_orders SELECT DISTINCT d.delivery_note_id,l.order_id FROM public.delivery_note_lines d JOIN public.order_lines l ON l.id=d.order_line_id ON CONFLICT DO NOTHING;
INSERT INTO public.document_orders SELECT document_id,id FROM public.orders WHERE document_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.document_delivery_notes SELECT document_id,id FROM public.delivery_notes WHERE document_id IS NOT NULL ON CONFLICT DO NOTHING;

COMMIT;
