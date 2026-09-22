-- Additive remediation of the HIGH findings. No historical rows are rewritten.
BEGIN;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS cig text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS cup text;

-- Update the pre-022 function in place: existing policy OIDs stay valid.
CREATE OR REPLACE FUNCTION public.app_has_permission_before_2b(permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(CASE public.app_role()
 WHEN 'admin' THEN true
 WHEN 'administration' THEN permission = ANY(ARRAY['project.read','project.create','project.update','document.read','document.upload','document.update','invoice.read','invoice.create','invoice.update','company.read','company.create','company.update','legal_entity.read','legal_entity.create','deadline.read','deadline.write','dashboard.read','report.read','profile.directory','order.read','order.create','order.update','delivery_note.read','delivery_note.create','delivery_note.update','offer.read','offer.create','offer.update','offer.archive','contract.read','contract.create','contract.update','contract.archive'])
 WHEN 'management' THEN permission = ANY(ARRAY['project.read','document.read','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','report.read','profile.directory','order.read','delivery_note.read','offer.read','contract.read'])
 WHEN 'project_manager' THEN permission = ANY(ARRAY['project.read','project.create','project.update','document.read','document.upload','document.update','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','profile.directory','deadline.write','order.read','order.create','order.update','delivery_note.read','delivery_note.create','delivery_note.update','offer.read','offer.create','offer.update','offer.archive','contract.read','contract.create','contract.update','contract.archive'])
 WHEN 'technical' THEN permission = ANY(ARRAY['project.read','project.update','document.read','document.upload','document.update','company.read','legal_entity.read','deadline.read','profile.directory','order.read','delivery_note.read','offer.read','contract.read'])
 WHEN 'viewer' THEN permission = ANY(ARRAY['project.read','document.read','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','report.read','profile.directory','offer.read','contract.read'])
 WHEN 'hr' THEN permission = ANY(ARRAY['project.read','document.read','document.upload','document.update','employee.read','employee.create','employee.update','employee.archive','employee.hr.read','legal_entity.read','deadline.read','deadline.write','profile.directory'])
 END,false)
$$;
REVOKE ALL ON FUNCTION public.app_has_permission_before_2b(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_permission_before_2b(text) TO authenticated;



-- HR deadlines require the same capability as their document/work-record peers.
DROP POLICY deadlines_read ON public.deadlines;
DROP POLICY deadlines_insert ON public.deadlines;
DROP POLICY deadlines_update ON public.deadlines;
CREATE POLICY deadlines_read ON public.deadlines FOR SELECT TO authenticated
 USING (public.app_has_permission('deadline.read') AND (employee_id IS NULL OR public.app_has_permission('employee.hr.read')));
CREATE POLICY deadlines_insert ON public.deadlines FOR INSERT TO authenticated
 WITH CHECK (public.app_has_permission('deadline.write') AND (employee_id IS NULL OR public.app_has_permission('employee.hr.read')));
CREATE POLICY deadlines_update ON public.deadlines FOR UPDATE TO authenticated
 USING (public.app_has_permission('deadline.write') AND (employee_id IS NULL OR public.app_has_permission('employee.hr.read')))
 WITH CHECK (public.app_has_permission('deadline.write') AND (employee_id IS NULL OR public.app_has_permission('employee.hr.read')));
-- The existing restrictive deadline_link_visibility policy is retained.

CREATE OR REPLACE FUNCTION public.project_operational_summary(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.app_has_permission('project.read') OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id) THEN
   RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
 END IF;
 -- Each invoice is considered once. A payment has no project allocation:
 -- only wholly and unambiguously attributed invoices can have project balances.
 WITH attributed AS (
   SELECT i.id,i.invoice_type,i.currency,i.amount_total,sum(l.amount_total) attributed_total,
     sum(l.amount_total)=i.amount_total
     AND NOT EXISTS(SELECT 1 FROM public.invoice_lines other WHERE other.invoice_id=i.id AND other.project_id IS DISTINCT FROM p_project_id)
     AND NOT EXISTS(SELECT 1 FROM public.invoice_projects other WHERE other.invoice_id=i.id AND other.project_id<>p_project_id) AS unambiguous
   FROM public.invoices i JOIN public.invoice_lines l ON l.invoice_id=i.id
   WHERE l.project_id=p_project_id AND i.archived_at IS NULL
   GROUP BY i.id
 ), financial AS (
   SELECT CASE a.invoice_type WHEN 'purchase' THEN 'payment' ELSE 'receipt' END kind,a.currency,
     sum(a.attributed_total) original,sum(least(a.amount_total,f.allocated_total)) settled,sum(f.residual) residual
   FROM attributed a JOIN public.invoice_financial_summary f ON f.invoice_id=a.id
   WHERE a.unambiguous GROUP BY a.invoice_type,a.currency
 )
 SELECT jsonb_build_object(
   'documents',(SELECT count(*) FROM public.document_projects dp JOIN public.documents d ON d.id=dp.document_id WHERE dp.project_id=p_project_id AND d.archived_at IS NULL),
   'invoices',(SELECT count(DISTINCT ip.invoice_id) FROM public.invoice_projects ip JOIN public.invoices i ON i.id=ip.invoice_id WHERE ip.project_id=p_project_id AND i.archived_at IS NULL),
   'supplier_invoices',(SELECT count(DISTINCT ip.invoice_id) FROM public.invoice_projects ip JOIN public.invoices i ON i.id=ip.invoice_id WHERE ip.project_id=p_project_id AND i.archived_at IS NULL AND i.invoice_type='purchase'),
   'customer_invoices',(SELECT count(DISTINCT ip.invoice_id) FROM public.invoice_projects ip JOIN public.invoices i ON i.id=ip.invoice_id WHERE ip.project_id=p_project_id AND i.archived_at IS NULL AND i.invoice_type='sale'),
   'open_deadlines',(SELECT count(*) FROM public.operational_deadlines d WHERE p_project_id=ANY(d.project_ids) AND d.archived_at IS NULL AND NOT d.completed),
   'overdue_deadlines',(SELECT count(*) FROM public.operational_deadlines d WHERE p_project_id=ANY(d.project_ids) AND d.archived_at IS NULL AND NOT d.completed AND d.due_date<CURRENT_DATE),
   'financial',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',f.kind,'currency',f.currency,'original',f.original,'settled',f.settled,'residual',f.residual)) FROM financial f),'[]'::jsonb),
   'unattributed_invoices',(SELECT count(*) FROM attributed WHERE NOT unambiguous)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.project_operational_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_operational_summary(uuid) TO authenticated;

-- Lock the financial parents when allocating, serializing concurrent currency
-- changes with new allocations. The existing validation trigger remains active.
CREATE FUNCTION public.validate_allocation_currency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE movement_currency text; invoice_currency text;
BEGIN
 SELECT currency INTO movement_currency FROM public.financial_movements WHERE id=NEW.movement_id FOR UPDATE;
 SELECT currency INTO invoice_currency FROM public.invoices WHERE id=NEW.invoice_id FOR UPDATE;
 IF movement_currency IS NOT NULL AND invoice_currency IS NOT NULL AND movement_currency IS DISTINCT FROM invoice_currency THEN
   RAISE EXCEPTION 'Valuta del movimento incompatibile con la fattura' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_allocation_currency() FROM PUBLIC;
CREATE TRIGGER allocation_currency BEFORE INSERT OR UPDATE ON public.financial_allocations
 FOR EACH ROW EXECUTE FUNCTION public.validate_allocation_currency();

-- Check the final state: changing currency and removing allocations in the
-- same save remains possible. Legacy mismatches are not silently converted.
CREATE FUNCTION public.validate_settlement_currency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(
   SELECT 1 FROM public.financial_allocations a
   JOIN public.invoices i ON i.id=a.invoice_id
   JOIN public.financial_movements m ON m.id=a.movement_id
   WHERE m.archived_at IS NULL AND m.currency IS DISTINCT FROM i.currency
     AND ((TG_TABLE_NAME='invoices' AND i.id=NEW.id) OR (TG_TABLE_NAME='financial_movements' AND m.id=NEW.id))
 ) THEN
   RAISE EXCEPTION 'Valuta incompatibile con le allocazioni attive' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.validate_settlement_currency() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER invoice_settlement_currency AFTER UPDATE ON public.invoices
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.currency IS DISTINCT FROM NEW.currency)
 EXECUTE FUNCTION public.validate_settlement_currency();
CREATE CONSTRAINT TRIGGER movement_settlement_currency AFTER UPDATE ON public.financial_movements
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.currency IS DISTINCT FROM NEW.currency OR OLD.archived_at IS DISTINCT FROM NEW.archived_at)
 EXECUTE FUNCTION public.validate_settlement_currency();

-- Keep the deadline identity, completion, notes and task references intact.
CREATE OR REPLACE FUNCTION public.sync_contract_deadline() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE deadline uuid;
BEGIN
 SELECT d.id INTO deadline FROM public.deadlines d WHERE d.contract_id=NEW.id
 ORDER BY d.created_at,d.id LIMIT 1 FOR UPDATE;
 IF NEW.expires_at IS NULL OR NEW.archived_at IS NOT NULL THEN
   UPDATE public.deadlines SET archived_at=coalesce(archived_at,now()) WHERE contract_id=NEW.id;
 ELSIF deadline IS NULL THEN
   INSERT INTO public.deadlines(title,description,due_date,status,priority,legal_entity_id,company_id,contract_id)
   VALUES('Scadenza contratto: '||NEW.reference,NEW.title,NEW.expires_at,'open','high',NEW.legal_entity_id,NEW.counterparty_id,NEW.id);
 ELSE
   UPDATE public.deadlines SET title='Scadenza contratto: '||NEW.reference,description=NEW.title,due_date=NEW.expires_at,
     legal_entity_id=NEW.legal_entity_id,company_id=NEW.counterparty_id,archived_at=NULL WHERE id=deadline;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.save_offer(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oid uuid := NULLIF(payload->>'id','')::uuid; item jsonb; lid uuid; kept uuid[] := '{}'; p uuid; net numeric; vat numeric; old public.offers;
BEGIN
 PERFORM pg_advisory_xact_lock(17017);
 IF NOT public.app_has_permission(CASE WHEN oid IS NULL THEN 'offer.create' ELSE 'offer.update' END) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'lines')=0 THEN RAISE EXCEPTION 'Righe obbligatorie' USING ERRCODE='23514'; END IF;
 IF oid IS NULL THEN oid := gen_random_uuid(); ELSE SELECT * INTO old FROM public.offers WHERE id=oid AND archived_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Offer unavailable' USING ERRCODE='42501'; END IF; END IF;
 -- The partial unique index is immediate: retire the previous revision first.
 -- Any subsequent failure rolls this change back with the complete RPC.
 UPDATE public.offers SET is_current=false WHERE offer_number=trim(payload->>'offer_number') AND id<>oid AND is_current;
 INSERT INTO public.offers(id,offer_group_id,offer_number,revision,is_current,issued_at,valid_until,legal_entity_id,counterparty_id,contact_name,subject,description,currency,status,amount_net,vat_amount,amount_total,notes,created_by)
 VALUES(oid,coalesce(NULLIF(payload->>'offer_group_id','')::uuid,oid),trim(payload->>'offer_number'),coalesce((payload->>'revision')::int,0),true,NULLIF(payload->>'issued_at','')::date,NULLIF(payload->>'valid_until','')::date,(payload->>'legal_entity_id')::uuid,NULLIF(payload->>'counterparty_id','')::uuid,NULLIF(payload->>'contact_name',''),NULLIF(payload->>'subject',''),NULLIF(payload->>'description',''),upper(coalesce(payload->>'currency','EUR')),coalesce(NULLIF(payload->>'status',''),'draft'),coalesce((payload->>'amount_net')::numeric,0),coalesce((payload->>'vat_amount')::numeric,0),coalesce((payload->>'amount_total')::numeric,0),NULLIF(payload->>'notes',''),auth.uid())
 ON CONFLICT(id) DO UPDATE SET offer_number=excluded.offer_number,issued_at=excluded.issued_at,valid_until=excluded.valid_until,legal_entity_id=excluded.legal_entity_id,counterparty_id=excluded.counterparty_id,contact_name=excluded.contact_name,subject=excluded.subject,description=excluded.description,currency=excluded.currency,status=excluded.status,amount_net=excluded.amount_net,vat_amount=excluded.vat_amount,amount_total=excluded.amount_total,notes=excluded.notes,is_current=true;
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



COMMIT;
