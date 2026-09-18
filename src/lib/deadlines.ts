import { authorizedClient, requirePermission } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { deadlineFilterSchema } from "@/lib/deadline-validation";
export type Deadline = {id:string;source:string;invoice_id:string|null;installment_id:string|null;title:string;description:string|null;due_date:string|null;due_time:string|null;kind:string;legal_entity_id:string;entity_name:string;entity_country:string;company_id:string|null;company_name:string|null;company_type:string|null;document_id:string|null;project_ids:string[];category_code:string;category_name:string;priority:string;assigned_to:string|null;notes:string|null;original_amount:number|null;settled_amount:number|null;residual:number|null;currency:string|null;completed:boolean;temporal_status:string;archived_at:string|null};
export function deadlineHref(d:Deadline){return d.source==="document"&&d.document_id?`/documenti/${d.document_id}`:d.invoice_id?`/fatture/${d.invoice_id}${d.installment_id?`#rata-${d.installment_id}`:""}`:`/scadenze/${d.id.replace("manual:","")}`;}
export async function getDeadlines(params:Record<string,string|undefined>={},all=false){
 const f=deadlineFilterSchema.parse(params),user=await requirePermission("deadline.read"),db=await authorizedClient("deadline.read");
 const today=new Date().toISOString().slice(0,10);
 let query=db.from("operational_deadlines").select("*",{count:"exact"});
 query=f.archived?query.not("archived_at","is",null):query.is("archived_at",null);
 if(f.q)query=query.ilike("search_text",`%${f.q.replace(/[%_\\]/g,"\\$&")}%`);
 for(const [key,value] of [["legal_entity_id",f.entity],["company_id",f.company],["assigned_to",f.mine?user.id:f.assigned],["kind",f.kind],["category_code",f.category],["priority",f.priority]])if(key&&value)query=query.eq(key,value);
 if(f.project)query=query.contains("project_ids",[f.project]);
 if(f.status==="open")query=query.eq("completed",false);else if(f.status)query=query.eq("temporal_status",f.status);
 if(f.period==="overdue")query=query.eq("temporal_status","overdue");
 if(["today","7","30"].includes(f.period)){const end=new Date(`${today}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+(f.period==="today"?0:Number(f.period)));query=query.gte("due_date",today).lte("due_date",end.toISOString().slice(0,10)).eq("completed",false);}
 if(f.from)query=query.gte("due_date",f.from);if(f.to)query=query.lte("due_date",f.to);
 const month=f.month??today.slice(0,7);
 if(f.view==="calendar"){const end=new Date(`${month}-01T00:00:00Z`);end.setUTCMonth(end.getUTCMonth()+1);query=query.gte("due_date",`${month}-01`).lt("due_date",end.toISOString().slice(0,10));}
 query=query.order("due_date",{nullsFirst:false}).order("id");
 if(f.view==="calendar"||all){const rows=await readAll((a,b)=>query.range(a,b));return {rows:rows as Deadline[],count:rows.length,filters:f,month};}
 const result=await query.range((f.page-1)*50,f.page*50-1);checkDatabase(result.error,"Lettura scadenziario");return {rows:(result.data??[]) as Deadline[],count:result.count??0,filters:f,month};
}
export async function deadlineOptions(){
 const db=await authorizedClient("deadline.read");
 const [entities,categories,companies,projects,documents,profiles]=await Promise.all([
 readAll((a,b)=>db.from("legal_entities").select("id,business_name").eq("active",true).order("business_name").range(a,b)),
 readAll((a,b)=>db.from("deadline_categories").select("code,name").order("name").range(a,b)),
 readAll((a,b)=>db.from("companies").select("id,business_name").is("archived_at",null).order("business_name").range(a,b)),
 readAll((a,b)=>db.from("projects").select("id,project_code").is("archived_at",null).order("project_code").range(a,b)),
 readAll((a,b)=>db.from("documents").select("id,title,original_filename").is("archived_at",null).order("id").range(a,b)),db.rpc("profile_directory")]);
 checkDatabase(profiles.error);return {entities,categories,companies,projects,documents,profiles:(profiles.data??[]) as {id:string;first_name:string;last_name:string}[]};
}
