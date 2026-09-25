"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { moveDocumentToFolder } from "@/lib/documents";


function parseNullableId(
  value: FormDataEntryValue | null,
): string | null {
  const parsed = String(value ?? "").trim();

  return parsed.length > 0
    ? parsed
    : null;
}


export async function moveDocumentAction(
  formData: FormData,
): Promise<void> {
  const documentId = String(
    formData.get("document_id") ?? "",
  ).trim();

  const destinationFolderId =
    parseNullableId(
      formData.get("destination_folder_id"),
    );

  const currentFolderId =
    parseNullableId(
      formData.get("current_folder_id"),
    );

  await moveDocumentToFolder(
    documentId,
    destinationFolderId,
  );

  revalidatePath("/documenti");
  revalidatePath(
    `/documenti/${documentId}`,
  );

  if (currentFolderId) {
    redirect(
      `/documenti?folder=${encodeURIComponent(
        currentFolderId,
      )}`,
    );
  }

  redirect("/documenti");
}