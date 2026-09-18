import Link from "next/link";
export function UploadDocumentTrigger({context={}}:{context?:Record<string,string>}){
 return <Link href={`/documenti/new?${new URLSearchParams(context)}`} className="btn btn-primary flex-shrink-0"><i className="bi bi-upload me-2"/>Carica documento</Link>;
}
