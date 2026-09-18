import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { authorizedClient,requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { checkDatabase } from "@/lib/errors";
import { z } from "zod";
import { ManualForm } from "../manual-form";
import { archiveDeadline } from "../actions";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const user=await requirePagePermission("deadline.read"),{id}=await params;if(!z.uuid().safeParse(id).success)notFound();
 const db=await authorizedClient("deadline.read"),r=await db.from("deadlines").select("*").eq("id",id).is("invoice_id",null).maybeSingle();checkDatabase(r.error);if(!r.data)notFound();
 const writable=hasPermission(user.role,"deadline.write")&&!r.data.archived_at;
 return <><Link href="/scadenze">Scadenze</Link><h1 className="h3 my-3">{r.data.title}</h1>{r.data.archived_at&&<p className="alert alert-secondary">Archiviata</p>}<ManualForm record={r.data} disabled={!writable}/>{writable&&<form action={archiveDeadline} className="mt-4"><input type="hidden" name="id" value={id}/><ConfirmSubmitButton confirmMessage="Archiviare questa scadenza?" className="btn btn-outline-secondary"><i className="bi bi-archive me-2"/>Archivia scadenza</ConfirmSubmitButton></form>}</>;
}
