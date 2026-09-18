BEGIN;
-- Preserve the existing manual register; generated financial rows exist only in views.
CREATE TABLE public.deadline_categories (code text PRIMARY KEY, name text NOT NULL);
INSERT INTO public.deadline_categories VALUES ('financial','Finanziaria'),('document','Documento'),('contract','Contratto'),('insurance','Assicurazione'),('durc','DURC'),('certificate','Certificato'),('guarantee','Garanzia'),('employee','Dipendente'),('medical','Visita medica'),('training','Formazione'),('tax','Fiscale'),('project','Commessa'),('administrative','Amministrativa'),('other','Altro');
ALTER TABLE public.deadline_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.deadline_categories TO authenticated;
CREATE POLICY categories_read ON public.deadline_categories FOR SELECT TO authenticated USING(public.app_has_permission('deadline.read'));
CREATE POLICY categories_write ON public.deadline_categories FOR ALL TO authenticated USING(public.app_has_permission('admin.settings')) WITH CHECK(public.app_has_permission('admin.settings'));
ALTER TABLE public.deadlines ADD COLUMN category_code text NOT NULL DEFAULT 'administrative' REFERENCES public.deadline_categories(code), ADD COLUMN notes text, ADD COLUMN archived_at timestamptz;
UPDATE public.deadlines SET priority='medium' WHERE priority='normal';
ALTER TABLE public.deadlines ALTER COLUMN priority SET DEFAULT 'medium';
ALTER TABLE public.deadlines ADD CONSTRAINT deadline_priority CHECK(priority IN ('critical','high','medium','low')) NOT VALID;
ALTER TABLE public.deadlines ADD CONSTRAINT deadline_status CHECK(status IN ('open','completed')) NOT VALID;
-- Linked private documents must not expose manual deadline metadata to other roles.
CREATE POLICY deadline_link_visibility ON public.deadlines AS RESTRICTIVE FOR ALL TO authenticated
 USING ((document_id IS NULL OR EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id)) AND (invoice_id IS NULL OR public.app_has_permission('invoice.read')))
 WITH CHECK ((document_id IS NULL OR EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id)) AND invoice_id IS NULL);
CREATE INDEX deadlines_assignee_due ON public.deadlines(assigned_to,due_date) WHERE archived_at IS NULL;
CREATE OR REPLACE FUNCTION public.validate_manual_deadline() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'Financial deadlines are derived from invoices' USING ERRCODE='23514'; END IF;
 IF NEW.legal_entity_id IS NULL OR length(trim(NEW.title))=0 THEN RAISE EXCEPTION 'Entity and title required' USING ERRCODE='23514'; END IF;
 IF NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=NEW.project_id AND archived_at IS NULL AND (legal_entity_id IS NULL OR legal_entity_id=NEW.legal_entity_id)) THEN RAISE EXCEPTION 'Invalid project' USING ERRCODE='23514'; END IF;
 IF NEW.document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.documents WHERE id=NEW.document_id AND archived_at IS NULL AND (legal_entity_id IS NULL OR legal_entity_id=NEW.legal_entity_id)) THEN RAISE EXCEPTION 'Invalid document' USING ERRCODE='23514'; END IF;
 IF NEW.assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profile_directory() p WHERE p.id=NEW.assigned_to) THEN RAISE EXCEPTION 'Invalid assignee' USING ERRCODE='23514'; END IF;
 NEW.completed_at:=CASE WHEN NEW.status='completed' THEN COALESCE(NEW.completed_at,now()) END;
 IF TG_OP='INSERT' THEN NEW.created_by:=auth.uid(); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_manual_deadline BEFORE INSERT OR UPDATE ON public.deadlines FOR EACH ROW EXECUTE FUNCTION public.validate_manual_deadline();
-- Fix the phase 1B summary to respect underlying RLS.
ALTER VIEW public.invoice_financial_summary SET (security_invoker=true);
CREATE VIEW public.financial_deadline_balances WITH (security_invoker=true) AS
WITH allocations AS (
 SELECT a.invoice_id,a.installment_id,sum(a.amount) amount FROM public.financial_allocations a JOIN public.financial_movements m ON m.id=a.movement_id AND m.archived_at IS NULL GROUP BY a.invoice_id,a.installment_id
), base AS (
 SELECT s.*, greatest(s.amount-coalesce(a.amount,0),0) open_amount
 FROM public.invoice_installments s LEFT JOIN allocations a ON a.installment_id=s.id AND a.invoice_id=s.invoice_id
), distributed AS (
 SELECT b.*, greatest(b.open_amount-greatest(coalesce(a.amount,0)-coalesce(sum(b.open_amount) OVER(PARTITION BY b.invoice_id ORDER BY b.due_date,b.position,b.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0),0),0) residual
 FROM base b LEFT JOIN allocations a ON a.invoice_id=b.invoice_id AND a.installment_id IS NULL
)
SELECT 'installment:'||s.id AS id,s.invoice_id,s.id installment_id,s.due_date,s.amount original_amount,s.amount-s.residual settled_amount,s.residual FROM distributed s
UNION ALL
SELECT 'invoice:'||i.id,i.id,NULL::uuid,i.due_date,i.amount_total,least(i.amount_total,f.allocated_total),f.residual
FROM public.invoices i JOIN public.invoice_financial_summary f ON f.invoice_id=i.id WHERE NOT EXISTS(SELECT 1 FROM public.invoice_installments s WHERE s.invoice_id=i.id);
CREATE VIEW public.operational_deadlines WITH (security_invoker=true) AS
WITH sources AS (
 SELECT f.id,'financial'::text source,f.invoice_id,f.installment_id,i.invoice_number title,NULL::text description,f.due_date,NULL::time due_time,
 CASE WHEN i.invoice_type='purchase' THEN 'payment' ELSE 'receipt' END kind,i.legal_entity_id,
 CASE WHEN i.invoice_type='purchase' THEN i.supplier_id ELSE i.customer_id END company_id,i.document_id,
 ARRAY(SELECT ip.project_id FROM public.invoice_projects ip WHERE ip.invoice_id=i.id UNION SELECT l.project_id FROM public.invoice_lines l WHERE l.invoice_id=i.id AND l.project_id IS NOT NULL) project_ids,
 'financial'::text category_code,'medium'::text priority,NULL::uuid assigned_to,NULL::text notes,
 f.original_amount,f.settled_amount,f.residual,i.currency,(f.residual<=0) completed,NULL::timestamptz archived_at
 FROM public.financial_deadline_balances f JOIN public.invoices i ON i.id=f.invoice_id WHERE i.archived_at IS NULL AND i.status NOT IN ('cancelled','credit_note') AND i.amount_total>=0
 UNION ALL
 SELECT 'manual:'||d.id,'manual',NULL::uuid,NULL::uuid,d.title,d.description,d.due_date,d.due_time,'manual',d.legal_entity_id,d.company_id,d.document_id,
 CASE WHEN d.project_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[d.project_id] END,d.category_code,d.priority,d.assigned_to,d.notes,NULL::numeric,NULL::numeric,NULL::numeric,NULL::text,d.status='completed',d.archived_at
 FROM public.deadlines d WHERE d.invoice_id IS NULL
)
SELECT s.*,e.business_name entity_name,e.country entity_country,c.business_name company_name,c.company_type,
 cat.name category_name,
 CASE WHEN completed THEN 'completed' WHEN due_date<CURRENT_DATE THEN 'overdue' WHEN due_date=CURRENT_DATE THEN 'today' WHEN due_date<=CURRENT_DATE+7 THEN 'soon' ELSE 'future' END temporal_status,
 s.title||' '||coalesce(s.description,'')||' '||coalesce(c.business_name,'') search_text
FROM sources s LEFT JOIN public.legal_entities e ON e.id=s.legal_entity_id LEFT JOIN public.companies c ON c.id=s.company_id LEFT JOIN public.deadline_categories cat ON cat.code=s.category_code;
GRANT SELECT ON public.financial_deadline_balances,public.operational_deadlines TO authenticated;
CREATE FUNCTION public.deadline_financial_kpis() RETURNS TABLE(kind text,currency text,overdue boolean,amount numeric,items bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT kind,currency,temporal_status='overdue',sum(residual),count(*) FROM public.operational_deadlines WHERE source='financial' AND NOT completed AND archived_at IS NULL GROUP BY kind,currency,temporal_status='overdue';
$$;
REVOKE ALL ON FUNCTION public.deadline_financial_kpis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deadline_financial_kpis() TO authenticated;
-- Repair ambiguous identifier in phase 1B RPC, required for real settlements.
CREATE OR REPLACE FUNCTION public.save_financial_movement(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<movement_save>>
DECLARE movement_id uuid:=NULLIF(payload->>'id','')::uuid; m public.financial_movements; item jsonb; alloc_id uuid; allocated numeric:=0;
BEGIN
 IF NOT public.app_has_permission('invoice.update') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF movement_id IS NULL THEN INSERT INTO public.financial_movements(direction,legal_entity_id,counterparty_id,movement_date,amount,currency,payment_method,reference,account_id,notes,created_by)
 VALUES(payload->>'direction',(payload->>'legal_entity_id')::uuid,NULLIF(payload->>'counterparty_id','')::uuid,(payload->>'movement_date')::date,(payload->>'amount')::numeric,upper(payload->>'currency'),NULLIF(payload->>'payment_method',''),NULLIF(payload->>'reference',''),NULLIF(payload->>'account_id','')::uuid,NULLIF(payload->>'notes',''),auth.uid()) RETURNING id INTO movement_id;
 ELSE SELECT * INTO m FROM public.financial_movements WHERE id=movement_id AND archived_at IS NULL FOR UPDATE; IF m.id IS NULL THEN RAISE EXCEPTION 'Movement unavailable' USING ERRCODE='42501'; END IF;
 UPDATE public.financial_movements SET direction=payload->>'direction',legal_entity_id=(payload->>'legal_entity_id')::uuid,counterparty_id=NULLIF(payload->>'counterparty_id','')::uuid,movement_date=(payload->>'movement_date')::date,amount=(payload->>'amount')::numeric,currency=upper(payload->>'currency'),payment_method=NULLIF(payload->>'payment_method',''),reference=NULLIF(payload->>'reference',''),account_id=NULLIF(payload->>'account_id','')::uuid,notes=NULLIF(payload->>'notes','') WHERE id=movement_id; END IF;
 DELETE FROM public.financial_allocations a WHERE a.movement_id=movement_save.movement_id;
 FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'allocations','[]'::jsonb)) LOOP
   INSERT INTO public.financial_allocations(movement_id,invoice_id,installment_id,amount) VALUES(movement_id,(item->>'invoice_id')::uuid,NULLIF(item->>'installment_id','')::uuid,(item->>'amount')::numeric) RETURNING amount INTO allocated; END LOOP;
 RETURN movement_id;
END $$;

COMMIT;
