import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePagePermission } from "@/lib/permissions";
import { workMetadata, getAnomaly, findSources } from "@/lib/work/data";
import { sourceKinds, anomalyPriority, type LinkedRecord, type WorkFilters } from "@/lib/work/model";
import { TaskForm } from "@/components/work/task-form";
import { hasPermission } from "@/lib/auth";
import Link from "@/components/ui/app-link";
export default async function NewTask({searchParams}:{searchParams:Promise<WorkFilters>}){
 const user=await requirePagePermission("task.create"),p=await searchParams,meta=await workMetadata();
 const anomaly=p.anomaly?await getAnomaly(z.string().uuid().parse(p.anomaly)):null;if(p.anomaly&&!anomaly)notFound();
 let links:LinkedRecord[]=anomaly?.link?[anomaly.link]:[];
 if(p.kind&&p.record){const kind=z.enum(sourceKinds).parse(p.kind);links=await findSources(kind,"",z.string().uuid().parse(p.record));if(!links.length)notFound();}
 return <><Link href="/attivita">Attività</Link><h1 className="h3 my-3">Nuova attività</h1><TaskForm entities={meta.entities} profiles={meta.profiles} kinds={meta.kinds} userId={user.id} canAssign={hasPermission(user.role,"task.assign")} initial={{title:anomaly?.title,priority:anomaly?anomalyPriority(anomaly.severity):"medium",due_date:anomaly?.due_date??undefined,anomaly_id:anomaly?.id,entityId:links[0]?.entityId??undefined,links}}/></>;
}
