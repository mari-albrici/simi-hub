"use client";
import { formatDate } from "@/lib/formatters";

import { useActionState,useEffect,useState } from "react";
import { saveCommercialAction,loadCompatibleOrders } from "@/lib/commercial-actions";
import { commercialLabels,type CommercialKind } from "@/lib/commercial-validation";
import type { CommercialOptions,CommercialRecord,CommercialLine,OrderChoice } from "@/lib/commercial";
import { CommercialLines } from "./commercial-lines";
export function CommercialForm({kind,options,record,projectId,source}:{kind:CommercialKind;options:CommercialOptions;record?:CommercialRecord;projectId?:string;source?:CommercialRecord}){
 const isOrder=kind==="order";
 const initial=record??source;
 const [entity,setEntity]=useState(initial?.legal_entity_id??options.projects.find(p=>p.id===projectId)?.legal_entity_id??"");
 const [party,setParty]=useState(initial?.counterparty_id??"");
 const [type,setType]=useState(isOrder?(record?.order_type??"purchase"):(record?.direction??(source?.order_type==="sale"?"outbound":"inbound")));
 const [result,setResult]=useState<{key:string;rows:OrderChoice[];error:string}>({key:"",rows:[],error:""});
 const requestKey=!isOrder&&entity&&party?`${entity}:${party}:${type}:${record?.id??""}`:"";
 const choices=result.key===requestKey?result.rows:[];
 const loading=!!requestKey&&result.key!==requestKey;
 const loadError=result.key===requestKey?result.error:"";
 const [state,action,pending]=useActionState(saveCommercialAction,{});
 const proposed:CommercialLine[]|undefined=source?.lines.filter(l=>Number(l.remaining_quantity)>0).map((l,index)=>({position:index,description:l.description,quantity:Number(l.remaining_quantity),unit:l.unit,project_id:l.project_id,notes:null,order_line_id:l.id}));
 const [lines,setLines]=useState<CommercialLine[]>(record?.lines??proposed??[{position:0,description:"",quantity:1,unit:"pz",project_id:projectId??null,notes:null,unit_price:0,discount:0,vat_rate:0}]);
 useEffect(()=>{if(!requestKey)return;let active=true;loadCompatibleOrders({entity,party,direction:type,note:record?.id}).then(rows=>{if(active)setResult({key:requestKey,rows,error:""});}).catch(()=>{if(active)setResult({key:requestKey,rows:[],error:"Impossibile caricare le righe ordine. Riprova selezionando la controparte."});});return()=>{active=false;};},[requestKey,entity,party,type,record?.id]);
 const value=(key:keyof CommercialRecord)=>String(record?.[key]??"");
 const field=(name:keyof CommercialRecord,label:string,inputType="text",required=false)=><div className="col-md-4" key={name}><label htmlFor={name} className="form-label">{label}</label><input id={name} name={name} className="form-control" type={inputType} defaultValue={value(name)} required={required}/></div>;
 const projects=options.projects.filter(p=>!p.legal_entity_id||p.legal_entity_id===entity);
 return <form action={action} className="row g-3">
 <input type="hidden" name="kind" value={kind}/>{record&&<><input type="hidden" name="id" value={record.id}/><input type="hidden" name="expected_updated_at" value={record.updated_at}/></>}
 {field(isOrder?"order_number":"note_number",isOrder?"Numero ordine":"Numero DDT","text",true)}
 {field(isOrder?"order_date":"note_date","Data","date",true)}
 <div className="col-md-4"><label htmlFor="commercial-type" className="form-label">{isOrder?"Tipo":"Direzione"}</label><select id="commercial-type" name={isOrder?"order_type":"direction"} className="form-select" value={type} onChange={e=>setType(e.target.value)}>{(isOrder?["purchase","sale"]:["inbound","outbound"]).map(t=><option key={t} value={t}>{commercialLabels[t]}</option>)}</select></div>
 <div className="col-md-6"><label htmlFor="legal_entity_id" className="form-label">Società SIMI</label><select id="legal_entity_id" name="legal_entity_id" className="form-select" value={entity} onChange={e=>setEntity(e.target.value)} required><option value="">Seleziona</option>{options.entities.map(e=><option key={e.id} value={e.id}>{e.code} — {e.business_name}</option>)}</select></div>
 <div className="col-md-6"><label htmlFor="counterparty_id" className="form-label">Controparte</label><select id="counterparty_id" name="counterparty_id" className="form-select" value={party} onChange={e=>setParty(e.target.value)} required={isOrder}><option value="">Seleziona</option>{options.companies.filter(c=>c.company_type==="both"||c.company_type===(["purchase","inbound"].includes(type)?"supplier":"customer")).map(c=><option key={c.id} value={c.id}>{c.business_name}</option>)}</select></div>
 {isOrder?<>
 <div className="col-md-4"><label htmlFor="currency" className="form-label">Valuta</label><input id="currency" name="currency" className="form-control" defaultValue={record?.currency??"EUR"} pattern="[A-Z]{3}" maxLength={3} required/></div>
 <div className="col-md-4"><label htmlFor="status" className="form-label">Stato amministrativo</label><select id="status" name="status" className="form-select" defaultValue={record?.status&&["draft","cancelled"].includes(record.status)?record.status:"confirmed"}>{["draft","confirmed","cancelled"].map(s=><option key={s} value={s}>{commercialLabels[s]}</option>)}</select><small>Lo stato di evasione è calcolato dalle consegne.</small></div>
 {field("counterparty_reference","Riferimento controparte")}{field("subject","Oggetto")}{field("description","Descrizione")}
 <div className="col-md-6"><label htmlFor="project_ids" className="form-label">Commesse intestazione</label><select id="project_ids" name="project_ids" multiple className="form-select" defaultValue={record?.project_ids??(projectId?[projectId]:[])}>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code}</option>)}</select></div>
 </>:<>
 {field("departure_place","Luogo partenza")}{field("destination_place","Destinazione")}{field("transport_reason","Causale trasporto")}{field("carrier","Vettore")}
 {([['sender_id','Mittente'],['recipient_id','Destinatario']] as const).map(([name,label])=><div className="col-md-6" key={name}><label htmlFor={name} className="form-label">{label}</label><select id={name} name={name} defaultValue={value(name)} className="form-select"><option value="">Nessuno</option>{options.companies.map(c=><option key={c.id} value={c.id}>{c.business_name}</option>)}</select></div>)}
 <div className="col-12"><label htmlFor="order_ids" className="form-label">Ordini aggiuntivi (solo riferimento di intestazione)</label><select id="order_ids" name="order_ids" multiple className="form-select" defaultValue={record?.order_ids??(source?[source.id]:[])}>{choices.map(o=><option key={o.id} value={o.id}>{o.order_number} — {formatDate(o.order_date)} — {o.counterparty_name}</option>)}</select><small>Le quantità sono attribuite solo scegliendo la riga ordine nella tabella.</small></div>
 {loading&&<p role="status">Caricamento righe compatibili…</p>}{loadError&&<p className="alert alert-danger">{loadError}</p>}
 {source&&<p className="alert alert-info">Quantità residue proposte dall’ordine {source.order_number}. Modifica le quantità effettive e salva per confermare.</p>}
 </>}
 <div className="col-12"><h2 className="h5">Righe</h2><CommercialLines kind={isOrder?"order":"delivery"} projects={projects} projectId={projectId} lines={lines} onChange={setLines} orders={choices}/></div>
 <div className="col-12"><label htmlFor="notes" className="form-label">Note</label><textarea id="notes" name="notes" className="form-control" defaultValue={value("notes")}/></div>
 {state.error&&<div className="col-12"><p role="alert" className="alert alert-danger">{state.error}</p></div>}
 <div className="col-12"><button className="btn btn-primary" disabled={pending||loading||!!loadError||!lines.length}>{pending?"Salvataggio…":isOrder?"Salva ordine":"Salva DDT"}</button></div>
 </form>;
}
