import { requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { getAnomalies, workMetadata } from "@/lib/work/data";
import { type WorkFilters } from "@/lib/work/model";
import { WorkTabs, WorkPagination, AnomalyTable } from "@/components/work/lists";
import { FilterForm } from "@/components/ui/filter-form";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import { statusLabel } from "@/lib/status";
export default async function AnomaliesPage({searchParams}:{searchParams:Promise<WorkFilters>}){
 const user=await requirePagePermission("anomaly.read"),p=await searchParams;const [result,meta]=await Promise.all([getAnomalies(p),workMetadata()]);const names=new Map(meta.profiles.map(u=>[u.id,`${u.first_name} ${u.last_name}`]));
 return <><h1 className="h3 mb-3">Anomalie</h1><WorkTabs base="/anomalie" p={p} views={[["open","Aperte"],["critical","Critiche"],["mine","Assegnate a me"],["resolved","Risolte"],["ignored","Ignorate"]]}/>
 <FilterForm><input type="hidden" name="view" value={p.view??"open"}/><FilterToolbar activeCount={[p.assigned,p.code].filter(Boolean).length} advanced={<><div className="col-md-4"><label className="form-label" htmlFor="assigned">Responsabile</label><select id="assigned" name="assigned" className="form-select" defaultValue={p.assigned??""}><option value="">Tutti</option>{meta.profiles.map(u=><option key={u.id} value={u.id}>{names.get(u.id)}</option>)}</select></div><div className="col-md-4"><label className="form-label" htmlFor="code">Codice regola</label><input id="code" name="code" className="form-control" defaultValue={p.code}/></div></>}><div><label className="form-label" htmlFor="q">Ricerca</label><input id="q" name="q" className="form-control" defaultValue={p.q}/></div><div><label className="form-label" htmlFor="severity">Severità</label><select id="severity" name="severity" className="form-select" defaultValue={p.severity??""}><option value="">Tutte</option>{["info","warning","critical"].map(s=><option key={s} value={s}>{statusLabel("severity",s)}</option>)}</select></div></FilterToolbar></FilterForm>
 <AnomalyTable rows={result.rows} names={names} canCreate={hasPermission(user.role,"task.create")}/><WorkPagination {...result} p={p}/></>;
}
