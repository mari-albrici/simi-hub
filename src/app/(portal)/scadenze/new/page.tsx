import { requirePagePermission } from "@/lib/permissions";
import { ManualForm } from "../manual-form";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){await requirePagePermission("deadline.write");const p=await searchParams;return <><h1 className="h3">Nuova scadenza manuale</h1><ManualForm record={{project_id:p.project,legal_entity_id:p.entity}}/></>;}
