import { requirePagePermission } from "@/lib/permissions";
import { documentOptions } from "@/lib/documents";
import { UploadDocumentForm } from "@/components/documents/upload-document-form";
import { hasPermission } from "@/lib/auth";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const user=await requirePagePermission("document.upload"),options=await documentOptions(),p=await searchParams;
 const entity=p.entity||options.projects.find(x=>x.id===p.project)?.legal_entity_id||options.invoices.find(x=>x.id===p.invoice)?.legal_entity_id||"";
 const scopes=["general",...(["admin","administration","management"].includes(user.role)?["restricted"]:[]),...(hasPermission(user.role,"employee.read")?["hr"]:[])];
 return <><h1 className="h3">Carica documento</h1><UploadDocumentForm options={options} values={{...p,legal_entity_id:entity}} scopes={scopes}/></>;
}
