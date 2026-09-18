"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authorizedClient } from "./permissions";
import { AppError,checkDatabase,publicError } from "./errors";
import { orderFormSchema,deliveryFormSchema,commercialKind,commercialPath } from "./commercial-validation";
import { compatibleOrders } from "./commercial";
import { z } from "zod";
export type CommercialState={error?:string};
function refresh(){for(const path of ["/ordini","/ddt","/fatture","/commesse","/documenti","/clienti","/fornitori"])revalidatePath(path,"layout");}
export async function saveCommercialAction(_state:CommercialState,form:FormData):Promise<CommercialState>{
 let target="";
 try{
 const kind=commercialKind.parse(form.get("kind"));const id=form.get("id");const db=await authorizedClient(`${kind}.${id?"update":"create"}`);
 let lines:unknown;try{lines=JSON.parse(String(form.get("lines_json")));}catch{throw new AppError("validation","Righe non valide.");}
 const values={...Object.fromEntries(form),lines,project_ids:form.getAll("project_ids"),order_ids:form.getAll("order_ids")};
 const payload=(kind==="order"?orderFormSchema:deliveryFormSchema).parse(values);
 const result=await db.rpc(kind==="order"?"save_order":"save_delivery_note",{payload});checkDatabase(result.error,"Salvataggio ciclo documentale");
 target=`${commercialPath(kind)}/${z.uuid().parse(result.data)}`;
 }catch(e){return {error:publicError(e).message};}
 refresh();redirect(`${target}?success=Modifiche%20salvate`);
}
export async function loadCompatibleOrders(params:{entity:string;party:string;direction:string;note?:string}){return compatibleOrders(params);}
export async function commercialRelationAction(form:FormData){
 const kind=commercialKind.parse(form.get("kind")),id=z.uuid().parse(form.get("record_id"));
 const invoice=z.uuid().safeParse(form.get("invoice_id"));
 const path=form.get("return_invoice")==="1"&&invoice.success?`/fatture/${invoice.data}`:`${commercialPath(kind)}/${id}`;
 try{
 const db=await authorizedClient(`${kind}.update`);
 let r;
 if(form.get("operation")==="document")r=await db.rpc("link_commercial_document",{doc:z.uuid().parse(form.get("document_id")),kind,record_id:id});
 else if(form.get("operation")==="line")r=await db.rpc("set_commercial_invoice_line",{payload:{invoice_line_id:z.uuid().parse(form.get("invoice_line_id")),order_line_id:form.get("order_line_id")||null,delivery_note_line_id:form.get("delivery_note_line_id")||null,quantity:z.coerce.number().positive().parse(form.get("quantity"))}});
 else if(form.get("operation")==="unlink_line")r=await db.rpc("set_commercial_invoice_line",{payload:{id:z.uuid().parse(form.get("allocation_id"))}});
 else r=await db.rpc("set_commercial_invoice",{kind,record_id:id,invoice:z.uuid().parse(form.get("invoice_id")),linked:form.get("operation")!=="unlink",amount:form.get("amount")?z.coerce.number().nonnegative().parse(form.get("amount")):null});
 checkDatabase(r.error,"Collegamento");
 }catch(e){redirect(`${path}?error=${encodeURIComponent(publicError(e).message)}`);}
 refresh();redirect(`${path}?success=Collegamento%20aggiornato`);
}
export async function archiveCommercialAction(form:FormData){
 const kind=commercialKind.parse(form.get("kind")),id=z.uuid().parse(form.get("record_id"));
 try{const db=await authorizedClient(`${kind}.delete`);const r=await db.rpc(kind==="order"?"archive_order":"archive_delivery_note",kind==="order"?{order_id:id}:{note_id:id});checkDatabase(r.error);}catch(e){redirect(`${commercialPath(kind)}/${id}?error=${encodeURIComponent(publicError(e).message)}`);}
 refresh();redirect(`${commercialPath(kind)}/${id}?success=Record%20archiviato`);
}
