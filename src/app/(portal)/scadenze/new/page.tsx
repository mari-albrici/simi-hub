import { requirePagePermission } from "@/lib/permissions";
import { ManualForm } from "../manual-form";
export default async function Page(){await requirePagePermission("deadline.write");return <><h1 className="h3">Nuova scadenza manuale</h1><ManualForm/></>;}
