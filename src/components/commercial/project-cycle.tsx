import { formatDate, formatMoney } from "@/lib/formatters";
import Link from "@/components/ui/app-link";
import { authorizedClient,requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { checkDatabase } from "@/lib/errors";
import { getOrders,getDeliveryNotes,readAll } from "@/lib/data";
import { commercialLabels } from "@/lib/commercial-validation";
export async function ProjectCycle({id}:{id:string}){
 const user=await requirePagePermission("project.read");const db=await authorizedClient("project.read");
 const orders=hasPermission(user.role,"order.read")?await getOrders({project:id}):{rows:[],count:0};
 const notes=hasPermission(user.role,"delivery_note.read")?await getDeliveryNotes({project:id}):{rows:[],count:0};
 const lines=hasPermission(user.role,"order.read")?await readAll((a,b)=>db.from("order_lines").select("order_id,amount_total").eq("project_id",id).order("id").range(a,b)):[];
 const sums=new Map<string,number>();for(const l of lines)sums.set(l.order_id,(sums.get(l.order_id)??0)+Number(l.amount_total));
 const partyIds=[...new Set([...orders.rows,...notes.rows].map(r=>r.counterparty_id).filter(Boolean))];
 const parties=partyIds.length?await db.from("companies").select("id,business_name").in("id",partyIds):{data:[],error:null};checkDatabase(parties.error);
 return <section className="app-card p-3 my-3"><h2 className="h5">Ordini e DDT della commessa</h2><div className="d-flex gap-2 mb-3">{hasPermission(user.role,"order.create")&&<Link href={`/ordini/new?project=${id}`} className="btn btn-outline-primary">Nuovo ordine</Link>}{hasPermission(user.role,"delivery_note.create")&&<Link href={`/ddt/new?project=${id}`} className="btn btn-outline-primary">Nuovo DDT</Link>}</div>
 <h3 className="h6">Ordini ({orders.count})</h3><div className="table-responsive"><table className="table table-sm"><thead><tr><th>Numero</th><th>Data</th><th>Controparte</th><th>Stato evasione</th><th>Quota commessa</th></tr></thead><tbody>{orders.rows.map(o=><tr key={o.id}><td><Link href={`/ordini/${o.id}`}>{o.order_number}</Link></td><td>{formatDate(o.order_date)}</td><td>{parties.data?.find(c=>c.id===o.counterparty_id)?.business_name}</td><td>{commercialLabels[o.fulfillment_status]??o.fulfillment_status}</td><td>{sums.has(o.id)?formatMoney(sums.get(o.id),o.currency):"Non attribuito alle righe"}</td></tr>)}</tbody></table></div>{!orders.count&&<p className="text-muted">Nessun ordine.</p>}{orders.count>50&&<Link href={`/ordini?project=${id}`}>Tutti gli ordini</Link>}
 <h3 className="h6">DDT ({notes.count})</h3>{notes.rows.map(d=><div key={d.id}><Link href={`/ddt/${d.id}`}>{d.note_number}</Link> · {formatDate(d.note_date)} · {commercialLabels[d.direction]}</div>)}{!notes.count&&<p className="text-muted">Nessun DDT.</p>}{notes.count>50&&<Link href={`/ddt?project=${id}`}>Tutti i DDT</Link>}
 </section>;
}
