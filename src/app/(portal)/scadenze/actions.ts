"use server";
import { authorizedClient } from "@/lib/permissions";
import { manualDeadlineSchema } from "@/lib/deadline-validation";
import { checkDatabase, publicError } from "@/lib/errors";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function saveDeadline(form:FormData){
 try{
 const db=await authorizedClient("deadline.write"),id=form.get("id");
 const payload=manualDeadlineSchema.parse(Object.fromEntries(form));
 const result=id?await db.from("deadlines").update(payload).eq("id",z.uuid().parse(id)).is("invoice_id",null).is("archived_at",null).select("id").single():await db.from("deadlines").insert(payload).select("id").single();
 checkDatabase(result.error,"Salvataggio scadenza");
 }catch(e){redirect(`/scadenze?error=${encodeURIComponent(publicError(e).message)}`);}
 revalidatePath("/scadenze","layout");revalidatePath("/dashboard");redirect("/scadenze?success=Scadenza%20salvata");
}
export async function archiveDeadline(form:FormData){
 try{const db=await authorizedClient("deadline.write");const result=await db.from("deadlines").update({archived_at:new Date().toISOString()}).eq("id",z.uuid().parse(form.get("id"))).is("invoice_id",null).is("archived_at",null).select("id").single();checkDatabase(result.error);}catch(e){redirect(`/scadenze?error=${encodeURIComponent(publicError(e).message)}`);}
 revalidatePath("/scadenze","layout");revalidatePath("/dashboard");redirect("/scadenze?success=Scadenza%20archiviata");
}
