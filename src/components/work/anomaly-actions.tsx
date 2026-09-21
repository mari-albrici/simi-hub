"use client";
import { useActionState } from "react";
import { updateAnomalyAction } from "@/lib/work/actions";
import { SubmitButton } from "@/components/ui/submit-button";
export function AnomalyActionForm({id,operation,assigned,profiles=[]}:{id:string;operation:"assign"|"ignore"|"reopen";assigned?:string|null;profiles?:{id:string;first_name:string|null;last_name:string|null}[]}){
 const [state,action]=useActionState(updateAnomalyAction,{error:null});
 return <form action={action} className="d-flex gap-2 flex-wrap align-items-end my-3"><input type="hidden" name="id" value={id}/><input type="hidden" name="operation" value={operation}/>
 {state.error&&<div className="alert alert-danger w-100" role="alert">{state.error}</div>}
 {operation==="assign"&&<div><label className="form-label" htmlFor="anomaly-assignee">Responsabile</label><select id="anomaly-assignee" name="assigned_to" defaultValue={assigned??""} className="form-select"><option value="">Non assegnata</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></div>}
 {operation==="ignore"&&<div className="flex-grow-1"><label className="form-label" htmlFor="anomaly-reason">Motivazione obbligatoria</label><textarea id="anomaly-reason" name="motivation" className="form-control" required maxLength={4000}/></div>}
 <SubmitButton className="btn btn-outline-secondary" pendingLabel="Aggiornamento…">{operation==="assign"?"Assegna":operation==="ignore"?"Ignora anomalia":"Riapri anomalia"}</SubmitButton></form>;
}
