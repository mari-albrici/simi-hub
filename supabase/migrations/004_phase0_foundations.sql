-- Phase 0: additive reconciliation. Existing records are never deleted.
BEGIN;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES public.legal_entities(id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES public.legal_entities(id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS access_scope text NOT NULL DEFAULT 'general' CHECK (access_scope IN ('general','hr'));
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_state text NOT NULL DEFAULT 'ready' CHECK (file_state IN ('pending','ready','failed'));
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS version_of_id uuid REFERENCES public.documents(id);
ALTER TABLE public.invoice_lines ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS archived_at timestamptz;
-- NOT VALID preserves existing orphans while enforcing the FK on new/changed rows.
ALTER TABLE public.projects ADD CONSTRAINT projects_customer_fk FOREIGN KEY (customer_id) REFERENCES public.companies(id) NOT VALID;
ALTER TABLE public.projects ADD CONSTRAINT projects_manager_fk FOREIGN KEY (project_manager_id) REFERENCES public.profiles(id) NOT VALID;
ALTER TABLE public.documents ADD CONSTRAINT documents_employee_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) NOT VALID;
ALTER TABLE public.deadlines ADD CONSTRAINT deadlines_employee_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) NOT VALID;
INSERT INTO public.invoice_projects(invoice_id, project_id)
SELECT id, project_id FROM public.invoices WHERE project_id IS NOT NULL ON CONFLICT DO NOTHING;
COMMENT ON COLUMN public.invoices.project_id IS 'Deprecated, read-only legacy value. invoice_projects is authoritative; do not write this column.';
UPDATE public.documents SET access_scope = 'hr' WHERE employee_id IS NOT NULL;
-- No country-name inference: the job's location need not be its owning legal entity.
INSERT INTO public.legal_entities(code,business_name,country) VALUES
 ('SIMI-IT','SIMI Italia','IT'),('SIMI-FR','SIMI France','FR'),('SIMI-LU','SIMI Luxembourg','LU')
 ON CONFLICT(code) DO NOTHING;
INSERT INTO public.document_categories(code,name,sort_order) VALUES
 ('00','Anagrafica commessa',0),('01','Contratti e Ordini',1),('02','Offerte e Preventivi',2),
 ('03','Corrispondenza',3),('04','Documentazione Tecnica',4),('05','Fornitori e Acquisti',5),
 ('06','DDT e Logistica',6),('07','Fatture e Contabilità',7),('08','Certificati e Dichiarazioni',8)
 ON CONFLICT(code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.app_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p.role FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.id=auth.uid() AND p.active AND lower(split_part(u.email,'@',2))='simisrl.eu'
$$;
CREATE OR REPLACE FUNCTION public.app_has_permission(permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT COALESCE(CASE public.app_role()
 WHEN 'admin' THEN permission = ANY(ARRAY['project.read','project.create','project.update','project.delete','document.read','document.upload','document.update','document.delete','invoice.read','invoice.create','invoice.update','invoice.delete','company.read','company.create','company.update','company.delete','employee.read','employee.update','admin.users','admin.settings','legal_entity.read','legal_entity.create','deadline.read','deadline.write','dashboard.read','report.read','profile.directory'])
 WHEN 'administration' THEN permission = ANY(ARRAY['project.read','project.create','project.update','document.read','document.upload','document.update','invoice.read','invoice.create','invoice.update','company.read','company.create','company.update','legal_entity.read','deadline.read','deadline.write','dashboard.read','report.read','profile.directory'])
 WHEN 'management' THEN permission = ANY(ARRAY['project.read','document.read','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','report.read','profile.directory'])
 WHEN 'project_manager' THEN permission = ANY(ARRAY['project.read','project.create','project.update','document.read','document.upload','document.update','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','profile.directory'])
 WHEN 'technical' THEN permission = ANY(ARRAY['project.read','project.update','document.read','document.upload','document.update','company.read','legal_entity.read','deadline.read','profile.directory'])
 WHEN 'viewer' THEN permission = ANY(ARRAY['project.read','document.read','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','report.read','profile.directory'])
 WHEN 'hr' THEN permission = ANY(ARRAY['project.read','document.read','document.upload','document.update','employee.read','employee.update','legal_entity.read','deadline.read','deadline.write','profile.directory'])
 ELSE false END, false)
$$;
REVOKE ALL ON FUNCTION public.app_role(), public.app_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_role(), public.app_has_permission(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_my_profile() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u auth.users;
BEGIN
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 IF u.id IS NULL OR lower(split_part(u.email,'@',2)) <> 'simisrl.eu' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.profiles(id,email,first_name,last_name,role,active)
 VALUES(u.id,u.email,u.raw_user_meta_data->>'first_name',u.raw_user_meta_data->>'last_name','viewer',true)
 ON CONFLICT(id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;
CREATE OR REPLACE FUNCTION public.handle_new_user_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.profiles(id,email,first_name,last_name,role,active)
 VALUES(NEW.id,NEW.email,NEW.raw_user_meta_data->>'first_name',NEW.raw_user_meta_data->>'last_name','viewer', lower(split_part(NEW.email,'@',2))='simisrl.eu')
 ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();
-- Provision missing profiles only. Preserve every existing role and active flag.
INSERT INTO public.profiles(id,email,first_name,last_name,role,active)
SELECT id,email,raw_user_meta_data->>'first_name',raw_user_meta_data->>'last_name','viewer', lower(split_part(email,'@',2))='simisrl.eu'
FROM auth.users WHERE email IS NOT NULL ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guard_profile_privileges() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND
   (NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active OR NEW.email IS DISTINCT FROM OLD.email)
 THEN RAISE EXCEPTION 'Protected profile fields' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_profile_privileges BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

-- Remove old permissive policies from the owned application tables, including the schema.sql variant.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN
 ('profiles','legal_entities','companies','company_contacts','projects','document_categories','documents','invoices','invoice_lines','invoice_installments','invoice_projects','deadlines','employees','activity_logs')
 LOOP EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename); END LOOP;
END $$;
REVOKE ALL ON public.profiles FROM anon,authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE(first_name,last_name) ON public.profiles TO authenticated;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (id=auth.uid() OR public.app_has_permission('admin.users'));
CREATE POLICY profiles_edit ON public.profiles FOR UPDATE TO authenticated USING (id=auth.uid() AND public.app_role() IS NOT NULL) WITH CHECK(id=auth.uid());
-- Minimal directory avoids exposing profiles/email/roles to project readers.
CREATE OR REPLACE FUNCTION public.profile_directory() RETURNS TABLE(id uuid,first_name text,last_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,p.first_name,p.last_name FROM public.profiles p WHERE p.active AND public.app_has_permission('profile.directory')
$$;
REVOKE ALL ON FUNCTION public.profile_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_directory() TO authenticated;
REVOKE ALL ON public.legal_entities FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.legal_entities TO authenticated;
CREATE POLICY legal_entities_read ON public.legal_entities FOR SELECT TO authenticated USING (public.app_has_permission('legal_entity.read'));
CREATE POLICY legal_entities_insert ON public.legal_entities FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('legal_entity.create'));
CREATE POLICY legal_entities_update ON public.legal_entities FOR UPDATE TO authenticated USING (public.app_has_permission('legal_entity.create')) WITH CHECK (public.app_has_permission('legal_entity.create'));
REVOKE ALL ON public.companies FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.companies TO authenticated;
CREATE POLICY companies_read ON public.companies FOR SELECT TO authenticated USING (public.app_has_permission('company.read'));
CREATE POLICY companies_insert ON public.companies FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('company.create'));
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated USING (public.app_has_permission('company.update')) WITH CHECK (public.app_has_permission('company.update'));
REVOKE ALL ON public.company_contacts FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.company_contacts TO authenticated;
CREATE POLICY company_contacts_read ON public.company_contacts FOR SELECT TO authenticated USING (public.app_has_permission('company.read'));
CREATE POLICY company_contacts_insert ON public.company_contacts FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('company.create'));
CREATE POLICY company_contacts_update ON public.company_contacts FOR UPDATE TO authenticated USING (public.app_has_permission('company.update')) WITH CHECK (public.app_has_permission('company.update'));
REVOKE ALL ON public.projects FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.projects TO authenticated;
CREATE POLICY projects_read ON public.projects FOR SELECT TO authenticated USING (public.app_has_permission('project.read'));
CREATE POLICY projects_insert ON public.projects FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('project.create'));
CREATE POLICY projects_update ON public.projects FOR UPDATE TO authenticated USING (public.app_has_permission('project.update')) WITH CHECK (public.app_has_permission('project.update'));
REVOKE ALL ON public.document_categories FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.document_categories TO authenticated;
CREATE POLICY document_categories_read ON public.document_categories FOR SELECT TO authenticated USING (public.app_has_permission('document.read'));
CREATE POLICY document_categories_insert ON public.document_categories FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('admin.settings'));
CREATE POLICY document_categories_update ON public.document_categories FOR UPDATE TO authenticated USING (public.app_has_permission('admin.settings')) WITH CHECK (public.app_has_permission('admin.settings'));
REVOKE ALL ON public.documents FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.documents TO authenticated;
CREATE POLICY documents_read ON public.documents FOR SELECT TO authenticated USING (public.app_has_permission('document.read') AND (employee_id IS NULL AND access_scope='general' OR public.app_has_permission('employee.read')));
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('document.upload') AND (employee_id IS NULL AND access_scope='general' OR public.app_has_permission('employee.read')));
CREATE POLICY documents_update ON public.documents FOR UPDATE TO authenticated USING (public.app_has_permission('document.update') AND (employee_id IS NULL AND access_scope='general' OR public.app_has_permission('employee.read'))) WITH CHECK (public.app_has_permission('document.update') AND (employee_id IS NULL AND access_scope='general' OR public.app_has_permission('employee.read')));
REVOKE ALL ON public.deadlines FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.deadlines TO authenticated;
CREATE POLICY deadlines_read ON public.deadlines FOR SELECT TO authenticated USING (public.app_has_permission('deadline.read') AND (employee_id IS NULL OR public.app_has_permission('employee.read')));
CREATE POLICY deadlines_insert ON public.deadlines FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('deadline.write') AND (employee_id IS NULL OR public.app_has_permission('employee.read')));
CREATE POLICY deadlines_update ON public.deadlines FOR UPDATE TO authenticated USING (public.app_has_permission('deadline.write') AND (employee_id IS NULL OR public.app_has_permission('employee.read'))) WITH CHECK (public.app_has_permission('deadline.write') AND (employee_id IS NULL OR public.app_has_permission('employee.read')));
REVOKE ALL ON public.employees FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.employees TO authenticated;
CREATE POLICY employees_read ON public.employees FOR SELECT TO authenticated USING (public.app_has_permission('employee.read'));
CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated WITH CHECK (public.app_has_permission('employee.update'));
CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated USING (public.app_has_permission('employee.update')) WITH CHECK (public.app_has_permission('employee.update'));
REVOKE UPDATE ON public.documents FROM authenticated;
GRANT UPDATE(title,expiry_date) ON public.documents TO authenticated;
-- Archive operations must use the checked RPC, never bypass delete permissions.
CREATE OR REPLACE FUNCTION public.guard_archive() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN RAISE EXCEPTION 'Use archive_record' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_project_archive BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.guard_archive();
CREATE TRIGGER guard_company_archive BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.guard_archive();
-- Financial writes are RPC-only. RLS still protects all direct reads.
REVOKE ALL ON public.invoices FROM anon,authenticated;
GRANT SELECT ON public.invoices TO authenticated;
CREATE POLICY invoices_read ON public.invoices FOR SELECT TO authenticated USING (public.app_has_permission('invoice.read'));
REVOKE ALL ON public.invoice_lines FROM anon,authenticated;
GRANT SELECT ON public.invoice_lines TO authenticated;
CREATE POLICY invoice_lines_read ON public.invoice_lines FOR SELECT TO authenticated USING (public.app_has_permission('invoice.read'));
REVOKE ALL ON public.invoice_installments FROM anon,authenticated;
GRANT SELECT ON public.invoice_installments TO authenticated;
CREATE POLICY invoice_installments_read ON public.invoice_installments FOR SELECT TO authenticated USING (public.app_has_permission('invoice.read'));
REVOKE ALL ON public.invoice_projects FROM anon,authenticated;
GRANT SELECT ON public.invoice_projects TO authenticated;
CREATE POLICY invoice_projects_read ON public.invoice_projects FOR SELECT TO authenticated USING (public.app_has_permission('invoice.read'));
REVOKE ALL ON public.activity_logs FROM anon,authenticated;
GRANT SELECT ON public.activity_logs TO authenticated;
CREATE POLICY audit_read ON public.activity_logs FOR SELECT TO authenticated USING (public.app_has_permission('admin.users'));
CREATE OR REPLACE FUNCTION public.audit_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous jsonb; following jsonb; record_id uuid;
BEGIN
 IF TG_OP <> 'INSERT' THEN previous=to_jsonb(OLD); END IF;
 IF TG_OP <> 'DELETE' THEN following=to_jsonb(NEW); END IF;
 record_id=COALESCE((following->>'id')::uuid,(previous->>'id')::uuid,(following->>'invoice_id')::uuid,(previous->>'invoice_id')::uuid);
 INSERT INTO public.activity_logs(user_id,entity_type,entity_id,action,old_data,new_data)
 VALUES(auth.uid(),TG_TABLE_NAME,record_id,lower(TG_OP),previous,following);
 RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.audit_mutation() FROM PUBLIC;
CREATE TRIGGER audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_projects AFTER INSERT OR UPDATE OR DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_companies AFTER INSERT OR UPDATE OR DELETE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_company_contacts AFTER INSERT OR UPDATE OR DELETE ON public.company_contacts FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_legal_entities AFTER INSERT OR UPDATE OR DELETE ON public.legal_entities FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_documents AFTER INSERT OR UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_invoice_lines AFTER INSERT OR UPDATE OR DELETE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_invoice_installments AFTER INSERT OR UPDATE OR DELETE ON public.invoice_installments FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_invoice_projects AFTER INSERT OR UPDATE OR DELETE ON public.invoice_projects FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_deadlines AFTER INSERT OR UPDATE OR DELETE ON public.deadlines FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.audit_mutation();
-- Refuse ambiguous legacy writes instead of silently losing a project association.
CREATE OR REPLACE FUNCTION public.guard_legacy_invoice_project() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.project_id IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id) THEN
 RAISE EXCEPTION 'Use invoice_projects through save_invoice' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_legacy_invoice_project BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_invoice_project();
CREATE OR REPLACE FUNCTION public.guard_project_relationships() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.companies WHERE id=NEW.customer_id AND company_type IN ('customer','both')) THEN RAISE EXCEPTION 'Invalid customer' USING ERRCODE='23514'; END IF;
 IF NEW.project_manager_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profile_directory() WHERE id=NEW.project_manager_id) AND current_user='authenticated' THEN RAISE EXCEPTION 'Invalid manager' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_project_relationships BEFORE INSERT OR UPDATE OF customer_id,project_manager_id ON public.projects FOR EACH ROW EXECUTE FUNCTION public.guard_project_relationships();
CREATE INDEX IF NOT EXISTS idx_projects_legal_entity_id ON public.projects(legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_legal_entity_id ON public.documents(legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_employee_id ON public.documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_documents_supplier_id ON public.documents(supplier_id);
CREATE INDEX IF NOT EXISTS idx_documents_customer_id ON public.documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_documents_category_id ON public.documents(category_id);
CREATE INDEX IF NOT EXISTS idx_invoices_legal_entity_id ON public.invoices(legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_id ON public.invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_document_id ON public.invoices(document_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON public.invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_project_id ON public.invoice_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_invoice_installments_invoice_id ON public.invoice_installments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_projects_project_id ON public.invoice_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_company_contacts_company_id ON public.company_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_legal_entity_id ON public.employees(legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_project_id ON public.deadlines(project_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_invoice_id ON public.deadlines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_document_id ON public.deadlines(document_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_employee_id ON public.deadlines(employee_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_legal_entity_id ON public.deadlines(legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_company_id ON public.deadlines(company_id);
CREATE INDEX IF NOT EXISTS idx_invoice_open_due ON public.invoices(status,due_date) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_installment_unpaid_due ON public.invoice_installments(due_date) WHERE NOT paid;
CREATE INDEX IF NOT EXISTS idx_documents_storage_path ON public.documents(storage_path);
CREATE INDEX IF NOT EXISTS idx_activity_entity_time ON public.activity_logs(entity_type,entity_id,created_at DESC);
COMMIT;
