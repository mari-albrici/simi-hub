import Link from "@/components/ui/app-link";
import { getSessionUser } from "@/lib/session";
import { hasPermission } from "@/lib/auth";
import { getTasks, getAnomalies } from "@/lib/work/data";
import { sourceLabels, type SourceKind } from "@/lib/work/model";
import { StatusBadge } from "@/components/ui/status-badge";
export async function CreateTaskLink({kind,id,className="btn btn-sm btn-outline-secondary"}:{kind:SourceKind;id:string;className?:string}){
 const user=await getSessionUser();if(!user||!hasPermission(user.role,"task.create"))return null;
 return <Link className={className} href={`/attivita/new?kind=${kind}&record=${id}`}><i className="bi bi-plus-lg me-1" aria-hidden="true"/>Crea attività</Link>;
}
export async function ContextWork({kind,id}:{kind:SourceKind;id:string}){
 const user=await getSessionUser();if(!user||!hasPermission(user.role,"task.read"))return null;
 const tasks=await getTasks({record_type:kind,record_id:id,view:"all"});
 return <section className="app-card p-3 mb-3"><div className="d-flex gap-2 justify-content-between align-items-center"><h2 className="h5 mb-0">Attività · {sourceLabels[kind]}</h2><CreateTaskLink kind={kind} id={id}/></div>{tasks.rows.slice(0,5).map(t=><div key={t.id} className="d-flex gap-2 mt-2"><Link href={`/attivita/${t.id}`}>{t.title}</Link><StatusBadge domain="task" status={t.status}/></div>)}{!tasks.count&&<p className="text-muted mb-0 mt-2">Nessuna attività aperta.</p>}{tasks.count>5&&<Link href={`/attivita?view=all&record_type=${kind}&record_id=${id}`}>Mostra tutte ({tasks.count})</Link>}</section>;
}

export async function ContextAnomalies({kind,id}:{kind:SourceKind;id:string}){
 const result=await getAnomalies({record_type:kind,record_source:id});
 return <section className="app-card p-3 my-3"><h2 className="h5">Informazioni, attenzioni e anomalie</h2>{result.rows.map(a=><p key={a.id}><StatusBadge domain="severity" status={a.severity}/> <Link href={`/anomalie/${a.id}`}>{a.title}</Link></p>)}{!result.count&&<p className="text-muted mb-0">Nessuna segnalazione operativa aperta.</p>}</section>;
}
