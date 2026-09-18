"use client";
import { useActionState, startTransition } from "react";
import Link from "next/link";
import { uploadDocumentAction,type UploadState } from "@/lib/upload";
import { DocumentFields,ContextFields,type DocumentOptions } from "./document-fields";
export function UploadDocumentForm({options,values={},scopes,documentId}:{options:DocumentOptions;values?:Record<string,unknown>;scopes:string[];documentId?:string}){
 const [state,action,pending]=useActionState<UploadState,FormData>(uploadDocumentAction,{});
 return <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget,(event.nativeEvent as SubmitEvent).submitter);startTransition(()=>action(form));}} className="row g-3">
 {["order","delivery_note","offer","contract","employee"].map(key=>values[key]?<input key={key} type="hidden" name={key} value={String(values[key])}/>:null)}
 {documentId?<input type="hidden" name="document_id" value={documentId}/>:<><DocumentFields options={options} values={values} scopes={scopes}/><ContextFields options={options} values={values}/></>}
 <div className="col-12"><label className="form-label" htmlFor="file">File originale — PDF, JPEG, PNG, WebP · massimo 10 MB</label><input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="form-control" required/></div>
 <div className="col-md-6"><label className="form-label" htmlFor="version_label">Etichetta versione (es. firmata)</label><input id="version_label" name="version_label" className="form-control" maxLength={200}/></div>
 <div className="col-md-6"><label className="form-label" htmlFor="version_notes">Note versione</label><input id="version_notes" name="version_notes" className="form-control" maxLength={2000}/></div>
 {state.error&&<div className="col-12"><p className="alert alert-danger" role="alert">{state.error}</p></div>}
 {state.duplicates&&<div className="col-12"><div className="alert alert-warning"><strong>Questo file risulta già presente nell&apos;archivio.</strong><ul>{state.duplicates.map(d=><li key={d.id}><Link href={`/documenti/${d.id}`}>{d.title}</Link> — {d.where}{d.archived&&" · Archiviato"}{!documentId&&!d.archived&&<button className="btn btn-sm btn-outline-dark ms-2" name="intent" value={`reuse:${d.id}`} disabled={pending} formNoValidate>Usa questo documento e aggiungi i collegamenti</button>}</li>)}</ul><p className="small">Il riuso conserva i metadata esistenti e aggiunge soltanto i collegamenti selezionati.</p><label className="form-check"><input className="form-check-input" type="checkbox" name="acknowledge_duplicate" value="1"/>Confermo che serve un nuovo file/versione con lo stesso contenuto.</label></div></div>}
 <div className="col-12"><button className="btn btn-dark" disabled={pending} aria-busy={pending}>{pending?"Caricamento…":documentId?"Carica nuova versione":"Carica documento"}</button></div>
 </form>;
}
