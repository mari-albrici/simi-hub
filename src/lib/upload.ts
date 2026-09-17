"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const file = formData.get("file");

  if (!supabase) {
    redirect(`/documenti?error=${encodeURIComponent("Upload non disponibile: configurazione Supabase mancante.")}`);
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/documenti?error=${encodeURIComponent("Seleziona un file valido.")}`);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storedFilename = `${Date.now()}-${safeName}`;
  const storagePath = `documents/${storedFilename}`;

  const { error: uploadError } = await supabase.storage.from("simi-documents").upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) {
    redirect(`/documenti?error=${encodeURIComponent(`Caricamento fallito: ${uploadError.message}`)}`);
  }

  const { data: userData } = await supabase.auth.getUser();

  const { error: insertError } = await supabase.from("documents").insert({
    original_filename: file.name,
    stored_filename: storedFilename,
    storage_path: storagePath,
    mime_type: file.type || null,
    file_size: file.size,
    status: "draft",
    created_by: userData?.user?.id ?? null,
  });

  if (insertError) {
    redirect(`/documenti?error=${encodeURIComponent(`File caricato ma metadati non salvati: ${insertError.message}`)}`);
  }

  revalidatePath("/documenti");
  redirect(`/documenti?success=${encodeURIComponent("Documento caricato.")}`);
}

export async function updateDocumentAction(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const id = String(formData.get("id") ?? "");

  if (!supabase || !id) {
    redirect(`/documenti?error=${encodeURIComponent("Aggiornamento non riuscito.")}`);
  }

  const title = String(formData.get("title") ?? "").trim();
  const expiryDate = String(formData.get("expiry_date") ?? "").trim();

  const { error } = await supabase
    .from("documents")
    .update({
      title: title || null,
      expiry_date: expiryDate || null,
    })
    .eq("id", id);

  if (error) {
    redirect(`/documenti?error=${encodeURIComponent(`Aggiornamento fallito: ${error.message}`)}`);
  }

  revalidatePath("/documenti");
  redirect(`/documenti?success=${encodeURIComponent("Documento aggiornato.")}`);
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const id = String(formData.get("id") ?? "");

  if (!supabase || !id) {
    redirect(`/documenti?error=${encodeURIComponent("Eliminazione non riuscita.")}`);
  }

  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", id).maybeSingle();

  if (doc?.storage_path) {
    await supabase.storage.from("simi-documents").remove([String(doc.storage_path)]);
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);

  if (error) {
    redirect(`/documenti?error=${encodeURIComponent(`Eliminazione fallita: ${error.message}`)}`);
  }

  revalidatePath("/documenti");
  redirect(`/documenti?success=${encodeURIComponent("Documento eliminato.")}`);
}
