-- Support notes-only updates through the existing document metadata API.
CREATE OR REPLACE FUNCTION public.save_document_metadata(doc uuid,payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents; scope text:=coalesce(payload->>'access_scope','general');
BEGIN
 SELECT * INTO d FROM public.documents WHERE id=doc FOR UPDATE;
 IF NOT public.app_has_permission('document.update') OR NOT public.document_visible(doc) OR d.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF payload ? 'expected_updated_at' AND (payload->>'expected_updated_at')::timestamptz IS DISTINCT FROM d.updated_at THEN RAISE EXCEPTION 'Concurrent update' USING ERRCODE='40001'; END IF;
 -- A notes-only payload uses the same authorization, row lock and audit trigger.
 IF payload ? 'notes' AND payload - 'notes' - 'expected_updated_at' = '{}'::jsonb THEN
   IF jsonb_typeof(payload->'notes') IS DISTINCT FROM 'string' OR length(payload->>'notes') > 10000 THEN
     RAISE EXCEPTION 'Invalid notes' USING ERRCODE='22023';
   END IF;
   UPDATE public.documents SET notes=NULLIF(payload->>'notes','') WHERE id=doc;
   RETURN;
 END IF;
 IF coalesce(length(trim(payload->>'title')),0) NOT BETWEEN 1 AND 500 OR coalesce(payload->>'status','') NOT IN ('draft','valid','superseded') OR scope NOT IN ('general','restricted','hr') THEN RAISE EXCEPTION 'Invalid metadata' USING ERRCODE='22023'; END IF;
 IF scope='hr' AND NOT public.app_has_permission('employee.read') OR scope='restricted' AND public.app_role() NOT IN ('admin','administration','management') OR d.employee_id IS NOT NULL AND scope<>'hr' THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.legal_entities WHERE id=(payload->>'legal_entity_id')::uuid AND active) THEN RAISE EXCEPTION 'Entity required' USING ERRCODE='23514'; END IF;
 IF NULLIF(payload->>'category_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.document_categories WHERE id=(payload->>'category_id')::uuid AND active) THEN RAISE EXCEPTION 'Invalid category' USING ERRCODE='23514'; END IF;
 IF NULLIF(payload->>'assigned_to','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profile_directory() WHERE id=(payload->>'assigned_to')::uuid) THEN RAISE EXCEPTION 'Invalid assignee' USING ERRCODE='23514'; END IF;
 IF d.legal_entity_id IS DISTINCT FROM (payload->>'legal_entity_id')::uuid AND (EXISTS(SELECT 1 FROM public.document_projects WHERE document_id=doc) OR EXISTS(SELECT 1 FROM public.document_invoices WHERE document_id=doc) OR EXISTS(SELECT 1 FROM public.invoices WHERE document_id=doc)) THEN RAISE EXCEPTION 'Linked entity cannot change' USING ERRCODE='23514'; END IF;
 UPDATE public.documents SET title=trim(payload->>'title'),description=NULLIF(payload->>'description',''),reference=NULLIF(payload->>'reference',''),category_id=NULLIF(payload->>'category_id','')::uuid,
 document_date=NULLIF(payload->>'document_date','')::date,expiry_date=NULLIF(payload->>'expiry_date','')::date,legal_entity_id=(payload->>'legal_entity_id')::uuid,country=NULLIF(payload->>'country',''),language=NULLIF(payload->>'language',''),notes=NULLIF(payload->>'notes',''),assigned_to=NULLIF(payload->>'assigned_to','')::uuid,status=payload->>'status',access_scope=scope WHERE id=doc;
END $$;
