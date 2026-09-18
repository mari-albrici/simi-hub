import type { SupabaseClient } from "@supabase/supabase-js";
import { validateDocumentFile,documentHash,normalizedDocumentName } from "./files";
import { AppError,checkDatabase } from "./errors";
/** Single reserve -> upload -> finalize workflow, shared by documents and invoice PDFs. */
export async function uploadDocumentFile(db:SupabaseClient,file:File,metadata:Record<string,unknown>,options:{documentId?:string;label?:string;notes?:string;acknowledgeDuplicate?:boolean;typeName?:string;project?:string|null;company?:string|null;invoice?:string|null}={}){
 await validateDocumentFile(file);
 const hash=await documentHash(file);
 const normalized=normalizedDocumentName(String(metadata.document_date||new Date().toISOString().slice(0,10)),options.typeName||"Documento",String(metadata.title||file.name),file.name);
 const reserve=await db.rpc("reserve_document_upload",{filename:file.name,mime:file.type,bytes:file.size,hash,normalized,payload:metadata,doc:options.documentId||null,version_label:options.label||null,version_notes:options.notes||null});
 checkDatabase(reserve.error,"Prenotazione documento");const row=reserve.data?.[0];if(!row)throw new AppError("database","Prenotazione non confermata.");
 if(!options.documentId&&(options.project||options.company||options.invoice)){
 const linked=await db.rpc("link_document_context",{doc:row.document_id,project:options.project||null,company:options.company||null,invoice:options.invoice||null});
 if(linked.error){await db.rpc("fail_document_version",{version:row.version_id});checkDatabase(linked.error,"Collegamenti documento");}
 }
 const uploaded=await db.storage.from("simi-documents").upload(row.storage_path,file,{upsert:false,contentType:file.type});
 if(uploaded.error){const cleanup=await db.rpc("fail_document_version",{version:row.version_id});checkDatabase(cleanup.error,"Registrazione errore Storage");throw new AppError("storage",`Upload non riuscito. La prenotazione è tracciata nel documento ${row.document_id}.`);}
 const finalized=await db.rpc("finalize_document_version",{version:row.version_id,acknowledge_duplicate:!!options.acknowledgeDuplicate});
 if(finalized.error)throw new AppError("storage",`File caricato ma non finalizzato. Apri /documenti/${row.document_id} per verificare e riprendere la finalizzazione. ${finalized.error.code==="23505"?"Questo file risulta già presente nell'archivio.":""}`);
 return {documentId:String(row.document_id),versionId:String(row.version_id),hash,normalized};
}
