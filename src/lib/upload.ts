"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const file = formData.get("file");

  if (!supabase || !(file instanceof File) || file.size === 0) {
    throw new Error("Upload non disponibile: config Supabase mancante o file vuoto.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storagePath = `documents/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from("simi-documents").upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  revalidatePath("/documenti");
  redirect("/documenti");
}
