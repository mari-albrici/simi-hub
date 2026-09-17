-- RLS per il bucket storage "simi-documents" (creato manualmente in Supabase Storage).
-- Senza queste policy un bucket privato rifiuta upload/lettura anche per utenti autenticati.

CREATE POLICY "authenticated_upload_simi_documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'simi-documents');

CREATE POLICY "authenticated_read_simi_documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'simi-documents');

CREATE POLICY "authenticated_update_simi_documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'simi-documents')
  WITH CHECK (bucket_id = 'simi-documents');

CREATE POLICY "authenticated_delete_simi_documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'simi-documents');
