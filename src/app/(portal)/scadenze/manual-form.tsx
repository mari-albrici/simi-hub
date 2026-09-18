import { SubmitButton } from "@/components/ui/submit-button";
import { deadlineOptions } from "@/lib/deadlines";
import { priorityLabels } from "@/lib/deadline-validation";
import { saveDeadline } from "./actions";
export async function ManualForm({record={},disabled=false}:{record?:Record<string,unknown>;disabled?:boolean}){
 const o=await deadlineOptions();const val=(key:string,fallback="")=>String(record[key]??fallback);
 const select=(name:string,label:string,options:{id:string;label:string}[],required=false)=><div className="col-md-6" key={name}><label className="form-label" htmlFor={name}>{label}</label><select id={name} name={name} className="form-select" defaultValue={val(name,name==="priority"?"medium":name==="status"?"open":name==="category_code"?"administrative":"")} required={required}><option value="">—</option>{options.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></div>;
 return <form action={saveDeadline}><fieldset disabled={disabled}><input type="hidden" name="id" value={val("id")}/><div className="row g-3">
 {[["title","Titolo","text"],["due_date","Data","date"],["due_time","Ora","time"]].map(([name,label,type])=><div className="col-md-4" key={name}><label className="form-label" htmlFor={name}>{label}</label><input id={name} name={name} type={type} className="form-control" defaultValue={val(name)} required={name!=="due_time"}/></div>)}
 {select("legal_entity_id","Società SIMI",o.entities.map(x=>({id:x.id,label:x.business_name})),true)}
 {select("category_code","Categoria",o.categories.map(x=>({id:x.code,label:x.name})),true)}
 {select("priority","Priorità",Object.entries(priorityLabels).map(([id,label])=>({id,label})),true)}
 {select("status","Stato",[{id:"open",label:"Aperta"},{id:"completed",label:"Completata"}],true)}
 {select("project_id","Commessa",o.projects.map(x=>({id:x.id,label:x.project_code})))}
 {select("company_id","Controparte",o.companies.map(x=>({id:x.id,label:x.business_name})))}
 {select("document_id","Documento",o.documents.map(x=>({id:x.id,label:x.title||x.original_filename})))}
 {select("assigned_to","Responsabile",o.profiles.map(x=>({id:x.id,label:[x.first_name,x.last_name].filter(Boolean).join(" ")||x.id})))}
 {[['description','Descrizione'],['notes','Note']].map(([name,label])=><div key={name} className="col-12"><label className="form-label" htmlFor={name}>{label}</label><textarea id={name} name={name} className="form-control" defaultValue={val(name)}/></div>)}
 </div>{!disabled&&<SubmitButton className="btn btn-primary mt-3" pendingLabel="Salvataggio…">Salva scadenza</SubmitButton>}</fieldset></form>;
}
