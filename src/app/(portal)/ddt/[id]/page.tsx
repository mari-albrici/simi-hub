import { CommercialDetail } from "@/components/commercial/detail";
export default async function Page({params}:{params:Promise<{id:string}>}){return <CommercialDetail kind="delivery_note" id={(await params).id}/>;}
