"use server";
import { revalidatePath } from "next/cache";
import { publicError } from "@/lib/errors";
import { parseMonetaryAmount } from "@/lib/money";
import { managementContainerSchema, managementContainerMovementSchema, managementContainerAssetSchema,
  managementContainerAssetRemovalSchema, uuidSchema } from "@/lib/validations";
import { createManagementContainer, updateManagementContainer, moveManagementContainer, addAssetToContainer, removeAssetFromContainer } from "@/lib/management-containers";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
function money(form: FormData, key: string) { const raw = text(form, key); return raw ? parseMonetaryAmount(raw) ?? NaN : null; }
function refresh() { revalidatePath("/container"); revalidatePath("/attrezzature"); }
export async function saveManagementContainerAction(_state: { error: string | null; success: boolean }, form: FormData) {
  try {
    const input = managementContainerSchema.parse({ container_code: text(form, "container_code"), name: text(form, "name"),
      description: text(form, "description"), ownership_type: text(form, "ownership_type"), purchase_date: text(form, "purchase_date"),
      purchase_cost: money(form, "purchase_cost"), currency: text(form, "currency"), status: text(form, "status"), notes: text(form, "notes") });
    if (form.get("id")) await updateManagementContainer(uuidSchema.parse(form.get("id")), input);
    else await createManagementContainer(input);
    refresh(); return { error: null, success: true };
  } catch (error) { return { error: publicError(error).message, success: false }; }
}
export async function managementContainerOperationAction(_state: { error: string | null; success: boolean }, form: FormData) {
  try {
    if (form.get("operation") === "move") {
      await moveManagementContainer(managementContainerMovementSchema.parse({ container_id: form.get("container_id"),
        to_project_id: text(form, "to_project_id"), movement_date: text(form, "movement_date"), transport_cost: money(form, "transport_cost"),
        currency: text(form, "currency"), notes: text(form, "notes") }));
    } else if (form.get("operation") === "remove") {
      await removeAssetFromContainer(managementContainerAssetRemovalSchema.parse({ id: form.get("id"), date_out: form.get("date_out") }));
    } else {
      await addAssetToContainer(managementContainerAssetSchema.parse({ container_id: form.get("container_id"), asset_id: form.get("asset_id"),
        date_in: form.get("date_in"), notes: text(form, "notes") }));
    }
    refresh(); return { error: null, success: true };
  } catch (error) { return { error: publicError(error).message, success: false }; }
}
