import Link from "@/components/ui/app-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/formatters";
import type { getWorkDashboard } from "@/lib/work/dashboard";
export function WorkAttention({data}:{data:Awaited<ReturnType<typeof getWorkDashboard>>}){
 return <>{!data.tasks.length&&!data.anomalies.length?<p className="text-muted">Nessuna attività o anomalia richiede attenzione.</p>:<div className="table-responsive"><table className="table table-admin align-middle mb-0"><thead><tr><th>Da seguire</th><th>Tipo</th><th>Scadenza</th><th>Priorità / Severità</th><th>Stato</th></tr></thead><tbody>{data.tasks.map(t=><tr key={t.id}><td className="col-description"><Link href={`/attivita/${t.id}`}>{t.title}</Link></td><td>Attività</td><td className="col-date">{formatDate(t.due_date)}</td><td><StatusBadge domain="priority" status={t.priority}/></td><td><StatusBadge domain="task" status={t.status}/></td></tr>)}{data.anomalies.map(a=><tr key={a.id}><td className="col-description"><Link href={`/anomalie/${a.id}`}>{a.title}</Link></td><td>Anomalia</td><td className="col-date">{formatDate(a.due_date)}</td><td><StatusBadge domain="severity" status={a.severity}/></td><td><StatusBadge domain="anomaly" status={a.status}/></td></tr>)}</tbody></table></div>}</>;
}
