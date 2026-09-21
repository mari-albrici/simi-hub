import { cache } from "react";
import { authorizedClient, requirePermission } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { getProfileDirectory, getLegalEntities } from "@/lib/data";
import { hasPermission } from "@/lib/auth";
import { registrySource, pageNumber, type SourceKind, type Registry, type LinkedRecord, type Task, type Anomaly, type WorkFilters } from "./model";
import type { PermissionName } from "@/types";

const sources:Record<SourceKind,{table:string;fields:string;search:string;permission:PermissionName;route:string}>={
 project:{table:"projects",fields:"id,project_code,name,legal_entity_id",search:"project_code",permission:"project.read",route:"commesse"},
 invoice:{table:"invoices",fields:"id,invoice_number,legal_entity_id",search:"invoice_number",permission:"invoice.read",route:"fatture"},
 movement:{table:"financial_movements",fields:"id,reference,movement_date,legal_entity_id",search:"reference",permission:"invoice.read",route:"pagamenti"},
 document:{table:"documents",fields:"id,title,original_filename,legal_entity_id",search:"title",permission:"document.read",route:"documenti"},
 order:{table:"orders",fields:"id,order_number,legal_entity_id",search:"order_number",permission:"order.read",route:"ordini"},
 delivery_note:{table:"delivery_notes",fields:"id,note_number,legal_entity_id",search:"note_number",permission:"delivery_note.read",route:"ddt"},
 offer:{table:"offers",fields:"id,offer_number,legal_entity_id",search:"offer_number",permission:"offer.read",route:"offerte"},
 contract:{table:"contracts",fields:"id,reference,title,legal_entity_id",search:"reference",permission:"contract.read",route:"contratti"},
 company:{table:"companies",fields:"id,business_name,company_type",search:"business_name",permission:"company.read",route:"clienti"},
 employee:{table:"employees",fields:"id,first_name,last_name,legal_entity_id",search:"last_name",permission:"employee.hr.read",route:"personale"},
 deadline:{table:"deadlines",fields:"id,title,legal_entity_id,employee_id,document_id,invoice_id",search:"title",permission:"deadline.read",route:"scadenze"},
 installment:{table:"invoice_installments",fields:"id,invoice_id,due_date",search:"id",permission:"invoice.read",route:"fatture"},
};
export const syncAnomalies=cache(async()=>{const db=await authorizedClient("anomaly.read");const r=await db.rpc("sync_anomalies");checkDatabase(r.error,"Aggiornamento anomalie");});
function sourceLink(kind:SourceKind,row:Record<string,unknown>):LinkedRecord{
 const s=sources[kind],id=String(row.id);let href=`/${s.route}/${id}`;
 if(kind==="company")href=`/${row.company_type==="supplier"?"fornitori":"clienti"}/${id}`;
 if(kind==="movement")href=`/pagamenti?movement=${id}`;
 if(kind==="installment")href=`/fatture/${row.invoice_id}#rata-${id}`;
 const label=kind==="employee"?[row.first_name,row.last_name].filter(Boolean).join(" "):kind==="installment"?`Rata ${row.due_date}`:String(row[s.search]||row.title||row.original_filename||row.movement_date||id);
 return {kind,id,label,href,entityId:row.legal_entity_id?String(row.legal_entity_id):null};
}
export async function findSources(kind:SourceKind,query="",id?:string):Promise<LinkedRecord[]>{
 const user=await requirePermission("task.read"),s=sources[kind];if(!hasPermission(user.role,s.permission))return [];
 const db=await authorizedClient(s.permission);let q=db.from(s.table).select(s.fields);
 if(id)q=q.eq("id",id);else if(query&&s.search!=="id")q=q.ilike(s.search,`%${query.replace(/[%,_]/g,"")}%`);
 if(kind==="deadline"&&!hasPermission(user.role,"employee.hr.read"))q=q.is("employee_id",null);
 const r=await q.order("id").limit(30);checkDatabase(r.error);
 const result:LinkedRecord[]=[];
 for(const row of (r.data??[]) as unknown as Record<string,unknown>[]){
  if(kind==="deadline"){
   if(row.invoice_id&&!hasPermission(user.role,"invoice.read"))continue;
   if(row.document_id){const visible=await db.rpc("document_visible",{doc:row.document_id});checkDatabase(visible.error);if(!visible.data)continue;}
  }
  result.push(sourceLink(kind,row));
 }
 return result;
}
export const resolveRegistry=cache(async(record:Registry):Promise<LinkedRecord|null>=>{const s=registrySource(record);return s?(await findSources(s.kind,"",s.id))[0]??null:null;});
export const workMetadata=cache(async()=>{const user=await requirePermission("task.read");const [profiles,entities]=await Promise.all([getProfileDirectory(),getLegalEntities()]);return {user,profiles,entities,kinds:(Object.keys(sources) as SourceKind[]).filter(k=>hasPermission(user.role,sources[k].permission))};});
export async function getTasks(p:WorkFilters={}){
 const user=await requirePermission("task.read"),db=await authorizedClient("task.read");const page=pageNumber(p.page),today=new Date().toISOString().slice(0,10);
 let q=db.from("tasks").select(p.record_type?"*,task_records(work_records(*)),matching:task_records!inner(work_records!inner(*))":"*,task_records(work_records(*))",{count:"exact"});
 q=p.archived==="1"?q.not("archived_at","is",null):q.is("archived_at",null);
 if(p.q)q=q.ilike("title",`%${p.q.replace(/[%,_]/g,"")}%`);
 if(p.status)q=q.eq("status",p.status);else if(p.completed!=="1")q=q.in("status",["todo","in_progress"]);
 if(p.priority)q=q.eq("priority",p.priority);
 if(p.assigned)q=q.eq("assigned_to",p.assigned);
 if(p.origin)q=q.eq("origin",p.origin);
 if(p.entity)q=q.eq("legal_entity_id",p.entity);
 if(p.view==="mine")q=q.eq("assigned_to",user.id);
 if(p.view==="today")q=q.eq("due_date",today);
 if(p.view==="overdue")q=q.lt("due_date",today);
 if(p.view==="upcoming"){const end=new Date();end.setUTCDate(end.getUTCDate()+7);q=q.gt("due_date",today).lte("due_date",end.toISOString().slice(0,10));}
 if(p.from)q=q.gte("due_date",p.from);if(p.to)q=q.lte("due_date",p.to);
 if(p.record_type){
  q=q.not(`matching.work_records.${p.record_type}_id`,"is",null);
  if(p.record_id)q=q.eq(`matching.work_records.${p.record_type}_id`,p.record_id);
 }
 const r=await q.order("due_date",{nullsFirst:false}).order("created_at",{ascending:false}).order("id").range((page-1)*50,page*50-1);checkDatabase(r.error);
 const rows=await Promise.all(((r.data??[]) as unknown as Task[]).map(async t=>({...t,links:(await Promise.all(t.task_records.map(l=>resolveRegistry(l.work_records)))).filter((l):l is LinkedRecord=>!!l)})));
 return {rows,count:r.count??0,page};
}
export async function getTask(id:string){const db=await authorizedClient("task.read");const r=await db.from("tasks").select("*,task_records(work_records(*))").eq("id",id).maybeSingle();checkDatabase(r.error);if(!r.data)return null;const t=r.data as Task;return {...t,links:(await Promise.all(t.task_records.map(l=>resolveRegistry(l.work_records)))).filter((l):l is LinkedRecord=>!!l)};}
export async function getAnomalies(p:WorkFilters={}){
 await syncAnomalies();const user=await requirePermission("anomaly.read"),db=await authorizedClient("anomaly.read"),page=pageNumber(p.page);
 let q=db.from("anomalies").select(p.record_type?"*,work_records!inner(*)":"*,work_records(*)",{count:"exact"}).eq("status",p.view==="resolved"?"resolved":p.view==="ignored"?"ignored":"open");
 if(p.record_type&&p.record_source)q=q.eq(`work_records.${p.record_type}_id`,p.record_source);
 if(p.view==="critical")q=q.eq("severity","critical");if(p.view==="mine")q=q.eq("assigned_to",user.id);
 if(p.q)q=q.ilike("title",`%${p.q.replace(/[%,_]/g,"")}%`);if(p.severity)q=q.eq("severity",p.severity);if(p.assigned)q=q.eq("assigned_to",p.assigned);if(p.code)q=q.eq("code",p.code);
 const r=await q.order("detected_at",{ascending:false}).order("id").range((page-1)*50,page*50-1);checkDatabase(r.error);
 return {rows:await Promise.all(((r.data??[]) as unknown as Anomaly[]).map(async a=>({...a,link:await resolveRegistry(a.work_records)}))),count:r.count??0,page};
}
export async function getAnomaly(id:string){await syncAnomalies();const db=await authorizedClient("anomaly.read");const r=await db.from("anomalies").select("*,work_records(*)").eq("id",id).maybeSingle();checkDatabase(r.error);return r.data?{...r.data,link:await resolveRegistry(r.data.work_records)} as Anomaly:null;}
