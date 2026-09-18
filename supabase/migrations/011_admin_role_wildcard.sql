-- Admin is the platform role: every current and future application permission
-- is granted through the existing app_has_permission RBAC function. This does
-- not bypass RLS; every table policy and SECURITY DEFINER RPC still runs.
BEGIN;
CREATE OR REPLACE FUNCTION public.app_has_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT COALESCE(CASE public.app_role()
   WHEN 'admin' THEN true
   WHEN 'administration' THEN permission = ANY(ARRAY['project.read','project.create','project.update','document.read','document.upload','document.update','invoice.read','invoice.create','invoice.update','company.read','company.create','company.update','legal_entity.read','legal_entity.create','deadline.read','deadline.write','dashboard.read','report.read','profile.directory'])
   WHEN 'management' THEN permission = ANY(ARRAY['project.read','document.read','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','report.read','profile.directory'])
   WHEN 'project_manager' THEN permission = ANY(ARRAY['project.read','project.create','project.update','document.read','document.upload','document.update','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','profile.directory'])
   WHEN 'technical' THEN permission = ANY(ARRAY['project.read','project.update','document.read','document.upload','document.update','company.read','legal_entity.read','deadline.read','profile.directory'])
   WHEN 'viewer' THEN permission = ANY(ARRAY['project.read','document.read','invoice.read','company.read','legal_entity.read','deadline.read','dashboard.read','report.read','profile.directory'])
   WHEN 'hr' THEN permission = ANY(ARRAY['project.read','document.read','document.upload','document.update','employee.read','employee.update','legal_entity.read','deadline.read','deadline.write','profile.directory'])
   ELSE false
 END, false)
$$;
REVOKE ALL ON FUNCTION public.app_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_has_permission(text) TO authenticated;
COMMIT;
