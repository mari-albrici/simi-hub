import { authorizedClient } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { z } from "zod";
import type { CommercialKind } from "./commercial-validation";
export type CommercialLine={id?:string;position:number;description:string;quantity:number;unit:string|null;project_id:string|null;notes:string|null;unit_price?:number;discount?:number;vat_rate?:number|null;amount_total?:number;order_line_id?:string|null;delivered_quantity?:number;remaining_quantity?:number};
export type CommercialRecord={id:string;updated_at:string;archived_at:string|null;legal_entity_id:string;counterparty_id:string|null;order_number?:string;note_number?:string;order_type?:string;direction?:string;order_date?:string;note_date?:string;status?:string;currency?:string;counterparty_reference?:string|null;subject?:string|null;description?:string|null;notes:string|null;sender_id?:string|null;recipient_id?:string|null;departure_place?:string|null;destination_place?:string|null;transport_reason?:string|null;carrier?:string|null;project_ids:string[];order_ids:string[];lines:CommercialLine[]};
export async function getCommercial(kind:CommercialKind,id:string){
 const db=await authorizedClient(`${kind}.read`),key=kind==="order"?"order_id":"delivery_note_id";z.uuid().parse(id);
 const results=await Promise.all([db.from(kind==="order"?"orders":"delivery_notes").select("*").eq("id",id).maybeSingle(),db.from(kind==="order"?"order_line_progress":"delivery_note_lines").select("*").eq(key,id).order("position"),db.from(kind==="order"?"order_projects":"delivery_note_projects").select("project_id").eq(key,id),kind==="delivery_note"?db.from("delivery_note_orders").select("order_id").eq(key,id):Promise.resolve({data:[],error:null})]);
 results.forEach(r=>checkDatabase(r.error));if(!results[0].data)return null;
 return {...results[0].data,lines:results[1].data??[],project_ids:(results[2].data??[]).map(p=>p.project_id),order_ids:(results[3].data??[]).map(o=>o.order_id)} as CommercialRecord;
}
export async function commercialOptions(){
 const db=await authorizedClient("project.read");const [companies,entities,projects]=await Promise.all([
 readAll((a,b)=>db.from("companies").select("id,business_name,company_type").is("archived_at",null).eq("active",true).order("business_name").range(a,b)),
 readAll((a,b)=>db.from("legal_entities").select("id,business_name,code").eq("active",true).order("business_name").range(a,b)),
 readAll((a,b)=>db.from("projects").select("id,project_code,legal_entity_id").is("archived_at",null).order("project_code").range(a,b))]);return {companies,entities,projects};
}
export type CommercialOptions=Awaited<ReturnType<typeof commercialOptions>>;
export type OrderChoice={id:string;order_number:string;order_date:string;counterparty_id:string;counterparty_name:string;legal_entity_id:string;order_type:string;status:string;lines:CommercialLine[]};
export async function compatibleOrders(params:{entity:string;party:string;direction:string;note?:string}){
 const db=await authorizedClient("order.read");z.uuid().parse(params.entity);z.uuid().parse(params.party);
 const orders=await readAll((a,b)=>db.from("orders").select("id,order_number,order_date,counterparty_id,legal_entity_id,order_type,status").eq("legal_entity_id",params.entity).eq("counterparty_id",params.party).eq("order_type",params.direction==="inbound"?"purchase":"sale").is("archived_at",null).not("status","in","(draft,cancelled)").order("order_date",{ascending:false}).order("id").range(a,b));
 const ids=orders.map(o=>o.id);const lines:CommercialLine[]=[];
 for(let i=0;i<ids.length;i+=100){const r=await readAll((a,b)=>db.from("order_line_progress").select("*").in("order_id",ids.slice(i,i+100)).order("id").range(a,b));lines.push(...r as (CommercialLine&{order_id:string})[]);}
 const party=await db.from("companies").select("business_name").eq("id",params.party).maybeSingle();checkDatabase(party.error);
 // During edit, quantities on this DDT are returned to the selectable residual.
 const own=params.note?await db.from("delivery_note_lines").select("order_line_id,quantity").eq("delivery_note_id",z.uuid().parse(params.note)):{data:[],error:null};checkDatabase(own.error);
 const quantities=new Map<string,number>();for(const l of own.data??[])if(l.order_line_id)quantities.set(l.order_line_id,(quantities.get(l.order_line_id)??0)+Number(l.quantity));
 return orders.map(o=>({...o,counterparty_name:party.data?.business_name??"",lines:(lines as (CommercialLine&{order_id:string})[]).filter(l=>l.order_id===o.id).map(l=>({...l,delivered_quantity:Number(l.delivered_quantity)-(quantities.get(l.id!)??0),remaining_quantity:Number(l.remaining_quantity)+(quantities.get(l.id!)??0)}))})) as OrderChoice[];
}
