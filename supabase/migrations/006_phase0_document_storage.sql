-- Reserve metadata before upload. Physical removal is intentionally disabled in Phase 0.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('simi-documents','simi-documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS authenticated_upload_simi_documents ON storage.objects;
DROP POLICY IF EXISTS authenticated_read_simi_documents ON storage.objects;
DROP POLICY IF EXISTS authenticated_update_simi_documents ON storage.objects;
DROP POLICY IF EXISTS authenticated_delete_simi_documents ON storage.objects;
REVOKE INSERT ON public.documents FROM authenticated;

CREATE OR REPLACE FUNCTION public.document_storage_access(path text, operation text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.documents d WHERE d.storage_path=path AND d.archived_at IS NULL
 AND (d.employee_id IS NULL AND d.access_scope='general' OR public.app_has_permission('employee.read'))
 AND CASE operation WHEN 'read' THEN d.file_state='ready' AND public.app_has_permission('document.read')
 WHEN 'upload' THEN d.file_state='pending' AND d.created_by=auth.uid() AND public.app_has_permission('document.upload') ELSE false END)
 AND (public.app_has_permission('employee.read') OR NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.storage_path=path AND (d.employee_id IS NOT NULL OR d.access_scope='hr')))
$$;
REVOKE ALL ON FUNCTION public.document_storage_access(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_storage_access(text,text) TO authenticated, anon;
-- Restrictive guards also neutralize any pre-existing broad policy affecting this bucket.
CREATE POLICY simi_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='simi-documents' AND public.document_storage_access(name,'read'));
CREATE POLICY simi_storage_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO public USING(bucket_id<>'simi-documents' OR public.document_storage_access(name,'read'));
CREATE POLICY simi_storage_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='simi-documents' AND public.document_storage_access(name,'upload'));
CREATE POLICY simi_storage_upload_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO public WITH CHECK(bucket_id<>'simi-documents' OR public.document_storage_access(name,'upload'));
CREATE POLICY simi_storage_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO public USING(bucket_id<>'simi-documents') WITH CHECK(bucket_id<>'simi-documents');
CREATE POLICY simi_storage_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO public USING(bucket_id<>'simi-documents');

CREATE OR REPLACE FUNCTION public.reserve_document(filename text, mime text, bytes bigint, entity_id uuid DEFAULT NULL) RETURNS TABLE(id uuid,storage_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE document_id uuid:=gen_random_uuid(); path text;
BEGIN
 IF NOT public.app_has_permission('document.upload') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF mime NOT IN ('application/pdf','image/jpeg','image/png','image/webp') OR bytes NOT BETWEEN 1 AND 10485760 OR length(filename) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'Invalid file' USING ERRCODE='22023'; END IF;
 IF entity_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.legal_entities WHERE legal_entities.id=entity_id AND active) THEN RAISE EXCEPTION 'Invalid entity' USING ERRCODE='23514'; END IF;
 path='documents/'||document_id::text||CASE mime WHEN 'application/pdf' THEN '.pdf' WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END;
 INSERT INTO public.documents(id,original_filename,stored_filename,storage_path,mime_type,file_size,created_by,legal_entity_id,file_state)
 VALUES(document_id,filename,split_part(path,'/',2),path,mime,bytes,auth.uid(),entity_id,'pending');
 RETURN QUERY SELECT document_id,path;
END $$;
CREATE OR REPLACE FUNCTION public.finalize_document(document_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents;
BEGIN
 IF NOT public.app_has_permission('document.upload') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.documents WHERE id=document_id FOR UPDATE;
 IF d.id IS NULL OR d.created_by<>auth.uid() OR d.archived_at IS NOT NULL OR d.file_state NOT IN ('pending','ready') THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='simi-documents' AND name=d.storage_path) THEN RAISE EXCEPTION 'Upload not confirmed' USING ERRCODE='23514'; END IF;
 UPDATE public.documents SET file_state='ready' WHERE id=document_id;
END $$;
CREATE OR REPLACE FUNCTION public.fail_document_upload(document_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.app_has_permission('document.upload') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 -- If a timed-out upload actually succeeded, retain its pending reservation for reconciliation.
 UPDATE public.documents d SET file_state='failed' WHERE id=document_id AND created_by=auth.uid() AND file_state='pending'
 AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='simi-documents' AND o.name=d.storage_path);
END $$;
REVOKE ALL ON FUNCTION public.reserve_document(text,text,bigint,uuid),public.finalize_document(uuid),public.fail_document_upload(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_document(text,text,bigint,uuid),public.finalize_document(uuid),public.fail_document_upload(uuid) TO authenticated;
COMMIT;
