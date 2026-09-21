import { formatDate } from "@/lib/formatters";
import Link from "@/components/ui/app-link";
import { authorizedClient,requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { commercialRelationAction } from "@/lib/commercial-actions";
import { SubmitButton } from "@/components/ui/submit-button";
export async function InvoiceCycle({id}:{id:string}){
 const user=await requirePagePermission("invoice.read"),db=await authorizedClient("invoice.read");
 const invoice=await db.from("invoices").select("*").eq("id",id).single();checkDatabase(invoice.error);if(!invoice.data)return null;const i=invoice.data;
 const sections=await Promise.all((["order","delivery_note"] as const).map(async kind=>{
 if(!hasPermission(user.role,`${kind}.read`))return null;
 const isOrder=kind==="order",key=isOrder?"order_id":"delivery_note_id",table=isOrder?"orders":"delivery_notes";
 const r=await db.from(isOrder?"order_invoices":"delivery_note_invoices").select("*").eq("invoice_id",id);checkDatabase(r.error);
 const ids=(r.data??[]).map(x=>String(x[key]));const linked=ids.length?await db.from(table).select("*").in("id",ids):{data:[],error:null};checkDatabase(linked.error);
 const write=hasPermission(user.role,`${kind}.update`)&&!i.archived_at;
 const choices=write?await readAll((a,b)=>{let q=db.from(table).select("*").is("archived_at",null).eq("legal_entity_id",i.legal_entity_id).eq("counterparty_id",i.invoice_type==="purchase"?i.supplier_id:i.customer_id);q=isOrder?q.eq("order_type",i.invoice_type).eq("currency",i.currency):q.eq("direction",i.invoice_type==="purchase"?"inbound":"outbound");return q.order("id").range(a,b);}):[];
 return <div key={kind} className="mb-3"><h3 className="h6">{isOrder?"Ordini collegati":"DDT collegati"}</h3>{(linked.data??[]).map(row=><div key={row.id} className="d-flex gap-3 align-items-center py-1"><Link href={`/${isOrder?"ordini":"ddt"}/${row.id}`}>{row.order_number??row.note_number}</Link>{row.archived_at&&<span>Archiviato</span>}{write&&!row.archived_at&&<form action={commercialRelationAction}><input type="hidden" name="kind" value={kind}/><input type="hidden" name="record_id" value={row.id}/><input type="hidden" name="invoice_id" value={id}/><input type="hidden" name="return_invoice" value="1"/><input type="hidden" name="operation" value="unlink"/><SubmitButton className="btn btn-sm btn-outline-secondary">Scollega</SubmitButton></form>}</div>)}{!ids.length&&<p className="text-muted">Nessun collegamento.</p>}
 {write&&<form action={commercialRelationAction} className="d-flex gap-2"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="invoice_id" value={id}/><input type="hidden" name="return_invoice" value="1"/><select aria-label={isOrder?"Ordine compatibile":"DDT compatibile"} name="record_id" className="form-select" required><option value="">Seleziona {isOrder?"ordine":"DDT"}</option>{choices.map(row=><option key={row.id} value={row.id}>{row.order_number??row.note_number} · {formatDate(row.order_date??row.note_date)}</option>)}</select>{isOrder&&<input name="amount" aria-label={`Importo attribuito ${i.currency}`} placeholder={`Importo attribuito ${i.currency} (facoltativo)`} type="number" min="0" step="0.01" className="form-control"/>}<SubmitButton className="btn btn-outline-primary">Collega</SubmitButton></form>}</div>;
 }));
 return <section className="app-card p-3 my-3"><h2 className="h5">Ciclo documentale</h2>{sections}<p className="small text-muted">I collegamenti sono indipendenti dal PDF. La fattura può legittimamente non avere un DDT.</p></section>;
}
