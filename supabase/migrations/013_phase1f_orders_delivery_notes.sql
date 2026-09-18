-- Fase 1F.1: ordini, DDT e relazioni quantitative.
BEGIN;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number text NOT NULL, order_type text NOT NULL CHECK(order_type IN ('purchase','sale')),
  legal_entity_id uuid NOT NULL REFERENCES public.legal_entities(id), counterparty_id uuid NOT NULL REFERENCES public.companies(id),
  order_date date NOT NULL, counterparty_reference text, currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed','partially_fulfilled','fulfilled','cancelled')),
  subject text, description text, notes text, document_id uuid REFERENCES public.documents(id), created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
  UNIQUE(order_number,order_type,legal_entity_id)
);
CREATE TABLE IF NOT EXISTS public.order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0, description text NOT NULL, quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit text,
  unit_price numeric(14,4) NOT NULL DEFAULT 0 CHECK(unit_price>=0), discount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount>=0),
  vat_rate numeric(5,2), vat_amount numeric(14,2) NOT NULL DEFAULT 0, amount_net numeric(14,2) NOT NULL DEFAULT 0, amount_total numeric(14,2) NOT NULL DEFAULT 0,
  project_id uuid REFERENCES public.projects(id), notes text
);
CREATE TABLE IF NOT EXISTS public.order_projects(order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE, project_id uuid REFERENCES public.projects(id), PRIMARY KEY(order_id,project_id));
CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note_number text NOT NULL, note_date date NOT NULL, direction text NOT NULL CHECK(direction IN ('inbound','outbound')),
  legal_entity_id uuid NOT NULL REFERENCES public.legal_entities(id), sender_id uuid REFERENCES public.companies(id), recipient_id uuid REFERENCES public.companies(id),
  counterparty_id uuid REFERENCES public.companies(id), departure_place text, destination_place text, transport_reason text, carrier text, notes text,
  document_id uuid REFERENCES public.documents(id), created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
  UNIQUE(note_number,legal_entity_id)
);
CREATE TABLE IF NOT EXISTS public.delivery_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0, description text NOT NULL, quantity numeric(14,3) NOT NULL CHECK(quantity>0), unit text, project_id uuid REFERENCES public.projects(id), order_line_id uuid REFERENCES public.order_lines(id), notes text
);
CREATE TABLE IF NOT EXISTS public.delivery_note_projects(delivery_note_id uuid REFERENCES public.delivery_notes(id) ON DELETE CASCADE, project_id uuid REFERENCES public.projects(id), PRIMARY KEY(delivery_note_id,project_id));
CREATE TABLE IF NOT EXISTS public.delivery_note_orders(delivery_note_id uuid REFERENCES public.delivery_notes(id) ON DELETE CASCADE, order_id uuid REFERENCES public.orders(id), PRIMARY KEY(delivery_note_id,order_id));
CREATE TABLE IF NOT EXISTS public.delivery_note_invoices(delivery_note_id uuid REFERENCES public.delivery_notes(id) ON DELETE CASCADE, invoice_id uuid REFERENCES public.invoices(id), PRIMARY KEY(delivery_note_id,invoice_id));
CREATE TABLE IF NOT EXISTS public.order_invoices(order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE, invoice_id uuid REFERENCES public.invoices(id), PRIMARY KEY(order_id,invoice_id));
CREATE TABLE IF NOT EXISTS public.document_orders(document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE, order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE, PRIMARY KEY(document_id,order_id));
CREATE TABLE IF NOT EXISTS public.document_delivery_notes(document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE, delivery_note_id uuid REFERENCES public.delivery_notes(id) ON DELETE CASCADE, PRIMARY KEY(document_id,delivery_note_id));

CREATE INDEX IF NOT EXISTS orders_date_idx ON public.orders(order_date); CREATE INDEX IF NOT EXISTS orders_counterparty_idx ON public.orders(counterparty_id); CREATE INDEX IF NOT EXISTS orders_entity_idx ON public.orders(legal_entity_id);
CREATE INDEX IF NOT EXISTS order_lines_order_idx ON public.order_lines(order_id); CREATE INDEX IF NOT EXISTS order_lines_project_idx ON public.order_lines(project_id);
CREATE INDEX IF NOT EXISTS ddt_date_idx ON public.delivery_notes(note_date); CREATE INDEX IF NOT EXISTS ddt_counterparty_idx ON public.delivery_notes(counterparty_id); CREATE INDEX IF NOT EXISTS ddt_lines_order_idx ON public.delivery_note_lines(order_line_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_projects ENABLE ROW LEVEL SECURITY; ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY; ALTER TABLE public.delivery_note_lines ENABLE ROW LEVEL SECURITY; ALTER TABLE public.delivery_note_projects ENABLE ROW LEVEL SECURITY; ALTER TABLE public.delivery_note_orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.delivery_note_invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE public.order_invoices ENABLE ROW LEVEL SECURITY; ALTER TABLE public.document_orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.document_delivery_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.orders,public.order_lines,public.order_projects,public.delivery_notes,public.delivery_note_lines,public.delivery_note_projects,public.delivery_note_orders,public.delivery_note_invoices,public.order_invoices,public.document_orders,public.document_delivery_notes TO authenticated;
CREATE POLICY orders_read ON public.orders FOR SELECT TO authenticated USING(public.app_has_permission('order.read')); CREATE POLICY orders_write ON public.orders FOR ALL TO authenticated USING(public.app_has_permission('order.update')) WITH CHECK(public.app_has_permission('order.update')); CREATE POLICY orders_insert ON public.orders FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('order.create'));
CREATE POLICY order_lines_read ON public.order_lines FOR SELECT TO authenticated USING(public.app_has_permission('order.read')); CREATE POLICY order_links_read ON public.order_projects FOR SELECT TO authenticated USING(public.app_has_permission('order.read'));
CREATE POLICY ddt_read ON public.delivery_notes FOR SELECT TO authenticated USING(public.app_has_permission('delivery_note.read')); CREATE POLICY ddt_write ON public.delivery_notes FOR ALL TO authenticated USING(public.app_has_permission('delivery_note.update')) WITH CHECK(public.app_has_permission('delivery_note.update')); CREATE POLICY ddt_insert ON public.delivery_notes FOR INSERT TO authenticated WITH CHECK(public.app_has_permission('delivery_note.create'));
CREATE POLICY ddt_lines_read ON public.delivery_note_lines FOR SELECT TO authenticated USING(public.app_has_permission('delivery_note.read')); CREATE POLICY ddt_links_read ON public.delivery_note_orders FOR SELECT TO authenticated USING(public.app_has_permission('delivery_note.read')); CREATE POLICY ddt_project_links_read ON public.delivery_note_projects FOR SELECT TO authenticated USING(public.app_has_permission('delivery_note.read')); CREATE POLICY ddt_invoice_links_read ON public.delivery_note_invoices FOR SELECT TO authenticated USING(public.app_has_permission('delivery_note.read')); CREATE POLICY order_invoice_links_read ON public.order_invoices FOR SELECT TO authenticated USING(public.app_has_permission('order.read'));
CREATE POLICY doc_order_links_read ON public.document_orders FOR SELECT TO authenticated USING(public.app_has_permission('document.read')); CREATE POLICY doc_ddt_links_read ON public.document_delivery_notes FOR SELECT TO authenticated USING(public.app_has_permission('document.read'));

CREATE OR REPLACE FUNCTION public.save_order(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oid uuid:=NULLIF(payload->>'id','')::uuid; item jsonb; lid uuid; net numeric; vat numeric; total numeric; p uuid;
BEGIN
 IF NOT public.app_has_permission(CASE WHEN oid IS NULL THEN 'order.create' ELSE 'order.update' END) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF oid IS NULL THEN INSERT INTO public.orders(order_number,order_type,legal_entity_id,counterparty_id,order_date,counterparty_reference,currency,status,subject,description,notes,created_by) VALUES(payload->>'order_number',payload->>'order_type',(payload->>'legal_entity_id')::uuid,(payload->>'counterparty_id')::uuid,(payload->>'order_date')::date,NULLIF(payload->>'counterparty_reference',''),upper(payload->>'currency'),COALESCE(NULLIF(payload->>'status',''),'draft'),NULLIF(payload->>'subject',''),NULLIF(payload->>'description',''),NULLIF(payload->>'notes',''),auth.uid()) RETURNING id INTO oid;
 ELSE UPDATE public.orders SET order_number=payload->>'order_number',order_type=payload->>'order_type',legal_entity_id=(payload->>'legal_entity_id')::uuid,counterparty_id=(payload->>'counterparty_id')::uuid,order_date=(payload->>'order_date')::date,counterparty_reference=NULLIF(payload->>'counterparty_reference',''),currency=upper(payload->>'currency'),status=payload->>'status',subject=NULLIF(payload->>'subject',''),description=NULLIF(payload->>'description',''),notes=NULLIF(payload->>'notes','') WHERE id=oid AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'Order unavailable' USING ERRCODE='42501'; END IF; DELETE FROM public.order_lines WHERE order_id=oid; DELETE FROM public.order_projects WHERE order_id=oid; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'lines','[]'::jsonb)) LOOP net=round(((item->>'quantity')::numeric*(item->>'unit_price')::numeric)-COALESCE((item->>'discount')::numeric,0),2); vat=round(net*COALESCE((item->>'vat_rate')::numeric,0)/100,2); total=net+vat; INSERT INTO public.order_lines(order_id,position,description,quantity,unit,unit_price,discount,vat_rate,vat_amount,amount_net,amount_total,project_id,notes) VALUES(oid,COALESCE((item->>'position')::int,0),item->>'description',(item->>'quantity')::numeric,NULLIF(item->>'unit',''),(item->>'unit_price')::numeric,COALESCE((item->>'discount')::numeric,0),NULLIF(item->>'vat_rate','')::numeric,vat,net,total,NULLIF(item->>'project_id','')::uuid,NULLIF(item->>'notes','')) RETURNING id INTO lid; IF (item->>'project_id') IS NOT NULL AND item->>'project_id'<>'' THEN INSERT INTO public.order_projects VALUES(oid,(item->>'project_id')::uuid) ON CONFLICT DO NOTHING; END IF; END LOOP;
 FOR p IN SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(payload->'project_ids','[]'::jsonb)) LOOP INSERT INTO public.order_projects VALUES(oid,p) ON CONFLICT DO NOTHING; END LOOP; RETURN oid;
END $$;
REVOKE ALL ON FUNCTION public.save_order(jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.save_order(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_delivery_note(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE did uuid:=NULLIF(payload->>'id','')::uuid; item jsonb; dlid uuid; p uuid; o uuid;
BEGIN
 IF NOT public.app_has_permission(CASE WHEN did IS NULL THEN 'delivery_note.create' ELSE 'delivery_note.update' END) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF did IS NULL THEN INSERT INTO public.delivery_notes(note_number,note_date,direction,legal_entity_id,sender_id,recipient_id,counterparty_id,departure_place,destination_place,transport_reason,carrier,notes,created_by) VALUES(payload->>'note_number',(payload->>'note_date')::date,payload->>'direction',(payload->>'legal_entity_id')::uuid,NULLIF(payload->>'sender_id','')::uuid,NULLIF(payload->>'recipient_id','')::uuid,NULLIF(payload->>'counterparty_id','')::uuid,NULLIF(payload->>'departure_place',''),NULLIF(payload->>'destination_place',''),NULLIF(payload->>'transport_reason',''),NULLIF(payload->>'carrier',''),NULLIF(payload->>'notes',''),auth.uid()) RETURNING id INTO did; ELSE UPDATE public.delivery_notes SET note_number=payload->>'note_number',note_date=(payload->>'note_date')::date,direction=payload->>'direction',legal_entity_id=(payload->>'legal_entity_id')::uuid,sender_id=NULLIF(payload->>'sender_id','')::uuid,recipient_id=NULLIF(payload->>'recipient_id','')::uuid,counterparty_id=NULLIF(payload->>'counterparty_id','')::uuid,departure_place=NULLIF(payload->>'departure_place',''),destination_place=NULLIF(payload->>'destination_place',''),transport_reason=NULLIF(payload->>'transport_reason',''),carrier=NULLIF(payload->>'carrier',''),notes=NULLIF(payload->>'notes','') WHERE id=did AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'DDT unavailable' USING ERRCODE='42501'; END IF; DELETE FROM public.delivery_note_lines WHERE delivery_note_id=did; DELETE FROM public.delivery_note_projects WHERE delivery_note_id=did; DELETE FROM public.delivery_note_orders WHERE delivery_note_id=did; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'lines','[]'::jsonb)) LOOP INSERT INTO public.delivery_note_lines(delivery_note_id,position,description,quantity,unit,project_id,order_line_id,notes) VALUES(did,COALESCE((item->>'position')::int,0),item->>'description',(item->>'quantity')::numeric,NULLIF(item->>'unit',''),NULLIF(item->>'project_id','')::uuid,NULLIF(item->>'order_line_id','')::uuid,NULLIF(item->>'notes','')); IF NULLIF(item->>'project_id','') IS NOT NULL THEN INSERT INTO public.delivery_note_projects VALUES(did,(item->>'project_id')::uuid) ON CONFLICT DO NOTHING; END IF; IF NULLIF(item->>'order_id','') IS NOT NULL THEN INSERT INTO public.delivery_note_orders VALUES(did,(item->>'order_id')::uuid) ON CONFLICT DO NOTHING; END IF; END LOOP;
 FOR o IN SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(payload->'order_ids','[]'::jsonb)) LOOP INSERT INTO public.delivery_note_orders VALUES(did,o) ON CONFLICT DO NOTHING; END LOOP; RETURN did;
END $$;
REVOKE ALL ON FUNCTION public.save_delivery_note(jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.save_delivery_note(jsonb) TO authenticated;

CREATE OR REPLACE VIEW public.order_reconciliation WITH (security_invoker=true) AS
SELECT o.id,o.order_number,o.order_type,o.legal_entity_id,o.counterparty_id,o.order_date,o.currency,o.status,o.archived_at,
 COALESCE((SELECT sum(l.amount_total) FROM public.order_lines l WHERE l.order_id=o.id),0) ordered_value,
 COALESCE((SELECT sum(dl.quantity*l.unit_price) FROM public.delivery_note_lines dl JOIN public.order_lines l ON l.id=dl.order_line_id JOIN public.delivery_notes d ON d.id=dl.delivery_note_id AND d.archived_at IS NULL WHERE l.order_id=o.id),0) delivered_value,
 COALESCE((SELECT sum(i.amount_total) FROM public.order_invoices oi JOIN public.invoices i ON i.id=oi.invoice_id AND i.archived_at IS NULL WHERE oi.order_id=o.id),0) invoiced_value
FROM public.orders o WHERE o.archived_at IS NULL;
GRANT SELECT ON public.order_reconciliation TO authenticated;

CREATE OR REPLACE VIEW public.delivery_note_register WITH (security_invoker=true) AS
SELECT d.*,COALESCE((SELECT array_agg(DISTINCT p.project_id) FROM public.delivery_note_projects p WHERE p.delivery_note_id=d.id),'{}') project_ids,COALESCE((SELECT array_agg(DISTINCT o.order_id) FROM public.delivery_note_orders o WHERE o.delivery_note_id=d.id),'{}') order_ids,COALESCE((SELECT array_agg(DISTINCT i.invoice_id) FROM public.delivery_note_invoices i WHERE i.delivery_note_id=d.id),'{}') invoice_ids
FROM public.delivery_notes d WHERE d.archived_at IS NULL;
GRANT SELECT ON public.delivery_note_register TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_order(order_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NOT public.app_has_permission('order.delete') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; UPDATE public.orders SET archived_at=now() WHERE id=order_id AND archived_at IS NULL; END $$;
CREATE OR REPLACE FUNCTION public.archive_delivery_note(note_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NOT public.app_has_permission('delivery_note.delete') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; UPDATE public.delivery_notes SET archived_at=now() WHERE id=note_id AND archived_at IS NULL; END $$;
REVOKE ALL ON FUNCTION public.archive_order(uuid),public.archive_delivery_note(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.archive_order(uuid),public.archive_delivery_note(uuid) TO authenticated;

CREATE TRIGGER orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at(); CREATE TRIGGER ddt_updated BEFORE UPDATE ON public.delivery_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.audit_mutation(); CREATE TRIGGER audit_ddt AFTER INSERT OR UPDATE OR DELETE ON public.delivery_notes FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
COMMIT;
