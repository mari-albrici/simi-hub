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
  redirect("/documenti");
}
