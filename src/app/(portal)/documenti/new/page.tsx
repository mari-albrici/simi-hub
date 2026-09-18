import { getCommercial } from "@/lib/commercial";
import { requirePagePermission } from "@/lib/permissions";
import { documentOptions } from "@/lib/documents";
import { UploadDocumentForm } from "@/components/documents/upload-document-form";
import { hasPermission } from "@/lib/auth";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const user=await requirePagePermission("document.upload"),options=await documentOptions(),p=await searchParams;
 const kind=p.order?"order":p.delivery_note?"delivery_note":null;
 const pipelineKind=p.offer?"offer":p.contract?"contract":null;
 const cycle=kind?await getCommercial(kind,p[kind]!):null;
 if(pipelineKind && !p.category_id) p.category_id=options.categories.find(c=>c.code===(pipelineKind==="offer"?"02":"01"))?.id??"";
 if(cycle){await requirePagePermission(`${kind!}.update`);p.entity=cycle.legal_entity_id;p.category_id=options.categories.find(c=>c.code===(kind==="order"?"01":"06"))?.id??"";p.title=`${kind==="order"?"Ordine":"DDT"} ${cycle.order_number??cycle.note_number}`;p.document_date=cycle.order_date??cycle.note_date??"";}
 const employee=p.employee?await (await import("@/lib/permissions")).authorizedClient("employee.hr.read").then(db=>db.from("employees").select("legal_entity_id").eq("id",p.employee).maybeSingle()):null;
 if(p.employee){p.category_id=options.categories.find(c=>c.code==="HR-IDENTITY")?.id??p.category_id;p.access_scope="hr";}
 const entity=p.entity||employee?.data?.legal_entity_id||options.projects.find(x=>x.id===p.project)?.legal_entity_id||options.invoices.find(x=>x.id===p.invoice)?.legal_entity_id||"";
 const scopes=["general",...(["admin","administration","management"].includes(user.role)?["restricted"]:[]),...(hasPermission(user.role,"employee.hr.read")?["hr"]:[])];
 return <><h1 className="h3">Carica documento</h1><UploadDocumentForm options={options} values={{...p,legal_entity_id:entity}} scopes={scopes}/></>;
}
