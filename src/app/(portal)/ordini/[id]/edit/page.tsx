import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/permissions";
import { getCommercial,commercialOptions } from "@/lib/commercial";
import { OrderForm } from "../../order-form";
export default async function Edit({params}:{params:Promise<{id:string}>}){
 await requirePagePermission("order.update");const id=(await params).id;const record=await getCommercial("order",id);if(!record||record.archived_at)notFound();
 return <><Link href={`/ordini/${id}`}>← Dettaglio</Link><h1 className="h3 my-3">Modifica {record.order_number??record.note_number}</h1><OrderForm options={await commercialOptions()} record={record}/></>;
}
