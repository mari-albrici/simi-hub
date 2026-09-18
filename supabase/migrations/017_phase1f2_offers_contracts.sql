-- Fase 1F.2: offerte/preventivi e contratti. Additive, no remote application.
BEGIN;

CREATE OR REPLACE FUNCTION public.app_has_permission(permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(CASE public.app_role()
 WHEN 'admin' THEN true
 WHEN 'administration' THEN permission = ANY(ARRAY['project.read','project.create','project.update','document.read','document.upload','document.update','invoice.read','invoice.create','invoice.update','company.read','company.create','company.update','legal_entity.read','legal_entity.create','deadline.read','deadline.write','dashboard.read','report.read','profile.directory','order.read','order.create','order.update','delivery_note.read','delivery_note.create','delivery_note.update','offer.read','offer.create','offer.update','offer.archive','contract.read','contract.create','contract.update','contract.archive'])
 WHEN 'management' THEN permission = ANY(ARRAY['project.read','document.read','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','report.read','profile.directory','order.read','delivery_note.read','offer.read','contract.read'])
 WHEN 'project_manager' THEN permission = ANY(ARRAY['project.read','project.create','project.update','document.read','document.upload','document.update','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','profile.directory','deadline.write','order.read','order.create','order.update','delivery_note.read','delivery_note.create','delivery_note.update','offer.read','offer.create','offer.update','offer.archive','contract.read','contract.create','contract.update','contract.archive'])
 WHEN 'technical' THEN permission = ANY(ARRAY['project.read','project.update','document.read','document.upload','document.update','company.read','legal_entity.read','deadline.read','profile.directory','order.read','delivery_note.read','offer.read','contract.read'])
 WHEN 'viewer' THEN permission = ANY(ARRAY['project.read','document.read','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','report.read','profile.directory','offer.read','contract.read'])
 WHEN 'hr' THEN permission = ANY(ARRAY['project.read','document.read','document.upload','document.update','employee.read','employee.update','legal_entity.read','deadline.read','deadline.write','profile.directory'])
 ELSE false END,false)
$$;

CREATE TABLE public.offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 offer_group_id uuid NOT NULL,
 offer_number text NOT NULL,
 revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
 is_current boolean NOT NULL DEFAULT true,
 issued_at date,
 valid_until date,
 legal_entity_id uuid NOT NULL REFERENCES public.legal_entities(id),
 counterparty_id uuid REFERENCES public.companies(id),
 contact_name text,
 subject text,
 description text,
 currency text NOT NULL DEFAULT 'EUR',
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','under_review','accepted','rejected','expired','cancelled')),
 amount_net numeric(14,2) NOT NULL DEFAULT 0,
 vat_amount numeric(14,2) NOT NULL DEFAULT 0,
 amount_total numeric(14,2) NOT NULL DEFAULT 0,
 notes text,
 document_id uuid REFERENCES public.documents(id),
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES auth.users(id),
 UNIQUE(offer_number, revision)
);
CREATE UNIQUE INDEX offers_current_number ON public.offers(offer_number) WHERE is_current AND archived_at IS NULL;
CREATE TABLE public.offer_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE RESTRICT,
 position integer NOT NULL DEFAULT 0, description text NOT NULL, quantity numeric(14,3) NOT NULL,
 unit text, unit_price numeric(14,4) NOT NULL, discount numeric(7,3) NOT NULL DEFAULT 0 CHECK(discount BETWEEN -100 AND 100),
 amount_net numeric(14,2) NOT NULL DEFAULT 0, vat_rate numeric(6,3), vat_amount numeric(14,2) NOT NULL DEFAULT 0, amount_total numeric(14,2) NOT NULL DEFAULT 0,
 project_id uuid REFERENCES public.projects(id), notes text
);
CREATE TABLE public.offer_projects (offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE RESTRICT, project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT, PRIMARY KEY(offer_id,project_id));
CREATE TABLE public.offer_orders (offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE RESTRICT, order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT, PRIMARY KEY(offer_id,order_id));

CREATE TABLE public.contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text NOT NULL, title text NOT NULL, contract_type text NOT NULL DEFAULT 'other',
 legal_entity_id uuid NOT NULL REFERENCES public.legal_entities(id), counterparty_id uuid REFERENCES public.companies(id), contact_name text,
 contract_date date, starts_at date, expires_at date, renewal_at date, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','suspended','expired','terminated','cancelled','archived')),
 contract_value numeric(14,2), currency text, description text, notes text, archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES auth.users(id), UNIQUE(reference)
);
CREATE TABLE public.contract_projects (contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT, project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT, PRIMARY KEY(contract_id,project_id));
CREATE TABLE public.contract_orders (contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT, order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT, PRIMARY KEY(contract_id,order_id));
CREATE TABLE public.contract_invoices (contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT, invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT, PRIMARY KEY(contract_id,invoice_id));
CREATE TABLE public.document_offers (document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT, offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE RESTRICT, PRIMARY KEY(document_id,offer_id));
CREATE TABLE public.document_contracts (document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT, contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT, PRIMARY KEY(document_id,contract_id));

CREATE INDEX offers_search ON public.offers(offer_number, issued_at, status) WHERE archived_at IS NULL;
CREATE INDEX contracts_search ON public.contracts(reference, expires_at, status) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.offer_contract_permission(p text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.app_has_permission(p) $$;
CREATE OR REPLACE FUNCTION public.offer_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.valid_until < CURRENT_DATE AND NEW.status IN ('draft','sent','under_review') THEN NEW.status := 'expired'; END IF; NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER offer_expiry BEFORE INSERT OR UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.offer_expiry();
CREATE OR REPLACE FUNCTION public.contract_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.expires_at < CURRENT_DATE AND NEW.status IN ('draft','active','suspended') THEN NEW.status := 'expired'; END IF; NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER contract_expiry BEFORE INSERT OR UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.contract_expiry();
CREATE OR REPLACE FUNCTION public.sync_contract_deadline() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM public.deadlines WHERE title LIKE 'Scadenza contratto: ' || COALESCE(OLD.reference,NEW.reference) AND contract_id = COALESCE(OLD.id,NEW.id);
 IF NEW.expires_at IS NOT NULL AND NEW.archived_at IS NULL THEN
   INSERT INTO public.deadlines(title,description,due_date,status,priority,legal_entity_id,company_id,contract_id) VALUES ('Scadenza contratto: '||NEW.reference,NEW.title,NEW.expires_at,'open','high',NEW.legal_entity_id,NEW.counterparty_id,NEW.id);
 END IF; RETURN NEW;
END $$;
ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id);
DROP TRIGGER IF EXISTS contract_deadline_sync ON public.contracts;
CREATE TRIGGER contract_deadline_sync AFTER INSERT OR UPDATE OF reference,expires_at,archived_at,legal_entity_id,counterparty_id ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.sync_contract_deadline();

CREATE OR REPLACE FUNCTION public.save_offer(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oid uuid := NULLIF(payload->>'id','')::uuid; item jsonb; lid uuid; kept uuid[] := '{}'; p uuid; net numeric; vat numeric; old public.offers;
BEGIN
 PERFORM pg_advisory_xact_lock(17017);
 IF NOT public.app_has_permission(CASE WHEN oid IS NULL THEN 'offer.create' ELSE 'offer.update' END) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'lines')=0 THEN RAISE EXCEPTION 'Righe obbligatorie' USING ERRCODE='23514'; END IF;
 IF oid IS NULL THEN oid := gen_random_uuid(); ELSE SELECT * INTO old FROM public.offers WHERE id=oid AND archived_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Offer unavailable' USING ERRCODE='42501'; END IF; END IF;
 INSERT INTO public.offers(id,offer_group_id,offer_number,revision,is_current,issued_at,valid_until,legal_entity_id,counterparty_id,contact_name,subject,description,currency,status,amount_net,vat_amount,amount_total,notes,created_by)
 VALUES(oid,coalesce(NULLIF(payload->>'offer_group_id','')::uuid,oid),trim(payload->>'offer_number'),coalesce((payload->>'revision')::int,0),true,NULLIF(payload->>'issued_at','')::date,NULLIF(payload->>'valid_until','')::date,(payload->>'legal_entity_id')::uuid,NULLIF(payload->>'counterparty_id','')::uuid,NULLIF(payload->>'contact_name',''),NULLIF(payload->>'subject',''),NULLIF(payload->>'description',''),upper(coalesce(payload->>'currency','EUR')),coalesce(NULLIF(payload->>'status',''),'draft'),coalesce((payload->>'amount_net')::numeric,0),coalesce((payload->>'vat_amount')::numeric,0),coalesce((payload->>'amount_total')::numeric,0),NULLIF(payload->>'notes',''),auth.uid())
 ON CONFLICT(id) DO UPDATE SET offer_number=excluded.offer_number,issued_at=excluded.issued_at,valid_until=excluded.valid_until,legal_entity_id=excluded.legal_entity_id,counterparty_id=excluded.counterparty_id,contact_name=excluded.contact_name,subject=excluded.subject,description=excluded.description,currency=excluded.currency,status=excluded.status,amount_net=excluded.amount_net,vat_amount=excluded.vat_amount,amount_total=excluded.amount_total,notes=excluded.notes,is_current=true;
 UPDATE public.offers SET is_current=false WHERE offer_number=(SELECT offer_number FROM public.offers WHERE id=oid) AND id<>oid;
 FOR item IN SELECT value FROM jsonb_array_elements(payload->'lines') LOOP
   lid=NULLIF(item->>'id','')::uuid; IF lid IS NULL THEN lid:=gen_random_uuid(); END IF;
   net:=round((item->>'quantity')::numeric*(item->>'unit_price')::numeric*(1-coalesce((item->>'discount')::numeric,0)/100),2); vat:=round(net*coalesce((item->>'vat_rate')::numeric,0)/100,2);
   INSERT INTO public.offer_lines(id,offer_id,position,description,quantity,unit,unit_price,discount,amount_net,vat_rate,vat_amount,amount_total,project_id,notes) VALUES(lid,oid,coalesce((item->>'position')::int,0),trim(item->>'description'),(item->>'quantity')::numeric,NULLIF(item->>'unit',''),(item->>'unit_price')::numeric,coalesce((item->>'discount')::numeric,0),net,NULLIF(item->>'vat_rate','')::numeric,vat,net+vat,NULLIF(item->>'project_id','')::uuid,NULLIF(item->>'notes','')) ON CONFLICT(id) DO UPDATE SET description=excluded.description,quantity=excluded.quantity,unit=excluded.unit,unit_price=excluded.unit_price,discount=excluded.discount,amount_net=excluded.amount_net,vat_rate=excluded.vat_rate,vat_amount=excluded.vat_amount,amount_total=excluded.amount_total,project_id=excluded.project_id,notes=excluded.notes;
   kept:=array_append(kept,lid);
 END LOOP;
 DELETE FROM public.offer_lines WHERE offer_id=oid AND NOT(id=ANY(kept)); DELETE FROM public.offer_projects WHERE offer_id=oid;
 FOR p IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(payload->'project_ids','[]')) LOOP INSERT INTO public.offer_projects VALUES(oid,p) ON CONFLICT DO NOTHING; END LOOP;
 UPDATE public.offers SET amount_net=(SELECT coalesce(sum(amount_net),0) FROM public.offer_lines WHERE offer_id=oid),vat_amount=(SELECT coalesce(sum(vat_amount),0) FROM public.offer_lines WHERE offer_id=oid),amount_total=(SELECT coalesce(sum(amount_total),0) FROM public.offer_lines WHERE offer_id=oid) WHERE id=oid;
 RETURN oid;
END $$;

CREATE OR REPLACE FUNCTION public.save_contract(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cid uuid:=NULLIF(payload->>'id','')::uuid; p uuid; BEGIN
 IF NOT public.app_has_permission(CASE WHEN cid IS NULL THEN 'contract.create' ELSE 'contract.update' END) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; cid:=coalesce(cid,gen_random_uuid());
 INSERT INTO public.contracts(id,reference,title,contract_type,legal_entity_id,counterparty_id,contact_name,contract_date,starts_at,expires_at,renewal_at,status,contract_value,currency,description,notes,created_by) VALUES(cid,trim(payload->>'reference'),trim(payload->>'title'),coalesce(NULLIF(payload->>'contract_type',''),'other'),(payload->>'legal_entity_id')::uuid,NULLIF(payload->>'counterparty_id','')::uuid,NULLIF(payload->>'contact_name',''),NULLIF(payload->>'contract_date','')::date,NULLIF(payload->>'starts_at','')::date,NULLIF(payload->>'expires_at','')::date,NULLIF(payload->>'renewal_at','')::date,coalesce(NULLIF(payload->>'status',''),'draft'),NULLIF(payload->>'contract_value','')::numeric,NULLIF(payload->>'currency',''),NULLIF(payload->>'description',''),NULLIF(payload->>'notes',''),auth.uid()) ON CONFLICT(id) DO UPDATE SET reference=excluded.reference,title=excluded.title,contract_type=excluded.contract_type,legal_entity_id=excluded.legal_entity_id,counterparty_id=excluded.counterparty_id,contact_name=excluded.contact_name,contract_date=excluded.contract_date,starts_at=excluded.starts_at,expires_at=excluded.expires_at,renewal_at=excluded.renewal_at,status=excluded.status,contract_value=excluded.contract_value,currency=excluded.currency,description=excluded.description,notes=excluded.notes;
 DELETE FROM public.contract_projects WHERE contract_id=cid; FOR p IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(payload->'project_ids','[]')) LOOP INSERT INTO public.contract_projects VALUES(cid,p) ON CONFLICT DO NOTHING; END LOOP; RETURN cid; END $$;

CREATE OR REPLACE FUNCTION public.archive_offer(p_id uuid,p_restore boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NOT public.app_has_permission('offer.archive') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; UPDATE public.offers SET archived_at=CASE WHEN p_restore THEN NULL ELSE now() END,is_current=CASE WHEN p_restore THEN true ELSE false END,status=CASE WHEN p_restore THEN status ELSE 'cancelled' END WHERE id=p_id; END $$;
CREATE OR REPLACE FUNCTION public.archive_contract(p_id uuid,p_restore boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NOT public.app_has_permission('contract.archive') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; UPDATE public.contracts SET archived_at=CASE WHEN p_restore THEN NULL ELSE now() END,status=CASE WHEN p_restore THEN status ELSE 'archived' END WHERE id=p_id; END $$;
CREATE OR REPLACE FUNCTION public.link_offer_document(doc uuid,offer uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NOT public.app_has_permission('offer.update') OR NOT public.document_visible(doc) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; INSERT INTO public.document_offers(document_id,offer_id) VALUES(doc,offer) ON CONFLICT DO NOTHING; END $$;
CREATE OR REPLACE FUNCTION public.link_contract_document(doc uuid,contract uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NOT public.app_has_permission('contract.update') OR NOT public.document_visible(doc) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; INSERT INTO public.document_contracts(document_id,contract_id) VALUES(doc,contract) ON CONFLICT DO NOTHING; END $$;

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['offers','offer_lines','offer_projects','offer_orders','contracts','contract_projects','contract_orders','contract_invoices','document_offers','document_contracts'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t); EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t); END LOOP; END $$;
CREATE POLICY offers_read ON public.offers FOR SELECT TO authenticated USING(public.app_has_permission('offer.read'));
CREATE POLICY offers_write ON public.offers FOR ALL TO authenticated USING(public.app_has_permission('offer.update')) WITH CHECK(public.app_has_permission('offer.update'));
CREATE POLICY offer_lines_read ON public.offer_lines FOR SELECT TO authenticated USING(public.app_has_permission('offer.read'));
CREATE POLICY offer_links_read ON public.offer_projects FOR SELECT TO authenticated USING(public.app_has_permission('offer.read'));
CREATE POLICY offer_order_links_read ON public.offer_orders FOR SELECT TO authenticated USING(public.app_has_permission('offer.read') AND public.app_has_permission('order.read'));
CREATE POLICY contracts_read ON public.contracts FOR SELECT TO authenticated USING(public.app_has_permission('contract.read'));
CREATE POLICY contracts_write ON public.contracts FOR ALL TO authenticated USING(public.app_has_permission('contract.update')) WITH CHECK(public.app_has_permission('contract.update'));
CREATE POLICY contract_links_read ON public.contract_projects FOR SELECT TO authenticated USING(public.app_has_permission('contract.read'));
CREATE POLICY contract_order_links_read ON public.contract_orders FOR SELECT TO authenticated USING(public.app_has_permission('contract.read') AND public.app_has_permission('order.read'));
CREATE POLICY contract_invoice_links_read ON public.contract_invoices FOR SELECT TO authenticated USING(public.app_has_permission('contract.read') AND public.app_has_permission('invoice.read'));
CREATE POLICY document_offer_links_read ON public.document_offers FOR SELECT TO authenticated USING(public.app_has_permission('offer.read') AND public.document_visible(document_id));
CREATE POLICY document_contract_links_read ON public.document_contracts FOR SELECT TO authenticated USING(public.app_has_permission('contract.read') AND public.document_visible(document_id));
GRANT EXECUTE ON FUNCTION public.save_offer(jsonb),public.save_contract(jsonb),public.archive_offer(uuid,boolean),public.archive_contract(uuid,boolean),public.link_offer_document(uuid,uuid),public.link_contract_document(uuid,uuid) TO authenticated;
COMMIT;
