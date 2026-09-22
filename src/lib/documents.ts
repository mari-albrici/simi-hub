import { authorizedClient } from "@/lib/permissions";
import { createVersionSignedUrl } from "@/lib/document-signed-url";
import { checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { documentFilterSchema } from "@/lib/document-validation";
import { z } from "zod";
export type DocumentContext={id:string;label:string;type?:string};
export type ArchiveDocument={id:string;title:string|null;description:string|null;reference:string|null;category_id:string|null;category_name:string|null;category_code:string|null;category_parent_id:string|null;document_date:string|null;expiry_date:string|null;legal_entity_id:string|null;entity_name:string|null;entity_country:string|null;country:string|null;language:string|null;notes:string|null;status:string;display_status:string;access_scope:string;assigned_to:string|null;employee_id:string|null;created_by:string|null;created_at:string;updated_at:string;archived_at:string|null;current_version_id:string;version_number:number;version_label:string|null;original_filename:string;normalized_filename:string|null;stored_filename:string;storage_path:string;file_state:string;mime_type:string|null;file_size:number|null;project_ids:string[];company_ids:string[];invoice_ids:string[];projects:DocumentContext[];companies:DocumentContext[];invoices:DocumentContext[]};
export type DocumentVersion={id:string;document_id:string;version_number:number;original_filename:string;normalized_filename:string|null;stored_filename:string;storage_path:string;mime_type:string|null;file_size:number|null;content_hash:string|null;file_state:string;label:string|null;notes:string|null;created_by:string|null;created_at:string};
export async function searchDocuments(params:Record<string,string|undefined>={}){
 const f=documentFilterSchema.parse(params),db=await authorizedClient("document.read");
 let q=db.from("general_document_register").select("*",{count:"exact"});
 if(f.status!=="archived")q=q.is("archived_at",null);
 if(f.q)q=q.ilike("search_text",`%${f.q.replace(/[%_\\]/g,"\\$&")}%`);
 for(const [key,value] of [["legal_entity_id",f.entity],["country",f.country],["display_status",f.status]])if(key&&value)q=q.eq(key,value);
 if(f.category)q=q.or(`category_id.eq.${f.category},category_parent_id.eq.${f.category}`);
 for(const [key,value] of [["project_ids",f.project],["company_ids",f.company],["invoice_ids",f.invoice]])if(key&&value)q=q.contains(key,[value]);
 if(f.from)q=q.gte("document_date",f.from);if(f.to)q=q.lte("document_date",f.to);
 const today=new Date().toISOString().slice(0,10);
 if(f.expiry==="none")q=q.is("expiry_date",null);
 if(f.expiry==="overdue")q=q.eq("display_status","expired");
 if(f.expiry==="30"){const end=new Date(`${today}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+30);q=q.gte("expiry_date",today).lte("expiry_date",end.toISOString().slice(0,10)).in("display_status",["valid","expiring"]);}
 const result=await q.order(f.sort,{ascending:f.direction==="asc",nullsFirst:false}).order("id").range((f.page-1)*50,f.page*50-1);checkDatabase(result.error,"Ricerca documenti");
 return {rows:(result.data??[]) as ArchiveDocument[],count:result.count??0,filters:f};
}
export async function getArchiveDocument(id:string){const db=await authorizedClient("document.read");const r=await db.from("document_register").select("*").eq("id",z.uuid().parse(id)).maybeSingle();checkDatabase(r.error);return r.data as ArchiveDocument|null;}
export async function getInvoiceDocuments(invoiceId: string) {
  const db = await authorizedClient("document.read");
  const id = z.uuid().parse(invoiceId);

  const result = await db
    .from("document_register")
    .select("*")
    .contains("invoice_ids", [id])
    .is("archived_at", null)
    .order("document_date", {
      ascending: false,
      nullsFirst: false,
    })
    .order("created_at", {
      ascending: false,
    });

  checkDatabase(
    result.error,
    "Lettura documenti collegati alla fattura"
  );

  return (result.data ?? []) as ArchiveDocument[];
}
export async function getDocumentVersions(id:string){const db=await authorizedClient("document.read");return await readAll((a,b)=>db.from("document_versions").select("*").eq("document_id",z.uuid().parse(id)).order("version_number",{ascending:false}).range(a,b)) as DocumentVersion[];}
export async function signedDocumentVersion(id:string,download=false){
 return createVersionSignedUrl(await authorizedClient("document.read"),z.uuid().parse(id),download);
}
export async function findDocumentDuplicates(hash:string){
 const db=await authorizedClient("document.read");
 const versions=await readAll((a,b)=>db.from("document_versions").select("document_id").eq("content_hash",hash).eq("file_state","ready").order("id").range(a,b));
 const ids=[...new Set(versions.map(v=>String(v.document_id)))];if(!ids.length)return [];
 const result:ArchiveDocument[]=[];for(let i=0;i<ids.length;i+=100){const r=await db.from("document_register").select("*").in("id",ids.slice(i,i+100));checkDatabase(r.error);result.push(...(r.data??[]) as ArchiveDocument[]);}return result;
}
export async function documentOptions(){
 const db=await authorizedClient("document.read");const [categories,entities,projects,companies,invoices,profiles]=await Promise.all([
 readAll((a,b)=>db.from("document_categories").select("id,code,name,parent_id,active").order("sort_order").order("code").range(a,b)),
readAll((a,b)=>
  db
    .from("legal_entities")
    .select("id,business_name,country")
    .eq("active",true)
    .order("business_name")
    .range(a,b)
),
 readAll((a,b)=>db.from("projects").select("id,project_code,legal_entity_id").is("archived_at",null).order("project_code").range(a,b)),
 readAll((a,b)=>db.from("companies").select("id,business_name").is("archived_at",null).order("business_name").range(a,b)),
 readAll((a,b)=>db.from("invoices").select("id,invoice_number,legal_entity_id").is("archived_at",null).order("invoice_number").range(a,b)),db.rpc("profile_directory")]);checkDatabase(profiles.error);
 return {categories,entities,projects,companies,invoices,profiles:(profiles.data??[]) as {id:string;first_name:string;last_name:string}[]};
}
export async function getDocumentEvents(id:string){const db=await authorizedClient("document.read");const r=await db.rpc("document_events",{doc:z.uuid().parse(id)});checkDatabase(r.error);return (r.data??[]) as {id:string;user_id:string;action:string;created_at:string;entity_type:string}[];}
