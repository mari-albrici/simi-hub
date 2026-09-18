import { CommercialDetail } from "@/components/commercial/detail";
export default async function Page({params}:{params:Promise<{id:string}>}){return <CommercialDetail kind="order" id={(await params).id}/>;}
