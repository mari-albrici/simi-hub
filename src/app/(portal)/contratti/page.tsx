import { FilterForm } from "@/components/ui/filter-form";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "@/components/ui/app-link";
import { requirePagePermission } from "@/lib/permissions";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatMoney } from "@/lib/formatters";
import { statusLabel } from "@/lib/status";
import { getAllCompanies, getLegalEntities } from "@/lib/data";
import { contractTypeLabels } from "@/lib/commercial-validation";
import { getContracts } from "@/lib/offers-contracts";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 await requirePagePermission("contract.read");const p=await searchParams;
 const [r,companies,entities]=await Promise.all([getContracts({q:p.q,status:p.status,company:p.company,entity:p.entity,page:Number(p.page)||1}),getAllCompanies(),getLegalEntities()]);
 const page=Math.max(1,Number(p.page)||1);const pageHref=(value:number)=>{const query=new URLSearchParams(Object.entries(p).filter((x):x is [string,string]=>!!x[1]));query.set("page",String(value));return `/contratti?${query}`;};
 const showProjects=r.rows.some(row=>row.contract_projects?.length),showStarts=r.rows.some(row=>row.starts_at),showExpires=r.rows.some(row=>row.expires_at),showValue=r.rows.some(row=>row.contract_value!==null);
 return <><div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3"><h1 className="h3">Contratti</h1><Link href="/contratti/new" className="btn btn-primary">Nuovo contratto</Link></div>
 <FilterForm><FilterToolbar activeCount={p.entity?1:0} advanced={<div className="col-md-4"><label className="form-label" htmlFor="entity">Società</label><select id="entity" name="entity" defaultValue={p.entity||""} className="form-select"><option value="">Tutte</option>{entities.map(e=><option key={e.id} value={e.id}>{e.business_name}</option>)}</select></div>}>
 <div className="col-md-3"><label className="form-label" htmlFor="q">Ricerca</label><input id="q" name="q" defaultValue={p.q} className="form-control" placeholder="Numero o oggetto"/></div>
 <div className="col-md-2"><label className="form-label" htmlFor="status">Stato</label><select id="status" name="status" defaultValue={p.status||""} className="form-select"><option value="">Tutti</option>{["draft", "active", "suspended", "expired", "terminated", "cancelled"].map(s=><option key={s} value={s}>{statusLabel("contract",s)}</option>)}</select></div>
 <div className="col-md-3"><label className="form-label" htmlFor="company">Controparte</label><select id="company" name="company" defaultValue={p.company||""} className="form-select"><option value="">Tutti</option>{companies.map(c=><option key={c.id} value={c.id}>{c.business_name}</option>)}</select></div>
 </FilterToolbar></FilterForm>
 <div className="app-card table-responsive"><table className="table table-admin align-middle mb-0"><thead><tr><th>Contratto</th><th>Controparte</th>{showProjects&&<th>Commessa</th>}{showStarts&&<th>Decorrenza</th>}{showExpires&&<th>Scadenza</th>}{showValue&&<th>Valore</th>}<th>Stato</th><th className="col-actions"><span className="visually-hidden">Azioni</span></th></tr></thead><tbody>{r.rows.map((row:any)=><tr key={row.id}><td className="col-description" title={row.title}><Link href={`/contratti/${row.id}`}>{row.reference}</Link><div className="small text-muted text-truncate">{row.title}</div><div className="small text-muted text-truncate">{contractTypeLabels[row.contract_type]||row.contract_type} · {row.legal_entities?.code}</div></td>
<td className="col-description" title={row.companies?.business_name}>{row.companies?.business_name||row.contact_name||"—"}</td>
{showProjects&&<td className="col-description">{row.contract_projects?.length?row.contract_projects.map((p:any)=><Link className="d-block text-truncate" key={p.project_id} href={`/commesse/${p.project_id}`}>{p.projects?.project_code}</Link>):"—"}</td>}
{showStarts&&<td className="col-date">{formatDate(row.starts_at)}</td>}{showExpires&&<td className="col-date">{formatDate(row.expires_at)}</td>}{showValue&&<td className="col-money">{formatMoney(row.contract_value,row.currency)}</td>}<td className="col-status"><StatusBadge domain="contract" status={row.status}/></td><td className="col-actions"><RowActionsMenu label={`Azioni per ${row.reference}`}><Link href={`/contratti/${row.id}/edit`} className="dropdown-item">Modifica</Link></RowActionsMenu></td></tr>)}
 {!r.rows.length&&<tr><td colSpan={4+Number(showProjects)+Number(showStarts)+Number(showExpires)+Number(showValue)} className="empty-state">Nessun risultato per i filtri selezionati.</td></tr>}</tbody></table></div>
 <nav aria-label="Paginazione" className="d-flex gap-3 align-items-center mt-3">{page>1&&<Link href={pageHref(page-1)}>Precedente</Link>}<span>{r.count} risultati · Pagina {page}</span>{page*50<r.count&&<Link href={pageHref(page+1)}>Successiva</Link>}</nav></>;
}
