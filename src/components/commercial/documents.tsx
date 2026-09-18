import Link from "next/link";
import { authorizedClient,requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { readAll } from "@/lib/data";
import { checkDatabase } from "@/lib/errors";
import { commercialRelationAction } from "@/lib/commercial-actions";
import type { CommercialRecord } from "@/lib/commercial";
import type { CommercialKind } from "@/lib/commercial-validation";
import { SubmitButton } from "@/components/ui/submit-button";
export async function CommercialDocuments({kind,record}:{kind:CommercialKind;record:CommercialRecord}){
 const user=await requirePagePermission(`${kind}.read`);if(!hasPermission(user.role,"document.read"))return null;
 const db=await authorizedClient("document.read");const r=await db.from(kind==="order"?"document_orders":"document_delivery_notes").select("document_id").eq(kind==="order"?"order_id":"delivery_note_id",record.id);checkDatabase(r.error);
 const ids=(r.data??[]).map(x=>String(x.document_id));const docs=ids.length?await db.from("document_register").select("id,title,original_filename,version_number,archived_at").in("id",ids):{data:[],error:null};checkDatabase(docs.error);
 const canWrite=hasPermission(user.role,`${kind}.update`)&&hasPermission(user.role,"document.update")&&!record.archived_at;
 const choices=canWrite?await readAll((a,b)=>db.from("document_register").select("id,title,original_filename").eq("legal_entity_id",record.legal_entity_id).is("archived_at",null).order("title").order("id").range(a,b)):[];
 return <section className="app-card p-3 my-3"><div className="d-flex justify-content-between"><h2 className="h5">Documenti</h2>{canWrite&&hasPermission(user.role,"document.upload")&&<Link className="btn btn-outline-primary btn-sm" href={`/documenti/new?${kind}=${record.id}`}>Carica documento</Link>}</div><ul>{(docs.data??[]).map(d=><li key={d.id}><Link href={`/documenti/${d.id}`}>{d.title||d.original_filename}</Link> · v{d.version_number}{d.archived_at?" · Archiviato":""}</li>)}</ul>{!ids.length&&<p className="text-muted">Nessun documento collegato.</p>}
 {canWrite&&<form action={commercialRelationAction} className="d-flex gap-2"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="record_id" value={record.id}/><input type="hidden" name="operation" value="document"/><select aria-label="Documento esistente" name="document_id" className="form-select" required><option value="">Seleziona documento esistente</option>{choices.map(d=><option key={d.id} value={d.id}>{d.title||d.original_filename}</option>)}</select><SubmitButton className="btn btn-outline-secondary">Collega documento</SubmitButton></form>}
 </section>;
}
