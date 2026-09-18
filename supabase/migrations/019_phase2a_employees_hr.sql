BEGIN;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS tax_identifier text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS birth_place text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS nationality text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employment_level text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS contract_type text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_status_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_status_check CHECK (status IN ('to_hire','active','suspended','terminated','archived')) NOT VALID;
CREATE INDEX IF NOT EXISTS employees_search_idx ON public.employees(last_name,first_name,status,legal_entity_id);
CREATE INDEX IF NOT EXISTS documents_employee_expiry_idx ON public.documents(employee_id,expiry_date) WHERE employee_id IS NOT NULL AND archived_at IS NULL;
INSERT INTO public.document_categories(code,name,parent_id,sort_order) SELECT 'HR-IDENTITY','HR — Identità',id,90 FROM public.document_categories WHERE code='08' ON CONFLICT(code) DO NOTHING;
INSERT INTO public.document_categories(code,name,parent_id,sort_order) SELECT 'HR-CONTRACT','HR — Contrattuale',id,91 FROM public.document_categories WHERE code='01' ON CONFLICT(code) DO NOTHING;
INSERT INTO public.document_categories(code,name,parent_id,sort_order) SELECT 'HR-SAFETY','HR — Salute e sicurezza',id,92 FROM public.document_categories WHERE code='08' ON CONFLICT(code) DO NOTHING;
INSERT INTO public.document_categories(code,name,parent_id,sort_order) SELECT 'HR-ADMIN','HR — Amministrativa',id,93 FROM public.document_categories WHERE code='08' ON CONFLICT(code) DO NOTHING;

-- Employee documents are a typed relation through the existing employee_id FK.
CREATE OR REPLACE FUNCTION public.document_visible(doc uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.app_has_permission('document.read') AND EXISTS(
   SELECT 1 FROM public.documents d WHERE d.id=doc AND
   ((d.access_scope='general' AND d.employee_id IS NULL)
    OR (d.access_scope='restricted' AND d.employee_id IS NULL AND public.app_role() IN ('admin','administration','management'))
    OR ((d.access_scope='hr' OR d.employee_id IS NOT NULL) AND (public.app_has_permission('employee.hr.read') OR public.app_role()='hr')))
   AND (d.file_state='ready' OR d.created_by=auth.uid() OR public.app_has_permission('admin.users'))
 );
$$;
REVOKE ALL ON FUNCTION public.document_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_visible(uuid) TO authenticated;
DROP POLICY IF EXISTS employees_read ON public.employees;
CREATE POLICY employees_read ON public.employees FOR SELECT TO authenticated USING(public.app_has_permission('employee.read') OR public.app_role() IN ('hr','admin'));

CREATE OR REPLACE FUNCTION public.document_storage_access(path text, operation text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.document_versions v JOIN public.documents d ON d.id=v.document_id WHERE v.storage_path=path AND d.archived_at IS NULL AND public.document_visible(d.id) AND CASE operation WHEN 'read' THEN v.file_state='ready' WHEN 'upload' THEN v.file_state='pending' AND v.created_by=auth.uid() AND public.app_has_permission('document.upload') ELSE false END)
 AND NOT EXISTS(SELECT 1 FROM public.document_versions v WHERE v.storage_path=path AND NOT public.document_visible(v.document_id));
$$;
REVOKE ALL ON FUNCTION public.document_storage_access(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_storage_access(text,text) TO authenticated,anon;

CREATE OR REPLACE FUNCTION public.app_has_permission(permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(CASE public.app_role()
 WHEN 'admin' THEN true
 WHEN 'administration' THEN permission = ANY(ARRAY['project.read','project.create','project.update','document.read','document.upload','document.update','invoice.read','invoice.create','invoice.update','company.read','company.create','company.update','legal_entity.read','legal_entity.create','deadline.read','deadline.write','dashboard.read','report.read','profile.directory','order.read','order.create','order.update','delivery_note.read','delivery_note.create','delivery_note.update','offer.read','offer.create','offer.update','offer.archive','contract.read','contract.create','contract.update','contract.archive','employee.read','employee.create','employee.update','employee.archive'])
 WHEN 'management' THEN permission = ANY(ARRAY['project.read','document.read','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','report.read','profile.directory','order.read','delivery_note.read','offer.read','contract.read'])
 WHEN 'project_manager' THEN permission = ANY(ARRAY['project.read','project.create','project.update','document.read','document.upload','document.update','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','profile.directory','deadline.write','order.read','order.create','order.update','delivery_note.read','delivery_note.create','delivery_note.update','offer.read','offer.create','offer.update','offer.archive','contract.read','contract.create','contract.update','contract.archive'])
 WHEN 'technical' THEN permission = ANY(ARRAY['project.read','project.update','document.read','document.upload','document.update','company.read','legal_entity.read','deadline.read','profile.directory','order.read','delivery_note.read','offer.read','contract.read'])
 WHEN 'viewer' THEN permission = ANY(ARRAY['project.read','document.read','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','report.read','profile.directory','offer.read','contract.read'])
 WHEN 'hr' THEN permission = ANY(ARRAY['project.read','document.read','document.upload','document.update','employee.read','employee.create','employee.update','employee.archive','employee.hr.read','legal_entity.read','deadline.read','deadline.write','profile.directory'])
 END,false)
$$;
REVOKE ALL ON FUNCTION public.app_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_permission(text) TO authenticated;

DROP POLICY IF EXISTS documents_read ON public.documents;
CREATE POLICY documents_read ON public.documents FOR SELECT TO authenticated USING(public.document_visible(id));
DROP POLICY IF EXISTS documents_update ON public.documents;
CREATE POLICY documents_update ON public.documents FOR UPDATE TO authenticated USING(public.document_visible(id) AND public.app_has_permission('document.update')) WITH CHECK(public.document_visible(id) AND public.app_has_permission('document.update'));
DROP POLICY IF EXISTS versions_read ON public.document_versions;
CREATE POLICY versions_read ON public.document_versions FOR SELECT TO authenticated USING(public.document_visible(document_id));

CREATE OR REPLACE FUNCTION public.link_employee_document(doc uuid, employee uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.app_has_permission('employee.hr.read') OR NOT public.app_has_permission('document.upload') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=employee) THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='23503'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.documents WHERE id=doc AND archived_at IS NULL AND public.document_visible(doc)) THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501'; END IF;
 UPDATE public.documents SET employee_id=employee,access_scope='hr' WHERE id=doc;
END $$;
REVOKE ALL ON FUNCTION public.link_employee_document(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_employee_document(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_employee(employee_id uuid, archived boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.app_has_permission('employee.archive') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 UPDATE public.employees SET archived_at=CASE WHEN archived THEN now() ELSE NULL END,status=CASE WHEN archived THEN 'archived' ELSE CASE WHEN termination_date IS NULL THEN 'active' ELSE 'terminated' END END WHERE id=employee_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Record unavailable' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.archive_employee(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_employee(uuid,boolean) TO authenticated;

CREATE VIEW public.employee_deadlines WITH (security_invoker=true) AS
 SELECT 'document:'||d.id AS id, d.employee_id, d.title, d.expiry_date AS due_date,
        CASE WHEN d.expiry_date<CURRENT_DATE THEN 'overdue' WHEN d.expiry_date=CURRENT_DATE THEN 'today' WHEN d.expiry_date<=CURRENT_DATE+7 THEN 'soon' ELSE 'future' END AS temporal_status,
        'document'::text AS category_code, d.id AS document_id
 FROM public.document_register d
 WHERE d.employee_id IS NOT NULL AND d.expiry_date IS NOT NULL AND d.archived_at IS NULL AND d.file_state='ready'
 UNION ALL
 SELECT 'manual:'||x.id, x.employee_id, x.title, x.due_date,
        CASE WHEN x.due_date<CURRENT_DATE THEN 'overdue' WHEN x.due_date=CURRENT_DATE THEN 'today' WHEN x.due_date<=CURRENT_DATE+7 THEN 'soon' ELSE 'future' END,
        x.category_code, x.document_id
 FROM public.deadlines x WHERE x.employee_id IS NOT NULL AND x.archived_at IS NULL;
GRANT SELECT ON public.employee_deadlines TO authenticated;

COMMIT;
