import "server-only";
import { z } from "zod";
import { authorizedClient } from "@/lib/permissions";
import { AppError, checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { managementConsumableItemSchema, managementConsumableMovementSchema, uuidSchema } from "@/lib/validations";

export type ConsumableItem = z.output<typeof managementConsumableItemSchema> & { id: string };
export type ConsumableStock = {
  id: string; container_id: string; item_id: string; item_code: string; name: string;
  unit: ConsumableItem["unit"]; currency: string; quantity: number; unit_cost: number | null; stock_value: number | null; is_active: boolean;
};
export type ConsumableMovement = { id: string; item_id: string; movement_type: "load" | "transfer" | "consumption" | "adjustment";
  quantity: number; unit_cost: number; amount: number; currency: string; from_container_id: string | null;
  to_container_id: string | null; project_id: string | null; movement_date: string; notes: string | null;
  item: { item_code: string; name: string; unit: ConsumableItem["unit"] } | null;
};
function check(error: { code?: string; message: string } | null) {
  if (error?.code === "22023" && ["Giacenza insufficiente.", "Articolo non disponibile.", "Container non disponibile.", "Commessa non disponibile.",
    "Quantità o data non valida.", "Destinazioni o motivazione del movimento non valide.", "Costo unitario non valido.",
    "Costo unitario non disponibile: effettuare prima un carico.", "Unità e valuta non modificabili dopo il primo movimento."].includes(error.message)) throw new AppError("validation", error.message);
  checkDatabase(error, "Gestione consumabili");
}
export async function getConsumableItems(): Promise<ConsumableItem[]> {
  const db = await authorizedClient("management.read");
  return await readAll((a, b) => db.from("management_consumable_items").select("*").order("item_code").order("id").range(a, b)) as ConsumableItem[];
}
export async function saveConsumableItem(input: z.input<typeof managementConsumableItemSchema>, id?: string) {
  const db = await authorizedClient("management.update");
  const value = managementConsumableItemSchema.parse(input);
  const result = id ? await db.from("management_consumable_items").update(value).eq("id", uuidSchema.parse(id)).select("id").maybeSingle()
    : await db.from("management_consumable_items").insert(value).select("id").single();
  check(result.error);
  if (!result.data) throw new AppError("conflict", "Articolo non trovato.");
}
export async function deactivateConsumableItem(id: string) {
  const db = await authorizedClient("management.update");
  const result = await db.from("management_consumable_items").update({ is_active: false }).eq("id", uuidSchema.parse(id)).select("id").maybeSingle();
  check(result.error);
  if (!result.data) throw new AppError("conflict", "Articolo non trovato.");
}
export async function getContainerConsumables(containerId: string): Promise<ConsumableStock[]> {
  const db = await authorizedClient("management.read");
  const id = uuidSchema.parse(containerId);
  return await readAll((a, b) => db.from("management_consumable_stock_details").select("*").eq("container_id", id).order("item_code").order("id").range(a, b)) as ConsumableStock[];
}
export async function getConsumableMovements(containerId: string): Promise<ConsumableMovement[]> {
  const db = await authorizedClient("management.read");
  const id = uuidSchema.parse(containerId);
  const rows = await readAll((a, b) => db.from("management_consumable_movements").select("*,item:management_consumable_items(item_code,name,unit)")
    .or(`from_container_id.eq.${id},to_container_id.eq.${id}`).order("movement_date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b));
  return rows.map(row => ({ ...row, item: (Array.isArray(row.item) ? row.item[0] : row.item) ?? null })) as ConsumableMovement[];
}
type MovementInput = z.input<typeof managementConsumableMovementSchema>;
async function record(input: MovementInput, type: MovementInput["movement_type"]) {
  const db = await authorizedClient("management.update");
  const v = managementConsumableMovementSchema.parse({ ...input, movement_type: type });
  const result = await db.rpc("record_consumable_movement", { p_item_id: v.item_id, p_type: v.movement_type,
    p_from: v.from_container_id, p_to: v.to_container_id, p_project: v.project_id, p_quantity: v.quantity,
    p_unit_cost: v.unit_cost, p_date: v.movement_date, p_notes: v.notes });
  check(result.error);
}
export async function loadConsumable(input: MovementInput) { return record(input, "load"); }
export async function transferConsumable(input: MovementInput) { return record(input, "transfer"); }
export async function consumeConsumable(input: MovementInput) { return record(input, "consumption"); }
export async function adjustConsumable(input: MovementInput) { return record(input, "adjustment"); }
export async function getConsumptionTotals() {
  const db = await authorizedClient("management.read");
  const result = await db.rpc("management_consumption_summary"); check(result.error);
  return (result.data ?? []) as { currency: string; total_consumption: number }[];
}
