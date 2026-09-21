import { FilterForm } from "@/components/ui/filter-form";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import Link from "@/components/ui/app-link";
import { getAccessScope,requirePagePermission } from "@/lib/permissions";
import { searchDocuments,documentOptions } from "@/lib/documents";
import { DocumentsTable } from "@/components/documents/documents-table";
import { UploadDocumentTrigger } from "@/components/documents/upload-document-trigger";
import { documentStatusLabels } from "@/lib/document-validation";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 await requirePagePermission("document.read");const p=await searchParams,[result,o,access]=await Promise.all([searchDocuments(p),documentOptions(),getAccessScope("document")]);
 const select=(name:string,label:string,rows:{id:string;label:string}[])=><div className="col-md-3" key={name}><label className="form-label small" htmlFor={name}>{label}</label><select className="form-select form-select-sm" id={name} name={name} defaultValue={p[name]||(name==="sort"?"created_at":"")}>{name!=="sort"&&<option value="">Tutti</option>}{rows.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></div>;
 const href=(page:number)=>`/documenti?${new URLSearchParams({...Object.fromEntries(Object.entries(p).filter((e):e is [string,string]=>!!e[1])),page:String(page)})}`;
 return <><div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3"><h1 className="h3">Documenti</h1>{access.canUpload&&<UploadDocumentTrigger/>}</div>{p.error&&<p role="alert" className="alert alert-danger">{p.error}</p>}
<FilterForm><FilterToolbar activeCount={[p.country,p.from,p.to,p.entity,p.project,p.company,p.invoice,p.expiry,p.sort&&p.sort!=="created_at",p.direction==="asc"].filter(Boolean).length} advanced={<> {[['country','Paese','text'],['from','Data documento dal','date'],['to','Al','date']].map(([name,label,type])=><div key={name} className="col-md-3"><label className="form-label small" htmlFor={name}>{label}</label><input id={name} name={name} type={type} className="form-control form-control-sm" defaultValue={p[name]}/></div>)}

 {select("entity","Società SIMI",o.entities.map(x=>({id:x.id,label:x.business_name})))}
 {select("project","Commessa",o.projects.map(x=>({id:x.id,label:x.project_code})))}
 {select("company","Controparte",o.companies.map(x=>({id:x.id,label:x.business_name})))}
 {select("invoice","Fattura",o.invoices.map(x=>({id:x.id,label:x.invoice_number})))}

 {select("expiry","Scadenza",[{id:"none",label:"Senza scadenza"},{id:"overdue",label:"Scaduti"},{id:"30",label:"Entro 30 giorni"}])}
 {select("sort","Ordina per",[{id:"created_at",label:"Caricamento"},{id:"document_date",label:"Data documento"},{id:"title",label:"Titolo"},{id:"expiry_date",label:"Scadenza"},{id:"reference",label:"Riferimento"}])}
 <div className="col-md-3"><label className="form-label small" htmlFor="direction">Direzione</label><select id="direction" name="direction" className="form-select form-select-sm" defaultValue={result.filters.direction}><option value="desc">Decrescente</option><option value="asc">Crescente</option></select></div>
</>}><div><label className="form-label" htmlFor="q">Ricerca</label><input id="q" name="q" className="form-control" defaultValue={p.q}/></div>{select("category","Categoria",o.categories.map(x=>({id:x.id,label:`${x.code} — ${x.name}`})))}{select("status","Stato",Object.entries(documentStatusLabels).map(([id,label])=>({id,label})))}<div className="col-auto"><Link className="btn btn-outline-secondary" href="/documenti">Azzera</Link></div></FilterToolbar></FilterForm>
 {!access.canUpload&&<p className="small text-muted">Il tuo ruolo consente la consultazione dei documenti, non il caricamento.</p>}
 {!result.count&&<div className="app-card p-3 mb-3"><p>Nessun documento presente per i filtri selezionati.</p>{access.canUpload&&<UploadDocumentTrigger/>}</div>}
 <p className="small text-muted">{result.count} documenti</p><DocumentsTable documents={result.rows}/><nav className="d-flex gap-3">{result.filters.page>1&&<Link href={href(result.filters.page-1)}>Precedente</Link>}<span>Pagina {result.filters.page}</span>{result.filters.page*50<result.count&&<Link href={href(result.filters.page+1)}>Successiva</Link>}</nav></>;
}
