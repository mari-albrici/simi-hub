import type { documentOptions } from "@/lib/documents";
export type DocumentOptions=Awaited<ReturnType<typeof documentOptions>>;
export function ContextFields({options,values={}}:{options:DocumentOptions;values?:Record<string,unknown>}){
 return <>{[["project","Commessa",options.projects.map(x=>({id:x.id,label:x.project_code}))],["company","Controparte",options.companies.map(x=>({id:x.id,label:x.business_name}))],["invoice","Fattura",options.invoices.map(x=>({id:x.id,label:x.invoice_number}))]].map(([key,label,rows])=>{const name=String(key);return <div className="col-md-4" key={name}><label className="form-label" htmlFor={name}>{String(label)}</label><select id={name} name={name} defaultValue={String(values[name]||"")} className="form-select"><option value="">Nessun collegamento</option>{(rows as {id:string;label:string}[]).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></div>;})}</>;
}
export function DocumentFields({options,values={},scopes=["general"]}:{options:DocumentOptions;values?:Record<string,unknown>;scopes?:string[]}){
 const value=(name:string,fallback="")=>String(values[name]??fallback);
 const select=(name:string,label:string,rows:{id:string;label:string}[],required=false,fallback="")=><div className="col-md-4" key={name}><label className="form-label" htmlFor={name}>{label}</label><select id={name} name={name} className="form-select" defaultValue={value(name,fallback)} required={required}><option value="">—</option>{rows.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></div>;
 return <>
 {[["title","Titolo","text"],["reference","Numero / riferimento","text"],["document_date","Data documento","date"],["expiry_date","Scadenza","date"],["country","Paese","text"],["language","Lingua","text"]].map(([name,label,type])=><div className="col-md-4" key={name}><label className="form-label" htmlFor={name}>{label}</label><input className="form-control" id={name} name={name} type={type} required={name==="title"} defaultValue={value(name)}/></div>)}
 {select("legal_entity_id","Società SIMI",options.entities.map(x=>({id:x.id,label:x.business_name})),true)}
 {select("category_id","Categoria / sottocategoria",options.categories.filter(x=>x.active||x.id===values.category_id).map(x=>({id:x.id,label:`${x.code} — ${x.name}`})))}
 {select("assigned_to","Responsabile",options.profiles.map(x=>({id:x.id,label:[x.first_name,x.last_name].filter(Boolean).join(" ")||x.id})))}
 {select("status","Stato",[{id:"draft",label:"Bozza"},{id:"valid",label:"Valido"},{id:"superseded",label:"Sostituito"}],true,"valid")}
 {select("access_scope","Visibilità",scopes.map(id=>({id,label:({general:"Standard",restricted:"Riservato",hr:"HR"} as Record<string,string>)[id]})),true,"general")}
 {[['description','Descrizione'],['notes','Note']].map(([name,label])=><div className="col-md-6" key={name}><label className="form-label" htmlFor={name}>{label}</label><textarea id={name} name={name} className="form-control" defaultValue={value(name)}/></div>)}
 </>;
}
