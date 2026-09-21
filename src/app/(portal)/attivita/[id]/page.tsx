import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "@/components/ui/app-link";
import { TaskForm } from "@/components/work/task-form";
import { RecordLink } from "@/components/work/lists";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { getTask, workMetadata } from "@/lib/work/data";
import { archiveTaskAction } from "@/lib/work/actions";
import { requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { formatDateTime,formatDate } from "@/lib/formatters";
export default async function TaskDetail({params}:{params:Promise<{id:string}>}){
 const user=await requirePagePermission("task.read"),id=z.string().uuid().parse((await params).id),task=await getTask(id);if(!task)notFound();const meta=await workMetadata();
 const creator=meta.profiles.find(p=>p.id===task.created_by);
 return <><Link href="/attivita">Attività</Link><div className="d-flex gap-3 align-items-center my-3"><h1 className="h3 mb-0">{task.title}</h1><StatusBadge domain="task" status={task.status}/>{task.archived_at&&<span className="badge text-bg-secondary">Archiviata</span>}</div>
 <p className="small text-muted">Creata da {creator?`${creator.first_name} ${creator.last_name}`:"Utente"} · {formatDateTime(task.created_at)}{task.completed_at&&` · Completata ${formatDateTime(task.completed_at)}`}</p>
 {task.anomaly_id&&<p>Origine: <Link href={`/anomalie/${task.anomaly_id}`}>anomalia collegata</Link></p>}
 {hasPermission(user.role,"task.update")&&!task.archived_at?<TaskForm task={task} entities={meta.entities} profiles={meta.profiles} kinds={meta.kinds} userId={user.id} canAssign={hasPermission(user.role,"task.assign")}/>:<div className="app-card p-3"><p>{task.description}</p><p>Scadenza: {formatDate(task.due_date)} · <StatusBadge domain="priority" status={task.priority}/></p><p>{task.notes}</p>{task.links.map(l=><p key={`${l.kind}:${l.id}`}><RecordLink record={l}/></p>)}</div>}
 {hasPermission(user.role,"task.archive")&&<form action={archiveTaskAction} className="mt-3"><input type="hidden" name="id" value={id}/><input type="hidden" name="archived" value={task.archived_at?"0":"1"}/><ConfirmSubmitButton confirmMessage={task.archived_at?"Ripristinare l’attività?":"Archiviare l’attività?"}>{task.archived_at?"Ripristina":"Archivia"}</ConfirmSubmitButton></form>}</>;
}
