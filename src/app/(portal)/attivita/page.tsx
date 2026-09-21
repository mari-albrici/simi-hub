import Link from "@/components/ui/app-link";
import { FilterForm } from "@/components/ui/filter-form";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import { TaskTable, WorkTabs, WorkPagination } from "@/components/work/lists";
import { getTasks, workMetadata } from "@/lib/work/data";
import { priorities, taskStates, sourceLabels, sourceKinds, type WorkFilters } from "@/lib/work/model";
import { statusLabel } from "@/lib/status";
import { requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
export default async function TasksPage({searchParams}:{searchParams:Promise<WorkFilters>}){
 const user=await requirePagePermission("task.read"),params=await searchParams;const p:WorkFilters={...params,view:params.view??"mine"};
 if(p.record_type&&!sourceKinds.includes(p.record_type as typeof sourceKinds[number]))delete p.record_type;
 const [result,meta]=await Promise.all([getTasks(p),workMetadata()]);
 const names=new Map(meta.profiles.map(u=>[u.id,`${u.first_name} ${u.last_name}`])),entities=new Map(meta.entities.map(e=>[e.id,`${e.country??""} · ${e.business_name}`]));
 return <><div className="d-flex justify-content-between mb-3"><h1 className="h3">Attività</h1>{hasPermission(user.role,"task.create")&&<Link className="btn btn-primary" href="/attivita/new"><i className="bi bi-plus-lg me-2"/>Nuova attività</Link>}</div>
 <WorkTabs base="/attivita" p={p} views={[["mine","Le mie"],["today","Oggi"],["overdue","In ritardo"],["upcoming","Prossime"],["all","Tutte"]]}/>
 <FilterForm><input type="hidden" name="view" value={p.view}/><FilterToolbar activeCount={[p.assigned,p.origin,p.record_type,p.from,p.to,p.completed,p.archived,p.entity].filter(Boolean).length} advanced={<>
 <div className="col-md-3"><label className="form-label" htmlFor="assigned">Responsabile</label><select id="assigned" name="assigned" className="form-select" defaultValue={p.assigned??""}><option value="">Tutti</option>{meta.profiles.map(u=><option key={u.id} value={u.id}>{names.get(u.id)}</option>)}</select></div>
 <div className="col-md-3"><label className="form-label" htmlFor="origin">Origine</label><select id="origin" name="origin" className="form-select" defaultValue={p.origin??""}><option value="">Tutte</option><option value="manual">Manuale</option><option value="record">Record</option><option value="anomaly">Anomalia</option></select></div>
 <div className="col-md-3"><label className="form-label" htmlFor="record_type">Tipo record</label><select id="record_type" name="record_type" className="form-select" defaultValue={p.record_type??""}><option value="">Tutti</option>{meta.kinds.map(k=><option key={k} value={k}>{sourceLabels[k]}</option>)}</select></div>
 <div className="col-md-3"><label className="form-label" htmlFor="entity">Società</label><select id="entity" name="entity" className="form-select" defaultValue={p.entity??""}><option value="">Tutte</option>{meta.entities.map(e=><option key={e.id} value={e.id}>{e.business_name}</option>)}</select></div>
 <div className="col-md-3"><label className="form-label" htmlFor="from">Scadenza dal</label><input id="from" name="from" type="date" className="form-control" defaultValue={p.from}/></div><div className="col-md-3"><label className="form-label" htmlFor="to">Al</label><input id="to" name="to" type="date" className="form-control" defaultValue={p.to}/></div>
 <div className="col-auto"><label className="form-check"><input type="checkbox" className="form-check-input" name="completed" value="1" defaultChecked={p.completed==="1"}/>Includi completate / annullate</label></div><div className="col-auto"><label className="form-check"><input type="checkbox" className="form-check-input" name="archived" value="1" defaultChecked={p.archived==="1"}/>Archiviate</label></div>
 </>}><div><label className="form-label" htmlFor="q">Ricerca</label><input id="q" name="q" className="form-control" defaultValue={p.q}/></div><div><label className="form-label" htmlFor="status">Stato</label><select id="status" name="status" className="form-select" defaultValue={p.status??""}><option value="">Aperte</option>{taskStates.map(s=><option key={s} value={s}>{statusLabel("task",s)}</option>)}</select></div><div><label className="form-label" htmlFor="priority">Priorità</label><select id="priority" name="priority" className="form-select" defaultValue={p.priority??""}><option value="">Tutte</option>{priorities.map(s=><option key={s} value={s}>{statusLabel("priority",s)}</option>)}</select></div></FilterToolbar></FilterForm>
 <TaskTable rows={result.rows} names={names} entities={entities}/><WorkPagination {...result} p={p}/></>;
}
