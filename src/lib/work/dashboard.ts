import { authorizedClient, requirePermission } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { getTasks, getAnomalies, syncAnomalies } from "./data";
import type { Task,Anomaly } from "./model";
export async function getWorkDashboard(){
 const user=await requirePermission("task.read"),db=await authorizedClient("task.read");await syncAnomalies();
 const today=new Date().toISOString().slice(0,10);
 const [mine,urgent,anomalies,critical,taskCount,anomalyCount]=await Promise.all([
 db.from("tasks").select("id,title,status,priority,due_date").is("archived_at",null).in("status",["todo","in_progress"]).eq("assigned_to",user.id).lte("due_date",today).order("due_date").order("id").limit(5),
 db.from("tasks").select("id,title,status,priority,due_date").is("archived_at",null).in("status",["todo","in_progress"]).eq("priority","urgent").order("due_date",{nullsFirst:false}).order("id").limit(3),
 db.from("anomalies").select("id,title,status,severity,due_date").eq("status","open").order("detected_at",{ascending:false}).order("id").limit(4),
 db.from("anomalies").select("id,title,status,severity,due_date").eq("status","open").eq("severity","critical").order("detected_at",{ascending:false}).order("id").limit(4),
 getTasks({view:"mine"},true),
 getAnomalies({view:"open"},true),
 ]);for(const r of [mine,urgent,anomalies,critical])checkDatabase(r.error);
 return {tasks:[...new Map([...(mine.data??[]),...(urgent.data??[])].map(t=>[t.id,t])).values()] as Pick<Task,"id"|"title"|"status"|"priority"|"due_date">[],anomalies:[...new Map([...(critical.data??[]),...(anomalies.data??[])].map(a=>[a.id,a])).values()].slice(0,4) as Pick<Anomaly,"id"|"title"|"status"|"severity"|"due_date">[],taskCount:taskCount.count,anomalyCount:anomalyCount.count};
}
