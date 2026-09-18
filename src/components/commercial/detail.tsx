import Link from "next/link";
import { notFound } from "next/navigation";
import { authorizedClient,requirePagePermission } from "@/lib/permissions";
import { getCommercial,commercialOptions } from "@/lib/commercial";
import { commercialLabels,commercialPath,type CommercialKind } from "@/lib/commercial-validation";
import { hasPermission } from "@/lib/auth";
import { checkDatabase } from "@/lib/errors";
import { archiveCommercialAction } from "@/lib/commercial-actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { InvoiceLinks } from "./invoice-links";
import { CommercialDocuments } from "./documents";
import { StatusBadge } from "@/components/ui/status-badge";
export async function CommercialDetail({kind,id}:{kind:CommercialKind;id:string}){
 const user=await requirePagePermission(`${kind}.read`),record=await getCommercial(kind,id);if(!record)notFound();
 const db=await authorizedClient(`${kind}.read`),options=await commercialOptions(),path=commercialPath(kind),isOrder=kind==="order";
 const [progress,anomalies,events,links]=await Promise.all([
 isOrder?db.from("order_reconciliation").select("*").eq("id",id).maybeSingle():Promise.resolve({data:null,error:null}),
 db.from("commercial_anomalies").select("*").eq("kind",kind).eq("record_id",id),db.rpc("commercial_events",{kind,record_id:id}),
 db.from("delivery_note_orders").select("order_id,delivery_note_id").eq(isOrder?"order_id":"delivery_note_id",id)]);
 [progress,anomalies,events,links].forEach(r=>checkDatabase(r.error));
 const otherIds=(links.data??[]).map(x=>isOrder?x.delivery_note_id:x.order_id);
 const related=otherIds.length?await db.from(isOrder?"delivery_notes":"orders").select("*").in("id",otherIds):{data:[],error:null};checkDatabase(related.error);
 const lineIds=record.lines.map(l=>l.order_line_id).filter((id):id is string=>!!id);
 const lineOrders=lineIds.length?await db.from("order_lines").select("id,order_id,description").in("id",lineIds):{data:[],error:null};checkDatabase(lineOrders.error);
 const edit=hasPermission(user.role,`${kind}.update`)&&!record.archived_at;
 const projectNames=new Map(options.projects.map(p=>[p.id,p.project_code]));
 return <>
 <Link href={path}>← {isOrder?"Ordini":"DDT"}</Link>
 <div className="d-flex gap-2 align-items-center justify-content-between flex-wrap my-3"><h1 className="h3">{isOrder?"Ordine":"DDT"} {record.order_number??record.note_number}</h1><div className="d-flex gap-2">{edit&&<Link className="btn btn-outline-primary" href={`${path}/${id}/edit`}>Modifica</Link>}{isOrder&&!record.archived_at&&!["draft","cancelled"].includes(record.status??"")&&hasPermission(user.role,"delivery_note.create")&&<Link className="btn btn-primary" href={`/ddt/new?order=${id}`}>Crea DDT</Link>}{!record.archived_at&&hasPermission(user.role,`${kind}.delete`)&&<form action={archiveCommercialAction}><input type="hidden" name="kind" value={kind}/><input type="hidden" name="record_id" value={id}/><ConfirmSubmitButton confirmMessage="Archiviare il record? Collegamenti e documenti saranno conservati; le consegne archiviate non concorrono alle quantità operative.">Archivia</ConfirmSubmitButton></form>}</div></div>
 {record.archived_at&&<p className="alert alert-secondary">Archiviato il {new Date(record.archived_at).toLocaleString("it-IT")}. Collegamenti conservati per consultazione.</p>}
 <section className="app-card p-3"><dl className="row">{[["Società",options.entities.find(e=>e.id===record.legal_entity_id)?.business_name],["Data",record.order_date??record.note_date],["Tipo",commercialLabels[record.order_type??record.direction??""]],["Stato",<StatusBadge key="record-status" domain={isOrder?"order":"delivery_note"} status={progress.data?.fulfillment_status??record.status??"draft"}/>],["Valuta",record.currency],["Riferimento",record.counterparty_reference],["Oggetto",record.subject],["Descrizione",record.description],["Partenza",record.departure_place],["Destinazione",record.destination_place],["Causale",record.transport_reason],["Vettore",record.carrier],["Note",record.notes]].map(([label,value])=>value?<div key={label} className="col-md-4"><dt>{label}</dt><dd>{value}</dd></div>:null)}<div className="col-md-4"><dt>Controparte</dt><dd>{record.counterparty_id?<Link href={`/${["purchase","inbound"].includes(record.order_type??record.direction??"")?"fornitori":"clienti"}/${record.counterparty_id}`}>{options.companies.find(c=>c.id===record.counterparty_id)?.business_name??"Controparte"}</Link>:"—"}</dd></div></dl>
 <h2 className="h6">Commesse</h2>{record.project_ids.map(p=><Link key={p} className="me-3" href={`/commesse/${p}`}>{projectNames.get(p)??"Commessa"}</Link>)}{!record.project_ids.length&&<span className="text-muted">Nessuna commessa</span>}
 </section>
 {isOrder&&progress.data&&<section className="app-card p-3 my-3"><h2 className="h5">Riepilogo ({record.currency})</h2><p className="mb-0">Ordinato: {progress.data.ordered_value} · Consegnato (proporzionale al totale riga, inclusi sconto e IVA): {progress.data.delivered_value} · Fatturato attribuito: {progress.data.invoiced_value??"Da attribuire"} · Differenza: {progress.data.invoiced_value===null?"Non determinabile":Number(progress.data.ordered_value)-Number(progress.data.invoiced_value)}</p></section>}
 <section className="app-card p-3 my-3"><h2 className="h5">Righe</h2><div className="table-responsive"><table className="table table-sm"><thead><tr><th>Descrizione</th><th>Quantità</th><th>Unità</th><th>Commessa</th>{isOrder?<><th>Prezzo</th><th>Sconto</th><th>IVA %</th><th>Totale</th><th>Consegnato</th><th>Residuo</th></>:<th>Ordine / riga</th>}<th>Note</th></tr></thead><tbody>{record.lines.map(l=><tr key={l.id}><td>{l.description}</td><td>{l.quantity}</td><td>{l.unit}</td><td>{l.project_id?<Link href={`/commesse/${l.project_id}`}>{projectNames.get(l.project_id)??"Commessa"}</Link>:"—"}</td>{isOrder?<><td>{l.unit_price}</td><td>{l.discount}</td><td>{l.vat_rate??"—"}</td><td>{l.amount_total}</td><td>{l.delivered_quantity}</td><td>{l.remaining_quantity}</td></>:<td>{lineOrders.data?.filter(o=>o.id===l.order_line_id).map(o=><Link key={o.id} href={`/ordini/${o.order_id}`}>{related.data?.find(r=>r.id===o.order_id)?.order_number??"Ordine"} · {o.description}</Link>)}</td>}<td>{l.notes}</td></tr>)}</tbody></table></div></section>
 <section className="app-card p-3 my-3"><h2 className="h5">{isOrder?"DDT collegati":"Ordini collegati"}</h2>{(related.data??[]).map(r=><div key={r.id}><Link href={`/${isOrder?"ddt":"ordini"}/${r.id}`}>{r.note_number??r.order_number}</Link> · {r.note_date??r.order_date}{r.archived_at&&" · Archiviato"}</div>)}{!otherIds.length&&<p className="text-muted">Nessun collegamento.</p>}</section>
 <InvoiceLinks kind={kind} record={record}/><CommercialDocuments kind={kind} record={record}/>
 <section className="app-card p-3 my-3"><h2 className="h5">Informazioni, attenzioni e anomalie</h2>{(anomalies.data??[]).map(a=><p key={a.code} className={`alert alert-${a.severity==="anomaly"?"danger":a.severity==="attention"?"warning":"info"}`}><strong>{a.severity==="anomaly"?"Anomalia":a.severity==="attention"?"Attenzione":"Informazione"}</strong>: {a.message}</p>)}{!anomalies.data?.length&&<p className="text-muted">Nessuna segnalazione operativa.</p>}</section>
 <section className="app-card p-3 my-3"><h2 className="h5">Audit</h2><ul>{(events.data??[]).map((e:{id:string;created_at:string;user_id:string|null;entity_type:string;action:string})=><li key={e.id}>{new Date(e.created_at).toLocaleString("it-IT")} · {e.entity_type} · {e.action} · {e.user_id??"Sistema"}</li>)}</ul></section>
 </>;
}
