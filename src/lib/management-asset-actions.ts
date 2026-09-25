"use server";
import { revalidatePath } from "next/cache";
import { publicError } from "@/lib/errors";
import { parseMonetaryAmount } from "@/lib/money";
import { uuidSchema, managementAssetSchema, managementAssetUsageSchema } from "@/lib/validations";
import { createManagementAsset, updateManagementAsset, moveManagementAsset,
  createManagementAssetUsage, updateManagementAssetUsage, cancelManagementAssetUsage } from "@/lib/management-assets";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
function value(form: FormData, key: string) {
  const raw = text(form, key);
  return raw ? parseMonetaryAmount(raw) ?? NaN : null;
}
function rate(form: FormData, key: string) {
  const raw = text(form, key);
  return raw ? /^\d+(?:[.,]\d{1,6})?$/.test(raw) ? Number(raw.replace(",", ".")) : NaN : null;
}
function refresh() {
  revalidatePath("/attrezzature"); revalidatePath("/costi-gestionali"); revalidatePath("/commesse/[id]", "page");
  revalidatePath("/container");
}
export async function saveManagementAssetAction(_state: { error: string | null; success: boolean }, form: FormData) {
  try {
    const input = { asset_code: text(form, "asset_code"), name: text(form, "name"), description: text(form, "description"),
      category: text(form, "category"), purchase_date: text(form, "purchase_date"),
      purchase_cost: value(form, "purchase_cost"), management_value: value(form, "management_value"), currency: text(form, "currency"),
      allocation_method: text(form, "allocation_method"), hourly_rate: rate(form, "hourly_rate"), daily_rate: rate(form, "daily_rate"),
      monthly_rate: rate(form, "monthly_rate"), status: text(form, "status"), notes: text(form, "notes") };
    // Parse at this boundary as well as in the data layer: never accept position in this form.
    const parsed = managementAssetSchema.parse(input);
    if (form.get("id")) await updateManagementAsset(uuidSchema.parse(form.get("id")), parsed);
    else await createManagementAsset(parsed);
    refresh(); return { error: null, success: true };
  } catch (error) { return { error: publicError(error).message, success: false }; }
}
export async function managementAssetOperationAction(_state: { error: string | null; success: boolean }, form: FormData) {
  try {
    const operation = text(form, "operation");
    if (operation === "cancel") await cancelManagementAssetUsage(uuidSchema.parse(form.get("id")));
    else if (operation === "move") await moveManagementAsset({ asset_id: uuidSchema.parse(form.get("asset_id")),
      to_project_id: text(form, "to_project_id") || null, movement_date: text(form, "movement_date"), notes: text(form, "notes") });
    else {
      const input = managementAssetUsageSchema.parse({ asset_id: form.get("asset_id"), project_id: form.get("project_id"),
        start_date: text(form, "start_date"), end_date: text(form, "end_date"), usage_quantity: value(form, "usage_quantity"),
        manual_amount: value(form, "manual_amount"), status: text(form, "status"), notes: text(form, "notes") });
      if (form.get("id")) await updateManagementAssetUsage(uuidSchema.parse(form.get("id")), input);
      else await createManagementAssetUsage(input);
    }
    refresh(); return { error: null, success: true };
  } catch (error) { return { error: publicError(error).message, success: false }; }
}
