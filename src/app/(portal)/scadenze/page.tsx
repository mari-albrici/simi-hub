import { FilterForm } from "@/components/ui/filter-form";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "@/components/ui/app-link";
import { requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { getDeadlines,deadlineOptions,deadlineHref,type Deadline } from "@/lib/deadlines";
import { temporalLabels,priorityLabels } from "@/lib/deadline-validation";
import { formatMoney, formatDate, formatMonth } from "@/lib/formatters";
const money=(n:number|null,c:string|null)=>formatMoney(n,c||"EUR");
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const user=await requirePagePermission("deadline.read"),p=await searchParams;
 const [{rows,count,filters:f,month},o]=await Promise.all([getDeadlines(p),deadlineOptions()]);
 const href=(values:Record<string,string>)=>`/scadenze?${new URLSearchParams({...Object.fromEntries(Object.entries(p).filter((x):x is [string,string]=>typeof x[1]==="string")),page:"1",...values})}`;
 const select=(name:string,label:string,options:{id:string;label:string}[])=><div className={name==="kind"||name==="status"?"col-md-2":"col-md-3"} key={name}><label className="form-label small" htmlFor={name}>{label}</label><select className="form-select form-select-sm" id={name} name={name} defaultValue={p[name]||""}><option value="">Tutti</option>{options.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></div>;
 const status=(d:Deadline)=><StatusBadge domain="deadline" status={d.temporal_status}/>;
 const monthLink=(delta:number)=>{const d=new Date(`${month}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+delta);return href({month:d.toISOString().slice(0,7)});};
 const monthStart=new Date(`${month}-01T00:00:00Z`),dayCount=new Date(Date.UTC(monthStart.getUTCFullYear(),monthStart.getUTCMonth()+1,0)).getUTCDate();
 return <><div className="d-flex justify-content-between mb-3"><h1 className="h3">Scadenze</h1>{hasPermission(user.role,"deadline.write")&&<Link className="btn btn-primary" href="/scadenze/new"><i className="bi bi-plus-lg me-2"/>Nuova scadenza</Link>}</div>
 {p.error&&<p role="alert" className="alert alert-danger">{p.error}</p>}{p.success&&<p className="alert alert-success">{p.success}</p>}
 <div className="d-flex gap-2 flex-wrap mb-3">{[["today","Oggi"],["7","7 giorni"],["30","30 giorni"],["overdue","Scadute"],["all","Tutte"]].map(([id,label])=><Link key={id} className={`btn btn-sm btn-outline-primary ${f.period===id?"active":""}`} href={href({period:id})}>{label}</Link>)}<Link aria-pressed={!!f.mine} className={`btn btn-sm btn-outline-secondary ${f.mine?"active":""}`} href={href({mine:f.mine?"":"1"})}>Le mie</Link></div>
 <FilterForm><input type="hidden" name="period" value={f.period}/><input type="hidden" name="mine" value={f.mine}/>
 <FilterToolbar activeCount={['from','to','entity','category','priority','company','project','assigned','archived'].filter(key=>p[key]).length+Number(f.view!=="list")+Number(!!p.month)} advanced={<>
 {[["from","Dal"],["to","Al"]].map(([name,label])=><div className="col-md-3" key={name}><label className="form-label small" htmlFor={name}>{label}</label><input id={name} name={name} type="date" className="form-control form-control-sm" defaultValue={p[name]}/></div>)}
 {select("entity","Società SIMI",o.entities.map(x=>({id:x.id,label:x.business_name})))}
 {select("category","Categoria",o.categories.map(x=>({id:x.code,label:x.name})))}
 {select("priority","Priorità",Object.entries(priorityLabels).map(([id,label])=>({id,label})))}
 {select("company","Controparte",o.companies.map(x=>({id:x.id,label:x.business_name})))}
 {select("project","Commessa",o.projects.map(x=>({id:x.id,label:x.project_code})))}
 {select("assigned","Responsabile",o.profiles.map(x=>({id:x.id,label:[x.first_name,x.last_name].filter(Boolean).join(" ")||x.id})))}
 <div className="col-md-3"><label className="form-label small" htmlFor="view">Vista</label><select id="view" name="view" className="form-select form-select-sm" defaultValue={f.view}><option value="list">Elenco</option><option value="calendar">Calendario</option></select></div>
 <div className="col-md-3"><label className="form-label small" htmlFor="month">Mese calendario</label><input id="month" name="month" type="month" defaultValue={month} className="form-control form-control-sm"/></div>
 <div className="col-md-3"><label className="form-check mt-4"><input className="form-check-input" type="checkbox" name="archived" value="1" defaultChecked={!!f.archived}/>Archiviate</label></div>
 </>}><div className="col-md-3"><label className="form-label small" htmlFor="q">Ricerca</label><input id="q" name="q" type="search" className="form-control form-control-sm" defaultValue={p.q}/></div>
 {select("kind","Tipo",[{id:"payment",label:"Pagamento"},{id:"receipt",label:"Incasso"},{id:"manual",label:"Manuale"},{id:"document",label:"Documento"}])}
 {select("status","Stato",[{id:"open",label:"Da completare"},...Object.entries(temporalLabels).map(([id,label])=>({id,label}))])}
 <div className="col-auto"><Link href="/scadenze" className="btn btn-outline-secondary">Azzera</Link></div></FilterToolbar></FilterForm>
 <p className="text-muted small">{count} scadenze</p>
 {f.view==="calendar"?<div className="table-responsive"><nav className="d-flex gap-3 mb-2"><Link href={monthLink(-1)}>Mese precedente</Link><strong>{formatMonth(month)}</strong><Link href={monthLink(1)}>Mese successivo</Link></nav><div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(130px,1fr))",minWidth:910}}>{["Lun","Mar","Mer","Gio","Ven","Sab","Dom"].map(x=><div key={x} className="bg-light border p-2 fw-bold">{x}</div>)}{Array.from({length:(monthStart.getUTCDay()+6)%7},(_,i)=><div key={`empty${i}`} className="border"/>)}{Array.from({length:dayCount},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,"0")}`;return <div key={date} className="border p-2" style={{minHeight:130}}><Link href={href({view:"list",period:"all",from:date,to:date})}>{i+1}</Link>{rows.filter(d=>d.due_date===date).map(d=><div key={d.id} className="small mt-2"><Link href={deadlineHref(d)}>{d.title}</Link> {status(d)}</div>)}</div>;})}</div></div>:<><div className="table-responsive"><table className="table table-admin table-hover align-middle"><thead><tr><th>Scadenza</th><th>Descrizione</th><th>Soggetto</th><th>Commessa</th><th className="col-money">Residuo</th><th>Stato</th><th>Priorità</th></tr></thead><tbody>{rows.map(d=><tr key={d.id}>
 <td className="col-date">{d.due_date?formatDate(d.due_date):"Senza data"}{d.due_time&&<div className="small text-muted">{d.due_time.slice(0,5)}</div>}</td>
 <td className="col-description" title={d.title}><Link href={deadlineHref(d)}>{d.title}</Link><div className="small text-muted text-truncate">{d.kind==="payment"?"Pagamento":d.kind==="receipt"?"Incasso":d.kind==="document"?"Documento":"Manuale"} · {d.category_name}</div>{d.document_id&&<Link className="small" href={`/documenti/${d.document_id}`}>Documento</Link>}</td>
 <td className="col-description" title={d.company_name||d.entity_name||undefined}>{d.company_id?<Link href={`/${d.company_type==="supplier"||d.kind==="payment"?"fornitori":"clienti"}/${d.company_id}`}>{d.company_name}</Link>:d.entity_name||"—"}<div className="small text-muted text-nowrap" title={d.entity_name||undefined}>{d.entity_country}</div></td>
 <td className="col-description">{d.project_ids.map(id=><Link className="d-block text-truncate" key={id} href={`/commesse/${id}`}>{o.projects.find(x=>x.id===id)?.project_code||"Commessa"}</Link>)}</td>
 <td className="col-money">{d.kind==="payment"||d.kind==="receipt"?money(d.residual,d.currency):"—"}</td><td className="col-status">{status(d)}</td><td className="col-status"><StatusBadge domain="deadline" status={d.priority}/></td>
 </tr>)}{!rows.length&&<tr><td colSpan={7} className="empty-state">Nessuna scadenza per i filtri selezionati.</td></tr>}</tbody></table></div><nav className="d-flex gap-3">{f.page>1&&<Link href={href({page:String(f.page-1)})}>Precedente</Link>}<span>Pagina {f.page}</span>{f.page*50<count&&<Link href={href({page:String(f.page+1)})}>Successiva</Link>}</nav></>}
 </>;
}
