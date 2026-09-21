"use client";
import { useActionState, useState, useTransition } from "react";
import { saveTaskAction, searchWorkSources } from "@/lib/work/actions";
import { priorities, taskStates, sourceLabels, type LinkedRecord, type SourceKind, type Task } from "@/lib/work/model";
import { statusLabel } from "@/lib/status";
import { SubmitButton } from "@/components/ui/submit-button";

export type TaskFormProps={task?:Task;initial?:{title?:string;priority?:string;due_date?:string;anomaly_id?:string;entityId?:string;links?:LinkedRecord[]};entities:{id:string;business_name:string}[];profiles:{id:string;first_name:string|null;last_name:string|null}[];kinds:SourceKind[];userId:string;canAssign:boolean};
export function TaskForm({task,initial,entities,profiles,kinds,userId,canAssign}:TaskFormProps){
 const [state,action]=useActionState(saveTaskAction,{error:null});
 const [links,setLinks]=useState<LinkedRecord[]>(task?.links??initial?.links??[]);
 const [kind,setKind]=useState<SourceKind>(kinds[0]??"project"),[query,setQuery]=useState("");
 const [results,setResults]=useState<LinkedRecord[]>([]),[searchError,setSearchError]=useState<string|null>(null),[pending,startTransition]=useTransition();
 return <form action={action} className="app-card p-3">
  {state.error&&<div className="alert alert-danger" role="alert">{state.error}</div>}
  <input type="hidden" name="id" value={task?.id??""}/><input type="hidden" name="revision" value={task?.revision??0}/><input type="hidden" name="anomaly_id" value={task?.anomaly_id??initial?.anomaly_id??""}/><input type="hidden" name="records" value={JSON.stringify(links.map(({kind,id})=>({kind,id})))}/>
  <div className="row g-3">
   <div className="col-md-8"><label className="form-label" htmlFor="task-title">Titolo</label><input id="task-title" name="title" className="form-control" required maxLength={240} defaultValue={task?.title??initial?.title}/></div>
   <div className="col-md-4"><label className="form-label" htmlFor="task-entity">Società SIMI</label><select id="task-entity" name="legal_entity_id" className="form-select" required defaultValue={task?.legal_entity_id??initial?.entityId??""}><option value="">Seleziona</option>{entities.map(e=><option key={e.id} value={e.id}>{e.business_name}</option>)}</select></div>
   <div className="col-12"><label className="form-label" htmlFor="task-description">Descrizione</label><textarea id="task-description" name="description" className="form-control" rows={3} maxLength={10000} defaultValue={task?.description??""}/></div>
   <div className="col-md-3"><label className="form-label" htmlFor="task-status">Stato</label><select id="task-status" name="status" className="form-select" defaultValue={task?.status??"todo"}>{taskStates.map(s=><option key={s} value={s}>{statusLabel("task",s)}</option>)}</select></div>
   <div className="col-md-3"><label className="form-label" htmlFor="task-priority">Priorità</label><select id="task-priority" name="priority" className="form-select" defaultValue={task?.priority??initial?.priority??"medium"}>{priorities.map(s=><option key={s} value={s}>{statusLabel("priority",s)}</option>)}</select></div>
   <div className="col-md-3"><label className="form-label" htmlFor="task-assigned">Responsabile</label><select id="task-assigned" name={canAssign?"assigned_to":undefined} className="form-select" disabled={!canAssign} defaultValue={task?.assigned_to??userId}><option value="">Non assegnata</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select>{!canAssign&&<input type="hidden" name="assigned_to" value={task?task.assigned_to??"":userId}/>}</div>
   <div className="col-md-3"><label className="form-label" htmlFor="task-due">Scadenza</label><input id="task-due" name="due_date" type="date" className="form-control" defaultValue={task?.due_date??initial?.due_date??""}/></div>
   <div className="col-12"><label className="form-label" htmlFor="task-notes">Note</label><textarea id="task-notes" name="notes" className="form-control" rows={2} maxLength={10000} defaultValue={task?.notes??""}/></div>
   <div className="col-12"><h2 className="h6">Record collegati</h2>
    {links.map(l=><div className="d-flex gap-2 align-items-center mb-2" key={`${l.kind}:${l.id}`}><span>{sourceLabels[l.kind]} · {l.label}</span><button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`Rimuovi ${l.label}`} onClick={()=>setLinks(links.filter(x=>x!==l))}><i className="bi bi-x-lg"/></button></div>)}
    <div className="d-flex gap-2 flex-wrap"><select aria-label="Tipo record" className="form-select w-auto" value={kind} onChange={e=>{setKind(e.target.value as SourceKind);setResults([]);}}>{kinds.map(k=><option key={k} value={k}>{sourceLabels[k]}</option>)}</select><input aria-label="Cerca record" className="form-control w-auto" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Numero o nome"/><button type="button" className="btn btn-outline-secondary" disabled={pending} onClick={()=>startTransition(async()=>{const r=await searchWorkSources(kind,query);setResults(r.records);setSearchError(r.error??(r.records.length?null:"Nessun record trovato."));})}>{pending?"Ricerca…":"Cerca"}</button></div>
    {searchError&&<p role="status" className="mt-2">{searchError}</p>}
    <div className="list-group mt-2" aria-busy={pending}>{results.filter(r=>!links.some(l=>l.kind===r.kind&&l.id===r.id)).map(r=><button key={r.id} type="button" className="list-group-item list-group-item-action" onClick={()=>{setLinks([...links,r]);setResults([]);}}>{r.label}</button>)}</div>
   </div>
   <div className="col-12"><SubmitButton className="btn btn-primary" pendingLabel="Salvataggio…">Salva attività</SubmitButton></div>
  </div>
 </form>;
}
