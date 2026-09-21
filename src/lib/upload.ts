"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorizedClient } from "@/lib/permissions";
import { AppError,checkDatabase,publicError } from "@/lib/errors";
import { documentFormSchema,documentContextSchema } from "@/lib/document-validation";
import { documentHash,validateDocumentFile } from "@/lib/files";
import { findDocumentDuplicates,getArchiveDocument } from "@/lib/documents";
import { uploadDocumentFile } from "@/lib/document-upload-workflow";
import { z } from "zod";
export type UploadState={error?:string;duplicates?:{id:string;title:string;where:string;archived:boolean}[]};
function refreshDocuments(){revalidatePath("/ordini","layout");revalidatePath("/ddt","layout");revalidatePath("/documenti","layout");revalidatePath("/scadenze","layout");revalidatePath("/dashboard");revalidatePath("/commesse","layout");revalidatePath("/clienti","layout");revalidatePath("/fornitori","layout");revalidatePath("/fatture","layout");}
export async function uploadDocumentAction(_previous:UploadState,form:FormData):Promise<UploadState>{
 let target="";
 try{
 const db=await authorizedClient("document.upload"),context=documentContextSchema.parse(Object.fromEntries(form));
 const cycle={order:form.get("order")?z.uuid().parse(form.get("order")):null,delivery_note:form.get("delivery_note")?z.uuid().parse(form.get("delivery_note")):null,employee:form.get("employee")?z.uuid().parse(form.get("employee")):null};
 const pipeline={offer:form.get("offer")?z.uuid().parse(form.get("offer")):null,contract:form.get("contract")?z.uuid().parse(form.get("contract")):null};
 const docId=form.get("document_id")?z.uuid().parse(form.get("document_id")):undefined;
 const metadata=docId?await getArchiveDocument(docId):documentFormSchema.parse(Object.fromEntries(form));
 if(!metadata)throw new AppError("validation","Documento non disponibile.");
 if(form.get("intent")?.toString().startsWith("reuse:")){
 if(docId)throw new AppError("validation","Per una versione usa il caricamento con conferma.");
 target=z.uuid().parse(String(form.get("intent")).slice(6));
 const result=await db.rpc("link_document_context",{doc:target,...context});checkDatabase(result.error,"Collegamento documento esistente");
 for(const kind of ["order","delivery_note"] as const){if(cycle[kind]){const linked=await db.rpc("link_commercial_document",{doc:target,kind,record_id:cycle[kind]});checkDatabase(linked.error);}}
 for(const kind of ["offer","contract"] as const){if(pipeline[kind]){const linked=await db.rpc(kind==="offer"?"link_offer_document":"link_contract_document",{doc:target,[kind]:pipeline[kind]});checkDatabase(linked.error);}}
 if(cycle.employee){const linked=await db.rpc("link_employee_document",{doc:target,employee:cycle.employee});checkDatabase(linked.error,"Collegamento dipendente");}
 }else{
 const file=form.get("file");if(!(file instanceof File))throw new AppError("validation","Seleziona un file.");await validateDocumentFile(file);
 const duplicates=await findDocumentDuplicates(await documentHash(file));
 if(duplicates.length&&form.get("acknowledge_duplicate")!=="1")return {duplicates:duplicates.map(d=>({id:d.id,title:d.title||d.original_filename,where:[d.entity_name,...d.projects.map(x=>x.label),...d.companies.map(x=>x.label),...d.invoices.map(x=>x.label)].filter(Boolean).join(" · "),archived:!!d.archived_at}))};
 let typeName="Documento";if(metadata.category_id){const c=await db.from("document_categories").select("name").eq("id",metadata.category_id).single();checkDatabase(c.error);typeName=c.data?.name||typeName;}
 const result=await uploadDocumentFile(db,file,{...metadata},{documentId:docId,label:String(form.get("version_label")||""),notes:String(form.get("version_notes")||""),acknowledgeDuplicate:form.get("acknowledge_duplicate")==="1",typeName,...context,...cycle,...pipeline});target=result.documentId;
 }
 }catch(e){return {error:publicError(e).message};}
 refreshDocuments();redirect(`/documenti/${target}?success=Documento%20salvato`);
}
async function mutateDocument(form:FormData,work:(id:string)=>Promise<void>){
 let id="";try{id=z.uuid().parse(form.get("id"));await work(id);}catch(e){redirect(`/documenti?error=${encodeURIComponent(publicError(e).message)}`);}
 refreshDocuments();redirect(`/documenti/${id}?success=Operazione%20completata`);
}
export async function updateDocumentAction(form:FormData){return mutateDocument(form,async id=>{const db=await authorizedClient("document.update");const schema=form.get("intent")==="notes"?documentFormSchema.pick({notes:true,expected_updated_at:true}):documentFormSchema;const payload=schema.parse(Object.fromEntries(form));const r=await db.rpc("save_document_metadata",{doc:id,payload});checkDatabase(r.error,"Aggiornamento metadata");});}
export async function deleteDocumentAction(form:FormData){return mutateDocument(form,async id=>{const db=await authorizedClient("document.delete");const r=await db.rpc("set_document_archive",{doc:id,archived:true});checkDatabase(r.error);});}
export async function restoreDocumentAction(form:FormData){return mutateDocument(form,async id=>{const db=await authorizedClient("document.delete");const r=await db.rpc("set_document_archive",{doc:id,archived:false});checkDatabase(r.error);});}
export async function linkDocumentAction(form:FormData){return mutateDocument(form,async id=>{const db=await authorizedClient("document.update");const r=await db.rpc("link_document_context",{doc:id,...documentContextSchema.parse(Object.fromEntries(form))});checkDatabase(r.error);});}
export async function finalizeDocumentAction(form:FormData){return mutateDocument(form,async id=>{const db=await authorizedClient("document.upload"),version=z.uuid().parse(form.get("version"));const r=await db.from("document_versions").select("id").eq("id",version).eq("document_id",id).single();checkDatabase(r.error);const result=await db.rpc("finalize_document_version",{version,acknowledge_duplicate:form.get("acknowledge_duplicate")==="1"});checkDatabase(result.error,"Finalizzazione versione");});}
