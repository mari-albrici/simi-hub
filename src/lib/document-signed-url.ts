import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError,checkDatabase } from "./errors";
export async function createVersionSignedUrl(db:SupabaseClient,versionId:string,download=false){
 const r=await db.from("document_versions").select("storage_path,original_filename,normalized_filename,file_state").eq("id",versionId).single();checkDatabase(r.error);
 if(!r.data||r.data.file_state!=="ready")throw new AppError("storage","File non ancora disponibile.");
 const signed=await db.storage.from("simi-documents").createSignedUrl(r.data.storage_path,300,download?{download:r.data.normalized_filename||r.data.original_filename}:undefined);
 if(signed.error)throw new AppError("storage","Accesso al file non disponibile. Se è archiviato, ripristinare prima il documento.");return signed.data.signedUrl;
}
