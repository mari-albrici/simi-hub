"use server";
import { revalidatePath } from "next/cache";
import { publicError } from "@/lib/errors";
import { managementConsumableItemSchema, managementConsumableMovementSchema, uuidSchema } from "@/lib/validations";
import { saveConsumableItem, deactivateConsumableItem, loadConsumable, transferConsumable, consumeConsumable, adjustConsumable } from "@/lib/management-consumables";
const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
function decimal(f: FormData, key: string) { const value = text(f, key); return value ? /^\d+(?:[.,]\d+)?$/.test(value) ? Number(value.replace(",", ".")) : NaN : null; }
function refresh() { revalidatePath("/consumabili"); revalidatePath("/container"); revalidatePath("/costi-gestionali"); revalidatePath("/commesse/[id]", "page"); }
export async function saveConsumableItemAction(_state: { error: string | null; success: boolean }, f: FormData) {
  try {
    if (f.get("operation") === "deactivate") await deactivateConsumableItem(uuidSchema.parse(f.get("id")));
    else {
      const value = managementConsumableItemSchema.parse({ item_code: text(f, "item_code"), name: text(f, "name"), description: text(f, "description"),
        category: text(f, "category"), unit: text(f, "unit"), default_unit_cost: decimal(f, "default_unit_cost"),
        currency: text(f, "currency"), is_active: f.get("is_active") === "on", notes: text(f, "notes") });
      await saveConsumableItem(value, f.get("id") ? uuidSchema.parse(f.get("id")) : undefined);
    }
    refresh(); return { error: null, success: true };
  } catch (error) { return { error: publicError(error).message, success: false }; }
}
export async function consumableMovementAction(_state: { error: string | null; success: boolean }, f: FormData) {
  try {
    const type = text(f, "movement_type"); const container = uuidSchema.parse(f.get("container_id"));
    const increase = type === "load" || (type === "adjustment" && f.get("direction") === "increase");
    const value = managementConsumableMovementSchema.parse({ item_id: f.get("item_id"), movement_type: type,
      from_container_id: increase ? null : container, to_container_id: increase ? container : type === "transfer" ? f.get("to_container_id") : null,
      project_id: type === "consumption" ? f.get("project_id") : null, quantity: decimal(f, "quantity"),
      unit_cost: type === "load" ? decimal(f, "unit_cost") : null, movement_date: text(f, "movement_date"), notes: text(f, "notes") });
    await ({ load: loadConsumable, transfer: transferConsumable, consumption: consumeConsumable, adjustment: adjustConsumable })[value.movement_type](value);
    refresh(); return { error: null, success: true };
  } catch (error) { return { error: publicError(error).message, success: false }; }
}
