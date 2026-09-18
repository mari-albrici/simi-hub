BEGIN;
ALTER TABLE public.document_categories ADD COLUMN parent_id uuid REFERENCES public.document_categories(id), ADD CONSTRAINT document_category_not_self CHECK(parent_id IS DISTINCT FROM id);
ALTER TABLE public.documents ADD COLUMN reference text, ADD COLUMN country text, ADD COLUMN language text, ADD COLUMN notes text, ADD COLUMN assigned_to uuid REFERENCES public.profiles(id), ADD COLUMN normalized_filename text, ADD COLUMN current_version_id uuid;
ALTER TABLE public.documents DROP CONSTRAINT documents_access_scope_check;
UPDATE public.documents SET archived_at=coalesce(archived_at,now()) WHERE status='archived';
UPDATE public.documents SET status='valid' WHERE status IN ('expired','expiring');
ALTER TABLE public.documents ADD CONSTRAINT documents_access_scope_check CHECK(access_scope IN ('general','restricted','hr'));
CREATE TABLE public.document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES public.documents(id), version_number integer NOT NULL CHECK(version_number>0),
 original_filename text NOT NULL, stored_filename text NOT NULL, storage_path text NOT NULL, normalized_filename text,
 mime_type text, file_size bigint, content_hash text CHECK(content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
 file_state text NOT NULL DEFAULT 'pending' CHECK(file_state IN ('pending','ready','failed')),
 label text, notes text, created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_id,version_number), UNIQUE(document_id,id)
);
-- Existing paths and original filenames are preserved, including legacy shared paths.
INSERT INTO public.document_versions(document_id,version_number,original_filename,stored_filename,storage_path,mime_type,file_size,content_hash,file_state,created_by,created_at)
 SELECT id,1,original_filename,stored_filename,storage_path,mime_type,file_size,CASE WHEN content_hash ~ '^[a-f0-9]{64}$' THEN content_hash END,file_state,created_by,created_at FROM public.documents;
UPDATE public.documents d SET current_version_id=v.id FROM public.document_versions v WHERE v.document_id=d.id;
ALTER TABLE public.documents ADD CONSTRAINT document_current_version_fk FOREIGN KEY(id,current_version_id) REFERENCES public.document_versions(document_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX document_versions_hash ON public.document_versions(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX document_versions_path ON public.document_versions(storage_path);
CREATE INDEX documents_expiry_active ON public.documents(expiry_date) WHERE archived_at IS NULL;
CREATE INDEX documents_reference ON public.documents(reference);
CREATE TABLE public.document_projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid NOT NULL REFERENCES public.documents(id),project_id uuid NOT NULL REFERENCES public.projects(id),UNIQUE(document_id,project_id));
CREATE TABLE public.document_companies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid NOT NULL REFERENCES public.documents(id),company_id uuid NOT NULL REFERENCES public.companies(id),UNIQUE(document_id,company_id));
CREATE TABLE public.document_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id uuid NOT NULL REFERENCES public.documents(id),invoice_id uuid NOT NULL REFERENCES public.invoices(id),UNIQUE(document_id,invoice_id));
INSERT INTO public.document_projects(document_id,project_id) SELECT id,project_id FROM public.documents WHERE project_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.document_companies(document_id,company_id) SELECT d.id,x FROM public.documents d CROSS JOIN LATERAL unnest(ARRAY[d.company_id,d.customer_id,d.supplier_id]) x WHERE x IS NOT NULL ON CONFLICT DO NOTHING;
COMMENT ON COLUMN public.documents.project_id IS 'Legacy context, migrated to document_projects. New writes use typed relations.';
COMMENT ON COLUMN public.documents.version_of_id IS 'Legacy relation preserved; new file versions use document_versions.';
CREATE INDEX document_projects_context ON public.document_projects(project_id);
CREATE INDEX document_companies_context ON public.document_companies(company_id);
CREATE INDEX document_invoices_context ON public.document_invoices(invoice_id);
-- Central access predicate, also used by SECURITY DEFINER upload RPCs and Storage.
CREATE FUNCTION public.document_visible(doc uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.app_has_permission('document.read') AND EXISTS(SELECT 1 FROM public.documents d WHERE d.id=doc
 AND (d.employee_id IS NULL AND d.access_scope='general' OR d.access_scope='restricted' AND d.employee_id IS NULL AND public.app_role() IN ('admin','administration','management') OR public.app_has_permission('employee.read') AND d.access_scope<>'restricted')
 AND (d.file_state='ready' OR d.created_by=auth.uid() OR public.app_has_permission('admin.users')));
$$;
REVOKE ALL ON FUNCTION public.document_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_visible(uuid) TO authenticated;
DROP POLICY documents_read ON public.documents;
DROP POLICY documents_update ON public.documents;
CREATE POLICY documents_read ON public.documents FOR SELECT TO authenticated USING(public.document_visible(id));
CREATE POLICY documents_update ON public.documents FOR UPDATE TO authenticated USING(public.document_visible(id) AND public.app_has_permission('document.update')) WITH CHECK(public.document_visible(id) AND public.app_has_permission('document.update'));
-- Retain only legacy narrow metadata update rights; full writes go through validated RPCs.
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.document_versions TO authenticated;
CREATE POLICY versions_read ON public.document_versions FOR SELECT TO authenticated USING(public.document_visible(document_id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['document_projects','document_companies','document_invoices'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY context_read ON public.%I FOR SELECT TO authenticated USING(public.document_visible(document_id) AND public.app_has_permission(%L))',t,CASE t WHEN 'document_invoices' THEN 'invoice.read' WHEN 'document_companies' THEN 'company.read' ELSE 'project.read' END);
 EXECUTE format('CREATE TRIGGER audit_context AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_mutation()',t);
END LOOP; END $$;
CREATE TRIGGER audit_document_versions AFTER INSERT OR UPDATE OR DELETE ON public.document_versions FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
-- All future modules should add typed FK relations, rather than unvalidated polymorphic IDs.
CREATE VIEW public.document_invoice_context WITH(security_invoker=true) AS
 SELECT document_id,invoice_id FROM public.document_invoices
 UNION SELECT document_id,id FROM public.invoices WHERE document_id IS NOT NULL;
CREATE VIEW public.document_project_context WITH(security_invoker=true) AS
 SELECT document_id,project_id FROM public.document_projects
 UNION SELECT dc.document_id,ip.project_id FROM public.document_invoice_context dc JOIN public.invoice_projects ip ON ip.invoice_id=dc.invoice_id
 UNION SELECT dc.document_id,l.project_id FROM public.document_invoice_context dc JOIN public.invoice_lines l ON l.invoice_id=dc.invoice_id WHERE l.project_id IS NOT NULL;
CREATE VIEW public.document_company_context WITH(security_invoker=true) AS
 SELECT document_id,company_id FROM public.document_companies
 UNION SELECT dc.document_id,coalesce(i.supplier_id,i.customer_id) FROM public.document_invoice_context dc JOIN public.invoices i ON i.id=dc.invoice_id WHERE coalesce(i.supplier_id,i.customer_id) IS NOT NULL;
GRANT SELECT ON public.document_invoice_context,public.document_project_context,public.document_company_context TO authenticated;
CREATE FUNCTION public.validate_document_filename(filename text,mime text,bytes bigint) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF filename IS NULL OR length(filename) NOT BETWEEN 1 AND 255 OR filename ~ '[[:cntrl:]/\\]' OR trim(filename)='' OR bytes IS NULL OR bytes NOT BETWEEN 1 AND 10485760
 OR mime IS NULL OR NOT(CASE mime WHEN 'application/pdf' THEN filename ~* '\.pdf$' WHEN 'image/jpeg' THEN filename ~* '\.jpe?g$' WHEN 'image/png' THEN filename ~* '\.png$' WHEN 'image/webp' THEN filename ~* '\.webp$' ELSE false END)
 THEN RAISE EXCEPTION 'Invalid filename, extension, MIME or size' USING ERRCODE='22023'; END IF;
END $$;
-- Compatibility for existing invoice reservation: automatically seed version 1.
CREATE FUNCTION public.seed_document_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid; BEGIN
 INSERT INTO public.document_versions(document_id,version_number,original_filename,stored_filename,storage_path,mime_type,file_size,file_state,created_by)
 VALUES(NEW.id,1,NEW.original_filename,NEW.stored_filename,NEW.storage_path,NEW.mime_type,NEW.file_size,NEW.file_state,NEW.created_by) RETURNING id INTO v;
 UPDATE public.documents SET current_version_id=v WHERE id=NEW.id; RETURN NEW;
END $$;
CREATE TRIGGER seed_document_version AFTER INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.seed_document_version();
CREATE OR REPLACE FUNCTION public.reserve_document(filename text,mime text,bytes bigint,entity_id uuid DEFAULT NULL) RETURNS TABLE(id uuid,storage_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc uuid:=gen_random_uuid(); path text;
BEGIN
 IF NOT public.app_has_permission('document.upload') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM public.validate_document_filename(filename,mime,bytes);
 IF entity_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.legal_entities e WHERE e.id=entity_id AND active) THEN RAISE EXCEPTION 'Invalid entity' USING ERRCODE='23514'; END IF;
 path='documents/'||doc||CASE mime WHEN 'application/pdf' THEN '.pdf' WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END;
 INSERT INTO public.documents(id,original_filename,stored_filename,storage_path,mime_type,file_size,created_by,legal_entity_id,file_state,title)
 VALUES(doc,filename,split_part(path,'/',2),path,mime,bytes,auth.uid(),entity_id,'pending',filename);
 RETURN QUERY SELECT doc,path;
END $$;
CREATE FUNCTION public.link_document_context(doc uuid,project uuid DEFAULT NULL,company uuid DEFAULT NULL,invoice uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entity uuid;
BEGIN
 IF NOT public.app_has_permission('document.update') OR NOT public.document_visible(doc) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT legal_entity_id INTO entity FROM public.documents WHERE id=doc AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501'; END IF;
 IF project IS NOT NULL THEN
 IF NOT public.app_has_permission('project.read') OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=project AND archived_at IS NULL AND (legal_entity_id IS NULL OR legal_entity_id=entity)) THEN RAISE EXCEPTION 'Invalid project' USING ERRCODE='23514'; END IF;
 INSERT INTO public.document_projects(document_id,project_id) VALUES(doc,project) ON CONFLICT DO NOTHING; END IF;
 IF company IS NOT NULL THEN
 IF NOT public.app_has_permission('company.read') OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=company AND archived_at IS NULL) THEN RAISE EXCEPTION 'Invalid company' USING ERRCODE='23514'; END IF;
 INSERT INTO public.document_companies(document_id,company_id) VALUES(doc,company) ON CONFLICT DO NOTHING; END IF;
 IF invoice IS NOT NULL THEN
 IF NOT public.app_has_permission('invoice.read') OR NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=invoice AND archived_at IS NULL AND legal_entity_id=entity) THEN RAISE EXCEPTION 'Invalid invoice' USING ERRCODE='23514'; END IF;
 INSERT INTO public.document_invoices(document_id,invoice_id) VALUES(doc,invoice) ON CONFLICT DO NOTHING; END IF;
END $$;
CREATE FUNCTION public.save_document_metadata(doc uuid,payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents; scope text:=coalesce(payload->>'access_scope','general');
BEGIN
 SELECT * INTO d FROM public.documents WHERE id=doc FOR UPDATE;
 IF NOT public.app_has_permission('document.update') OR NOT public.document_visible(doc) OR d.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF payload ? 'expected_updated_at' AND (payload->>'expected_updated_at')::timestamptz IS DISTINCT FROM d.updated_at THEN RAISE EXCEPTION 'Concurrent update' USING ERRCODE='40001'; END IF;
 IF coalesce(length(trim(payload->>'title')),0) NOT BETWEEN 1 AND 500 OR coalesce(payload->>'status','') NOT IN ('draft','valid','superseded') OR scope NOT IN ('general','restricted','hr') THEN RAISE EXCEPTION 'Invalid metadata' USING ERRCODE='22023'; END IF;
 IF scope='hr' AND NOT public.app_has_permission('employee.read') OR scope='restricted' AND public.app_role() NOT IN ('admin','administration','management') OR d.employee_id IS NOT NULL AND scope<>'hr' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.legal_entities WHERE id=(payload->>'legal_entity_id')::uuid AND active) THEN RAISE EXCEPTION 'Entity required' USING ERRCODE='23514'; END IF;
 IF NULLIF(payload->>'category_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.document_categories WHERE id=(payload->>'category_id')::uuid AND active) THEN RAISE EXCEPTION 'Invalid category' USING ERRCODE='23514'; END IF;
 IF NULLIF(payload->>'assigned_to','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profile_directory() WHERE id=(payload->>'assigned_to')::uuid) THEN RAISE EXCEPTION 'Invalid assignee' USING ERRCODE='23514'; END IF;
 IF d.legal_entity_id IS DISTINCT FROM (payload->>'legal_entity_id')::uuid AND (EXISTS(SELECT 1 FROM public.document_projects WHERE document_id=doc) OR EXISTS(SELECT 1 FROM public.document_invoices WHERE document_id=doc) OR EXISTS(SELECT 1 FROM public.invoices WHERE document_id=doc)) THEN RAISE EXCEPTION 'Linked entity cannot change' USING ERRCODE='23514'; END IF;
 UPDATE public.documents SET title=trim(payload->>'title'),description=NULLIF(payload->>'description',''),reference=NULLIF(payload->>'reference',''),category_id=NULLIF(payload->>'category_id','')::uuid,
 document_date=NULLIF(payload->>'document_date','')::date,expiry_date=NULLIF(payload->>'expiry_date','')::date,legal_entity_id=(payload->>'legal_entity_id')::uuid,country=NULLIF(payload->>'country',''),language=NULLIF(payload->>'language',''),notes=NULLIF(payload->>'notes',''),assigned_to=NULLIF(payload->>'assigned_to','')::uuid,status=payload->>'status',access_scope=scope WHERE id=doc;
END $$;
CREATE FUNCTION public.reserve_document_upload(filename text,mime text,bytes bigint,hash text,normalized text,payload jsonb,doc uuid DEFAULT NULL,version_label text DEFAULT NULL,version_notes text DEFAULT NULL)
 RETURNS TABLE(document_id uuid,version_id uuid,storage_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record; target uuid:=doc; v uuid; path text; seq integer;
BEGIN
 IF NOT public.app_has_permission('document.upload') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM public.validate_document_filename(filename,mime,bytes);
 IF hash IS NULL OR hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'SHA256 required' USING ERRCODE='22023'; END IF;
 PERFORM public.validate_document_filename(normalized,mime,bytes);
 IF target IS NULL THEN
 SELECT * INTO r FROM public.reserve_document(filename,mime,bytes,(payload->>'legal_entity_id')::uuid); target=r.id;path=r.storage_path;
 PERFORM public.save_document_metadata(target,payload);
 SELECT current_version_id INTO v FROM public.documents WHERE id=target;
 UPDATE public.document_versions SET content_hash=hash,normalized_filename=normalized,label=version_label,notes=version_notes WHERE id=v;
 ELSE
 IF NOT public.app_has_permission('document.update') OR NOT public.document_visible(target) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.documents WHERE id=target AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501'; END IF;
 SELECT coalesce(max(version_number),0)+1 INTO seq FROM public.document_versions dv WHERE dv.document_id=target;
 v=gen_random_uuid();path='documents/'||target||'/'||v||CASE mime WHEN 'application/pdf' THEN '.pdf' WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END;
 INSERT INTO public.document_versions(id,document_id,version_number,original_filename,stored_filename,storage_path,mime_type,file_size,content_hash,normalized_filename,label,notes,created_by)
 VALUES(v,target,seq,filename,split_part(path,'/',3),path,mime,bytes,hash,normalized,version_label,version_notes,auth.uid());
 END IF;
 RETURN QUERY SELECT target,v,path;
END $$;
CREATE OR REPLACE FUNCTION public.document_storage_access(path text,operation text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.document_versions v JOIN public.documents d ON d.id=v.document_id WHERE v.storage_path=path AND d.archived_at IS NULL AND public.document_visible(d.id)
 AND CASE operation WHEN 'read' THEN v.file_state='ready' WHEN 'upload' THEN v.file_state='pending' AND v.created_by=auth.uid() AND public.app_has_permission('document.upload') ELSE false END)
 -- A legacy path shared across differently protected records must use the strictest access.
 AND NOT EXISTS(SELECT 1 FROM public.document_versions v WHERE v.storage_path=path AND NOT public.document_visible(v.document_id));
$$;
CREATE FUNCTION public.finalize_document_version(version uuid,acknowledge_duplicate boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.document_versions; d public.documents;
BEGIN
 SELECT * INTO v FROM public.document_versions WHERE id=version;
 SELECT * INTO d FROM public.documents WHERE id=v.document_id FOR UPDATE;
 IF NOT public.app_has_permission('document.upload') OR NOT public.document_visible(d.id) OR v.created_by IS DISTINCT FROM auth.uid() OR d.archived_at IS NOT NULL OR v.file_state='failed' THEN RAISE EXCEPTION 'Version unavailable' USING ERRCODE='42501'; END IF;
 IF v.file_state='ready' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='simi-documents' AND name=v.storage_path) THEN RAISE EXCEPTION 'Upload not confirmed' USING ERRCODE='23514'; END IF;
 IF v.content_hash IS NOT NULL THEN
 PERFORM pg_advisory_xact_lock(hashtextextended(v.content_hash,0));
 IF NOT acknowledge_duplicate AND EXISTS(SELECT 1 FROM public.document_versions x WHERE x.content_hash=v.content_hash AND x.file_state='ready' AND x.id<>v.id AND public.document_visible(x.document_id)) THEN RAISE EXCEPTION 'File already present; explicit confirmation required' USING ERRCODE='23505'; END IF;
 END IF;
 UPDATE public.document_versions SET file_state='ready' WHERE id=v.id;
 -- Finalizing an older pending version must never replace a newer published version.
 IF NOT EXISTS(SELECT 1 FROM public.document_versions x WHERE x.id=d.current_version_id AND x.file_state='ready' AND x.version_number>v.version_number) THEN
 UPDATE public.documents SET current_version_id=v.id,file_state='ready',original_filename=v.original_filename,stored_filename=v.stored_filename,storage_path=v.storage_path,mime_type=v.mime_type,file_size=v.file_size,content_hash=v.content_hash,normalized_filename=v.normalized_filename WHERE id=d.id;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.finalize_document(document_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.finalize_document_version((SELECT current_version_id FROM public.documents WHERE id=document_id),false); END $$;
CREATE FUNCTION public.fail_document_version(version uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.document_versions;
BEGIN
 SELECT * INTO v FROM public.document_versions WHERE id=version;
 IF NOT public.app_has_permission('document.upload') OR v.created_by IS DISTINCT FROM auth.uid() OR NOT public.document_visible(v.document_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='simi-documents' AND name=v.storage_path) THEN
 UPDATE public.document_versions SET file_state='failed' WHERE id=version AND file_state='pending';
 UPDATE public.documents SET file_state='failed' WHERE current_version_id=version AND file_state='pending'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fail_document_upload(document_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.fail_document_version((SELECT current_version_id FROM public.documents WHERE id=document_id)); END $$;
CREATE FUNCTION public.set_document_archive(doc uuid,archived boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.app_has_permission('document.delete') OR NOT public.document_visible(doc) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 UPDATE public.documents SET archived_at=CASE WHEN archived THEN now() END WHERE id=doc;
END $$;
CREATE VIEW public.document_register WITH(security_invoker=true) AS
SELECT d.*,c.name category_name,c.code category_code,c.parent_id category_parent_id,e.business_name entity_name,e.country entity_country,
 v.version_number,v.label version_label,
 ARRAY(SELECT x.project_id FROM public.document_project_context x WHERE x.document_id=d.id) project_ids,
 ARRAY(SELECT x.company_id FROM public.document_company_context x WHERE x.document_id=d.id) company_ids,
 ARRAY(SELECT x.invoice_id FROM public.document_invoice_context x WHERE x.document_id=d.id) invoice_ids,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',p.project_code)) FROM public.document_project_context x JOIN public.projects p ON p.id=x.project_id WHERE x.document_id=d.id),'[]'::jsonb) projects,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',p.business_name,'type',p.company_type)) FROM public.document_company_context x JOIN public.companies p ON p.id=x.company_id WHERE x.document_id=d.id),'[]'::jsonb) companies,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'label',i.invoice_number)) FROM public.document_invoice_context x JOIN public.invoices i ON i.id=x.invoice_id WHERE x.document_id=d.id),'[]'::jsonb) invoices,
 CASE WHEN d.archived_at IS NOT NULL THEN 'archived' WHEN d.status IN ('draft','superseded') THEN d.status WHEN d.expiry_date<CURRENT_DATE THEN 'expired' WHEN d.expiry_date<=CURRENT_DATE+30 THEN 'expiring' ELSE 'valid' END display_status,
 concat_ws(' ',d.title,d.description,d.reference,d.original_filename,d.normalized_filename,
 (SELECT string_agg(p.project_code||' '||p.name,' ') FROM public.document_project_context x JOIN public.projects p ON p.id=x.project_id WHERE x.document_id=d.id),
 (SELECT string_agg(p.business_name,' ') FROM public.document_company_context x JOIN public.companies p ON p.id=x.company_id WHERE x.document_id=d.id),
 (SELECT string_agg(concat_ws(' ',dv.original_filename,dv.normalized_filename),' ') FROM public.document_versions dv WHERE dv.document_id=d.id)) search_text
FROM public.documents d LEFT JOIN public.document_categories c ON c.id=d.category_id LEFT JOIN public.legal_entities e ON e.id=d.legal_entity_id LEFT JOIN public.document_versions v ON v.id=d.current_version_id;
GRANT SELECT ON public.document_register TO authenticated;
-- Narrow event feed: only event metadata, never historical private payloads.
CREATE FUNCTION public.document_events(doc uuid) RETURNS TABLE(id uuid,user_id uuid,action text,created_at timestamptz,entity_type text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.id,a.user_id,a.action,a.created_at,a.entity_type FROM public.activity_logs a WHERE public.document_visible(doc) AND
 (a.entity_type='documents' AND a.entity_id=doc OR a.entity_type IN ('document_versions','document_projects','document_companies','document_invoices') AND coalesce(a.new_data->>'document_id',a.old_data->>'document_id')=doc::text)
 ORDER BY a.created_at DESC,a.id DESC LIMIT 100;
$$;
DO $$ DECLARE signature text; BEGIN FOREACH signature IN ARRAY ARRAY[
 'public.validate_document_filename(text,text,bigint)','public.seed_document_version()',
 'public.link_document_context(uuid,uuid,uuid,uuid)','public.save_document_metadata(uuid,jsonb)',
 'public.reserve_document_upload(text,text,bigint,text,text,jsonb,uuid,text,text)',
 'public.finalize_document_version(uuid,boolean)','public.fail_document_version(uuid)','public.set_document_archive(uuid,boolean)','public.document_events(uuid)'] LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC';
 IF signature NOT IN ('public.validate_document_filename(text,text,bigint)','public.seed_document_version()') THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO authenticated'; END IF;
END LOOP; END $$;
CREATE OR REPLACE VIEW public.operational_deadlines WITH (security_invoker=true) AS
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
 UNION ALL
 SELECT 'document:'||d.id,'document',NULL::uuid,NULL::uuid,coalesce(d.title,d.original_filename),d.description,d.expiry_date,NULL::time,'document',d.legal_entity_id,
 d.company_ids[1],d.id,d.project_ids,'document','medium',d.assigned_to,d.notes,NULL::numeric,NULL::numeric,NULL::numeric,NULL::text,false,NULL::timestamptz
 FROM public.document_register d WHERE d.expiry_date IS NOT NULL AND d.archived_at IS NULL AND d.file_state='ready' AND d.status NOT IN ('draft','superseded','archived','invalid')
)
SELECT s.*,e.business_name entity_name,e.country entity_country,c.business_name company_name,c.company_type,
 cat.name category_name,
 CASE WHEN completed THEN 'completed' WHEN due_date<CURRENT_DATE THEN 'overdue' WHEN due_date=CURRENT_DATE THEN 'today' WHEN due_date<=CURRENT_DATE+7 THEN 'soon' ELSE 'future' END temporal_status,
 s.title||' '||coalesce(s.description,'')||' '||coalesce(c.business_name,'') search_text
FROM sources s LEFT JOIN public.legal_entities e ON e.id=s.legal_entity_id LEFT JOIN public.companies c ON c.id=s.company_id LEFT JOIN public.deadline_categories cat ON cat.code=s.category_code;

CREATE OR REPLACE FUNCTION public.save_invoice_phase1(payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<invoice_phase1>>
DECLARE invoice_id uuid; item jsonb;
BEGIN
  IF NULLIF(payload->>'document_id','') IS NOT NULL THEN
    IF NOT public.document_visible((payload->>'document_id')::uuid) OR NOT EXISTS(SELECT 1 FROM public.documents WHERE id=(payload->>'document_id')::uuid AND archived_at IS NULL AND legal_entity_id=(payload->>'legal_entity_id')::uuid) THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501'; END IF;
    IF EXISTS(SELECT 1 FROM public.documents WHERE id=(payload->>'document_id')::uuid AND file_state='pending') THEN PERFORM public.finalize_document((payload->>'document_id')::uuid); END IF;
    IF NOT EXISTS(SELECT 1 FROM public.documents WHERE id=(payload->>'document_id')::uuid AND file_state='ready') THEN RAISE EXCEPTION 'File not ready' USING ERRCODE='23514'; END IF;
  END IF;
  invoice_id := public.save_invoice(payload);
  UPDATE public.invoices SET received_date=NULLIF(payload->>'received_date','')::date,
    registration_date=NULLIF(payload->>'registration_date','')::date,
    currency=upper(COALESCE(NULLIF(payload->>'currency',''),'EUR')),
    vat_treatment=NULLIF(payload->>'vat_treatment',''),
    document_id=NULLIF(payload->>'document_id','')::uuid WHERE id=invoice_id;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'lines','[]'::jsonb)) LOOP
    IF NULLIF(item->>'id','') IS NOT NULL THEN
      UPDATE public.invoice_lines SET unit=NULLIF(item->>'unit',''), discount=COALESCE(NULLIF(item->>'discount','')::numeric,0), notes=NULLIF(item->>'notes','') WHERE id=(item->>'id')::uuid AND invoice_id=invoice_phase1.invoice_id;
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'installments','[]'::jsonb)) LOOP
    IF NULLIF(item->>'id','') IS NOT NULL THEN
      UPDATE public.invoice_installments SET status=COALESCE(NULLIF(item->>'status',''),'open'), notes=NULLIF(item->>'notes','') WHERE id=(item->>'id')::uuid AND invoice_id=invoice_phase1.invoice_id;
    END IF;
  END LOOP;
  RETURN invoice_id;
END $$;

CREATE FUNCTION public.project_document_categories(project uuid) RETURNS TABLE(id uuid,code text,name text,items bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT c.id,c.code,c.name,(SELECT count(*) FROM public.document_register d WHERE project=ANY(d.project_ids) AND d.archived_at IS NULL AND (d.category_id=c.id OR d.category_parent_id=c.id)) FROM public.document_categories c WHERE c.parent_id IS NULL AND c.active ORDER BY c.sort_order,c.code;
$$;
REVOKE ALL ON FUNCTION public.project_document_categories(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_document_categories(uuid) TO authenticated;
CREATE FUNCTION public.validate_document_category_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.parent_id IS NOT NULL AND (NEW.parent_id=NEW.id OR NOT EXISTS(SELECT 1 FROM public.document_categories p WHERE p.id=NEW.parent_id AND p.parent_id IS NULL) OR EXISTS(SELECT 1 FROM public.document_categories c WHERE c.parent_id=NEW.id)) THEN RAISE EXCEPTION 'Only category and subcategory levels allowed' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_document_category_parent() FROM PUBLIC;
CREATE TRIGGER document_category_parent BEFORE INSERT OR UPDATE ON public.document_categories FOR EACH ROW EXECUTE FUNCTION public.validate_document_category_parent();
-- Document metadata is writable only through validation; legacy narrow fields remain compatible.
REVOKE ALL ON public.document_versions,public.document_projects,public.document_companies,public.document_invoices FROM anon,authenticated;
GRANT SELECT ON public.document_versions,public.document_projects,public.document_companies,public.document_invoices TO authenticated;
COMMIT;
