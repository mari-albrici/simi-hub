import Link from "next/link";
import { searchDocuments } from "@/lib/documents";
import { authorizedClient,getAccessScope } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { DocumentsTable } from "./documents-table";
import { UploadDocumentTrigger } from "./upload-document-trigger";
export async function ContextDocuments({project,company,invoice,entity}:{project?:string;company?:string;invoice?:string;entity?:string|null}){
 const context=Object.fromEntries(Object.entries({project,company,invoice,entity}).filter((e):e is [string,string]=>!!e[1]));
 const [result,access]=await Promise.all([searchDocuments(context),getAccessScope("document")]);
 let categories:{id:string;code:string;name:string;items:number}[]=[];
 if(project){const db=await authorizedClient("document.read");const r=await db.rpc("project_document_categories",{project});checkDatabase(r.error);categories=r.data??[];}
 return <section className="app-card p-3 my-3"><div className="d-flex justify-content-between mb-3"><h2 className="h5">Documenti ({result.count})</h2>{access.canUpload&&<UploadDocumentTrigger context={context}/>}</div>{project&&<div className="d-flex flex-wrap gap-2 mb-3">{categories.map(c=><Link key={c.id} className="btn btn-sm btn-outline-secondary" href={`/documenti?${new URLSearchParams({...context,category:c.id})}`}>{c.code} {c.name} <span className="badge text-bg-secondary">{c.items}</span></Link>)}</div>}<DocumentsTable documents={result.rows}/><Link href={`/documenti?${new URLSearchParams(context)}`}>Apri elenco completo e filtri</Link></section>;
}
