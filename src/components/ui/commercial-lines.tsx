"use client";
import { useState } from "react";
import type { CommercialLine,OrderChoice } from "@/lib/commercial";
type Props={kind:"order"|"delivery";projects:{id:string;project_code:string}[];projectId?:string;lines:CommercialLine[];onChange:(lines:CommercialLine[])=>void;orders?:OrderChoice[]};
export function CommercialLines({kind,projects,projectId,lines,onChange,orders=[]}:Props){
 const [selection,setSelection]=useState<Record<number,string>>({});
 const update=(index:number,patch:Partial<CommercialLine>)=>onChange(lines.map((l,i)=>i===index?{...l,...patch}:l));
 return <>
 <input type="hidden" name="lines_json" value={JSON.stringify(lines.map((l,position)=>({...l,position})))}/>
 <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Descrizione</th><th>Quantità</th><th>Unità</th>{kind==="order"&&<><th>Prezzo unitario</th><th>Sconto importo</th><th>IVA %</th></>}<th>Commessa</th>{kind==="delivery"&&<th>Ordine / riga</th>}<th>Note</th><th>Azioni</th></tr></thead>
 <tbody>{lines.map((line,index)=>{
 const chosen=orders.find(o=>o.lines.some(l=>l.id===line.order_line_id));
 const order=orders.find(o=>o.id===(selection[index]??chosen?.id));
 const orderLine=chosen?.lines.find(l=>l.id===line.order_line_id);
 return <tr key={line.id??index}>
 <td><input aria-label={`Descrizione riga ${index+1}`} className="form-control" required value={line.description} onChange={e=>update(index,{description:e.target.value})}/></td>
 <td><input aria-label={`Quantità riga ${index+1}`} type="number" step="0.001" min="0.001" className="form-control" required value={line.quantity} onChange={e=>update(index,{quantity:Number(e.target.value)})}/>{orderLine&&line.quantity>Number(orderLine.remaining_quantity)&&<small className="text-warning">Sovraconsegna: residuo {orderLine.remaining_quantity}</small>}</td>
 <td><input aria-label={`Unità riga ${index+1}`} className="form-control" value={line.unit??""} onChange={e=>update(index,{unit:e.target.value})}/></td>
 {kind==="order"&&([['unit_price','Prezzo unitario'],['discount','Sconto importo'],['vat_rate','IVA %']] as const).map(([key,label])=><td key={key}><input aria-label={`${label} riga ${index+1}`} type="number" min="0" step={key==="unit_price"?"0.0001":"0.01"} max={key==="vat_rate"?100:undefined} className="form-control" required value={line[key]??0} onChange={e=>update(index,{[key]:Number(e.target.value)})}/></td>)}
 <td><select aria-label={`Commessa riga ${index+1}`} className="form-select" value={line.project_id??""} onChange={e=>update(index,{project_id:e.target.value||null,order_line_id:null})}><option value="">Nessuna</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code}</option>)}</select></td>
 {kind==="delivery"&&<td style={{minWidth:280}}><select aria-label={`Ordine riga ${index+1}`} className="form-select mb-1" value={order?.id??""} onChange={e=>{setSelection({...selection,[index]:e.target.value});update(index,{order_line_id:null});}}><option value="">Senza ordine</option>{orders.filter(o=>o.lines.some(l=>!line.project_id||l.project_id===line.project_id)).map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.order_date} · {o.counterparty_name}</option>)}</select>
 {order&&<select aria-label={`Riga ordine ${index+1}`} className="form-select" value={line.order_line_id??""} onChange={e=>{const l=order.lines.find(l=>l.id===e.target.value);update(index,{order_line_id:l?.id??null,...(l?{description:line.description||l.description,unit:l.unit,project_id:l.project_id}: {})});}}><option value="">Seleziona riga</option>{order.lines.filter(l=>!line.project_id||l.project_id===line.project_id).map(l=><option key={l.id} value={l.id}>{l.description} · {projects.find(p=>p.id===l.project_id)?.project_code??"Senza commessa"} · ordinati {l.quantity}, consegnati {l.delivered_quantity}, residui {l.remaining_quantity}</option>)}</select>}
 {line.order_line_id&&!chosen&&<small className="text-warning">Collegamento esistente non selezionabile con i filtri correnti. Verrà validato al salvataggio.</small>}
 </td>}
 <td><input aria-label={`Note riga ${index+1}`} className="form-control" value={line.notes??""} onChange={e=>update(index,{notes:e.target.value})}/></td>
 <td><button type="button" className="btn btn-outline-danger btn-sm" aria-label={`Rimuovi riga ${index+1}`} disabled={lines.length===1} onClick={()=>{onChange(lines.filter((_,i)=>i!==index));setSelection({});}}><i className="bi bi-trash"/></button></td>
 </tr>;})}</tbody></table></div>
 <button type="button" className="btn btn-outline-secondary" onClick={()=>onChange([...lines,{position:lines.length,description:"",quantity:1,unit:"pz",project_id:projectId??null,notes:null,unit_price:0,discount:0,vat_rate:0}])}><i className="bi bi-plus-lg me-2"/>Aggiungi riga</button>
 </>;
}
