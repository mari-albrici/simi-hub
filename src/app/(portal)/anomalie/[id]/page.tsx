import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "@/components/ui/app-link";
import { getAnomaly, workMetadata } from "@/lib/work/data";
import { requirePagePermission, authorizedClient } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { checkDatabase } from "@/lib/errors";
import { StatusBadge } from "@/components/ui/status-badge";
import { RecordLink } from "@/components/work/lists";
import { AnomalyActionForm } from "@/components/work/anomaly-actions";
import { formatDateTime } from "@/lib/formatters";
export default async function AnomalyDetail({params}:{params:Promise<{id:string}>}){
 const user=await requirePagePermission("anomaly.read"),id=z.string().uuid().parse((await params).id),a=await getAnomaly(id);if(!a)notFound();const meta=await workMetadata();
 const db=await authorizedClient("task.read"),tasks=await db.from("tasks").select("id,title,status").eq("anomaly_id",id).order("created_at");checkDatabase(tasks.error);
 return <><Link href="/anomalie">Anomalie</Link><div className="d-flex gap-3 align-items-center flex-wrap my-3"><h1 className="h3 mb-0">{a.title}</h1><StatusBadge domain="severity" status={a.severity}/><StatusBadge domain="anomaly" status={a.status}/></div>
 <div className="app-card p-3"><p>{a.description}</p><p><RecordLink record={a.link}/></p><dl className="row"><dt className="col-md-3">Prima rilevazione</dt><dd className="col-md-9">{formatDateTime(a.detected_at)}</dd><dt className="col-md-3">Ultima rilevazione</dt><dd className="col-md-9">{formatDateTime(a.last_detected_at)}</dd>{a.resolved_at&&<><dt className="col-md-3">Risoluzione rilevata</dt><dd className="col-md-9">{formatDateTime(a.resolved_at)}</dd></>}</dl>{a.reason&&<p>Motivazione: {a.reason}</p>}
 {hasPermission(user.role,"anomaly.assign")&&<AnomalyActionForm id={id} operation="assign" assigned={a.assigned_to} profiles={meta.profiles}/>}
 {a.status==="open"&&hasPermission(user.role,"anomaly.ignore")&&<AnomalyActionForm id={id} operation="ignore"/>}
 {a.status==="ignored"&&hasPermission(user.role,"anomaly.update")&&<AnomalyActionForm id={id} operation="reopen"/>}
 <p className="small text-muted mb-0">La risoluzione dipende dal record sorgente. Regola: {a.code}</p></div>
 <div className="app-card p-3 mt-3"><div className="d-flex justify-content-between"><h2 className="h5">Attività collegate</h2>{hasPermission(user.role,"task.create")&&<Link className="btn btn-primary" href={`/attivita/new?anomaly=${id}`}>Crea attività</Link>}</div>{(tasks.data??[]).map(t=><p key={t.id}><Link href={`/attivita/${t.id}`}>{t.title}</Link> <StatusBadge domain="task" status={t.status}/></p>)}{!tasks.data?.length&&<p className="text-muted mb-0">Nessuna attività collegata.</p>}</div></>;
}
