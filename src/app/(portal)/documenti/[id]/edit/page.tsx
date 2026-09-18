import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/permissions";
import { documentOptions,getArchiveDocument } from "@/lib/documents";
import { DocumentFields } from "@/components/documents/document-fields";
import { updateDocumentAction } from "@/lib/upload";
import { hasPermission } from "@/lib/auth";
import { SubmitButton } from "@/components/ui/submit-button";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const user=await requirePagePermission("document.update"),{id}=await params,doc=await getArchiveDocument(id);if(!doc||doc.archived_at)notFound();
 const scopes=["general",...(["admin","administration","management"].includes(user.role)?["restricted"]:[]),...(hasPermission(user.role,"employee.read")?["hr"]:[])];
 return <><h1 className="h3">Modifica documento</h1><form action={updateDocumentAction} className="row g-3"><input type="hidden" name="id" value={id}/><input type="hidden" name="expected_updated_at" value={doc.updated_at}/><DocumentFields options={await documentOptions()} values={{...doc}} scopes={scopes}/><div className="col-12"><SubmitButton>Salva metadata</SubmitButton></div></form></>;
}
