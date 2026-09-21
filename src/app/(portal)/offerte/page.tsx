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
import { getOffers } from "@/lib/offers-contracts";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 await requirePagePermission("offer.read");const p=await searchParams;
 const [r,companies,entities]=await Promise.all([getOffers({q:p.q,status:p.status,company:p.company,entity:p.entity,page:Number(p.page)||1}),getAllCompanies(),getLegalEntities()]);
 const page=Math.max(1,Number(p.page)||1);const pageHref=(value:number)=>{const query=new URLSearchParams(Object.entries(p).filter((x):x is [string,string]=>!!x[1]));query.set("page",String(value));return `/offerte?${query}`;};
 return <><div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3"><h1 className="h3">Offerte</h1><Link href="/offerte/new" className="btn btn-primary">Nuova offerta</Link></div>
 <FilterForm><FilterToolbar activeCount={p.entity?1:0} advanced={<div className="col-md-4"><label className="form-label" htmlFor="entity">Società</label><select id="entity" name="entity" defaultValue={p.entity||""} className="form-select"><option value="">Tutte</option>{entities.map(e=><option key={e.id} value={e.id}>{e.business_name}</option>)}</select></div>}>
 <div className="col-md-3"><label className="form-label" htmlFor="q">Ricerca</label><input id="q" name="q" defaultValue={p.q} className="form-control" placeholder="Numero o oggetto"/></div>
 <div className="col-md-2"><label className="form-label" htmlFor="status">Stato</label><select id="status" name="status" defaultValue={p.status||""} className="form-select"><option value="">Tutti</option>{["draft", "sent", "under_review", "accepted", "rejected", "expired", "cancelled"].map(s=><option key={s} value={s}>{statusLabel("offer",s)}</option>)}</select></div>
 <div className="col-md-3"><label className="form-label" htmlFor="company">Cliente</label><select id="company" name="company" defaultValue={p.company||""} className="form-select"><option value="">Tutti</option>{companies.map(c=><option key={c.id} value={c.id}>{c.business_name}</option>)}</select></div>
 </FilterToolbar></FilterForm>
 <div className="app-card table-responsive"><table className="table table-admin align-middle mb-0"><thead><tr><th>Numero</th><th>Data</th><th>Cliente</th><th>Commessa</th><th>Totale</th><th>Validità</th><th>Stato</th><th className="col-actions"><span className="visually-hidden">Azioni</span></th></tr></thead><tbody>{r.rows.map((row:any)=><tr key={row.id}><td className="col-description"><Link href={`/offerte/${row.id}`}>{row.offer_number}</Link><div className="small text-muted">Rev. {row.revision} · <span className="text-nowrap">{row.legal_entities?.code}</span></div></td>
<td className="col-date">{formatDate(row.issued_at)}</td><td className="col-description" title={row.companies?.business_name}>{row.counterparty_id?<Link href={`/clienti/${row.counterparty_id}`}>{row.companies?.business_name}</Link>:"—"}</td>
<td className="col-description">{row.offer_projects?.length?row.offer_projects.map((p:any)=><Link className="d-block text-truncate" key={p.project_id} href={`/commesse/${p.project_id}`}>{p.projects?.project_code}</Link>):"—"}</td>
<td className="col-money">{formatMoney(row.amount_total,row.currency)}</td><td className="col-date">{formatDate(row.valid_until)}</td><td className="col-status"><StatusBadge domain="offer" status={row.status}/></td><td className="col-actions"><RowActionsMenu label={`Azioni per ${row.offer_number}`}><Link href={`/offerte/${row.id}/edit`} className="dropdown-item">Modifica</Link><Link href={`/offerte/new?revision_of=${row.id}`} className="dropdown-item">Nuova revisione</Link></RowActionsMenu></td></tr>)}
 {!r.rows.length&&<tr><td colSpan={8} className="empty-state">Nessun risultato per i filtri selezionati.</td></tr>}</tbody></table></div>
 <nav aria-label="Paginazione" className="d-flex gap-3 align-items-center mt-3">{page>1&&<Link href={pageHref(page-1)}>Precedente</Link>}<span>{r.count} risultati · Pagina {page}</span>{page*50<r.count&&<Link href={pageHref(page+1)}>Successiva</Link>}</nav></>;
}
