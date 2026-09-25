"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  archiveFolder,
  createFolder,
  moveFolder,
  renameFolder,
} from "@/lib/folders";


function parseNullableId(
  value: FormDataEntryValue | null,
): string | null {
  const parsed = String(value ?? "").trim();

  return parsed.length > 0
    ? parsed
    : null;
}


function returnToDirectory(
  folderId: string | null,
): never {
  if (folderId) {
    redirect(
      `/documenti?folder=${encodeURIComponent(folderId)}`,
    );
  }

  redirect("/documenti");
}


/* ============================================================
 * CREATE
 * ============================================================ */

export async function createFolderAction(
  formData: FormData,
): Promise<void> {
  const name = String(
    formData.get("name") ?? "",
  ).trim();

  const parentId = parseNullableId(
    formData.get("parent_id"),
  );

  await createFolder({
    name,
    module: "documents",
    parentId,
  });

  revalidatePath("/documenti");

  returnToDirectory(parentId);
}


/* ============================================================
 * RENAME
 * ============================================================ */

export async function renameFolderAction(
  formData: FormData,
): Promise<void> {
  const folderId = String(
    formData.get("folder_id") ?? "",
  ).trim();

  const name = String(
    formData.get("name") ?? "",
  ).trim();

  const currentFolderId =
    parseNullableId(
      formData.get("current_folder_id"),
    );

  await renameFolder(
    folderId,
    name,
  );

  revalidatePath("/documenti");

  returnToDirectory(
    currentFolderId,
  );
}


/* ============================================================
 * MOVE
 * ============================================================ */

export async function moveFolderAction(
  formData: FormData,
): Promise<void> {
  const folderId = String(
    formData.get("folder_id") ?? "",
  ).trim();

  const destinationFolderId =
    parseNullableId(
      formData.get("destination_folder_id"),
    );

  const currentFolderId =
    parseNullableId(
      formData.get("current_folder_id"),
    );

  await moveFolder(
    folderId,
    destinationFolderId,
  );

  revalidatePath("/documenti");

  returnToDirectory(
    currentFolderId,
  );
}


/* ============================================================
 * ARCHIVE / DELETE
 * ============================================================ */

export async function archiveFolderAction(
  formData: FormData,
): Promise<void> {
  const folderId = String(
    formData.get("folder_id") ?? "",
  ).trim();

  const currentFolderId =
    parseNullableId(
      formData.get("current_folder_id"),
    );

  await archiveFolder(
    folderId,
  );

  revalidatePath("/documenti");

  returnToDirectory(
    currentFolderId,
  );
}