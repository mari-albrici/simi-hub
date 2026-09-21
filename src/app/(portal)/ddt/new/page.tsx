import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/permissions";
import { commercialOptions,getCommercial } from "@/lib/commercial";
import { DeliveryNoteForm } from "../delivery-note-form";
export default async function NewDdt({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 await requirePagePermission("delivery_note.create");const p=await searchParams;const source=p.order?await getCommercial("order",p.order):undefined;
 if(p.order&&(!source||source.archived_at||["draft","cancelled"].includes(source.status??"")))notFound();
 return <><Link href={source?`/ordini/${source.id}`:"/ddt"}>← {source?"Ordine":"DDT"}</Link><h1 className="h3 my-3">Nuovo DDT</h1><DeliveryNoteForm options={await commercialOptions()} projectId={p.project} source={source??undefined}/></>;
}
