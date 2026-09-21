"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authorizedClient } from "@/lib/permissions";
import { checkDatabase, publicError } from "@/lib/errors";
import { taskSchema, sourceKinds } from "./model";
import { findSources } from "./data";

export type WorkActionState={error:string|null};
function refreshWork(){for(const p of ["/attivita","/anomalie","/dashboard"])revalidatePath(p,"layout");}
export async function saveTaskAction(_previous:WorkActionState,form:FormData):Promise<WorkActionState>{
 let id:string;
 try{
  const payload=taskSchema.parse({...Object.fromEntries(form),records:JSON.parse(String(form.get("records")||"[]"))});
  const db=await authorizedClient(payload.id?"task.update":"task.create");const r=await db.rpc("save_task",{payload});checkDatabase(r.error,"Salvataggio attività");id=String(r.data);refreshWork();
 }catch(e){return {error:publicError(e).message};}
 redirect(`/attivita/${id}?success=Attività%20salvata`);
}
export async function searchWorkSources(kind:string,query:string){
 try{return {records:await findSources(z.enum(sourceKinds).parse(kind),z.string().max(200).parse(query)),error:null};}
 catch(e){return {records:[],error:publicError(e).message};}
}
export async function archiveTaskAction(form:FormData){
 let error:string|null=null;const id=z.string().uuid().parse(form.get("id"));
 try{const db=await authorizedClient("task.archive");const r=await db.rpc("archive_task",{task:id,archived:form.get("archived")==="1"});checkDatabase(r.error);refreshWork();}catch(e){error=publicError(e).message;}
 redirect(`/attivita/${id}?${error?"error="+encodeURIComponent(error):"success=Attività%20aggiornata"}`);
}
export async function updateAnomalyAction(_previous:WorkActionState,form:FormData):Promise<WorkActionState>{
 let id:string;
 try{id=z.string().uuid().parse(form.get("id"));const operation=z.enum(["assign","ignore","reopen"]).parse(form.get("operation"));
 const db=await authorizedClient(operation==="assign"?"anomaly.assign":operation==="ignore"?"anomaly.ignore":"anomaly.update");
 const motivation=String(form.get("motivation")||"").trim();if(operation==="ignore")z.string().min(1,"Motivazione obbligatoria").max(4000).parse(motivation);
 const r=await db.rpc("update_anomaly",{anomaly:id,operation,assignee:form.get("assigned_to")||null,motivation});checkDatabase(r.error);refreshWork();
 }catch(e){return {error:publicError(e).message};}
 redirect(`/anomalie/${id}?success=Anomalia%20aggiornata`);
}
export async function projectRequirementAction(form:FormData){
 const id=z.string().uuid().parse(form.get("id"));let error:string|null=null;
 try{const db=await authorizedClient("invoice.update");const r=await db.rpc("set_invoice_project_required",{invoice:id,required:form.get("required")==="1"});checkDatabase(r.error);refreshWork();revalidatePath(`/fatture/${id}`);}catch(e){error=publicError(e).message;}
 redirect(`/fatture/${id}?${error?"error="+encodeURIComponent(error):"success=Requisito%20aggiornato"}`);
}
