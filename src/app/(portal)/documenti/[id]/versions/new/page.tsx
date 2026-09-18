import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/permissions";
import { documentOptions,getArchiveDocument } from "@/lib/documents";
import { UploadDocumentForm } from "@/components/documents/upload-document-form";
export default async function Page({params}:{params:Promise<{id:string}>}){await requirePagePermission("document.upload");await requirePagePermission("document.update");const {id}=await params;const doc=await getArchiveDocument(id);if(!doc||doc.archived_at)notFound();return <><h1 className="h3">Nuova versione — {doc.title||doc.original_filename}</h1><p className="text-muted">Il file corrente resta disponibile fino alla finalizzazione. Le versioni precedenti sono conservate.</p><UploadDocumentForm options={await documentOptions()} documentId={id} scopes={[]}/></>;}
