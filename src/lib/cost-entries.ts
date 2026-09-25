import "server-only";

import { z } from "zod";
import { authorizedClient } from "@/lib/permissions";
import { AppError, checkDatabase } from "@/lib/errors";
import { costEntryClassificationSchema, manualCostEntrySchema, uuidSchema } from "@/lib/validations";

function checkCostEntryWrite(error: { code?: string; message: string } | null, context: string) {
  if (error?.code === "22023" && [
    "Il centro del costo è diverso dal centro del pool.",
    "La valuta del costo è diversa dalla valuta del pool.",
    "Pool non trovato o chiuso.", "Il centro del pool non è attivo.",
  ].includes(error.message)) throw new AppError("validation", error.message);
  checkDatabase(error, context);
}

export type ManagementCostCenter = {
  id: string; code: string; name: string; description: string | null;
  sort_order: number; is_active: boolean;
};

export async function getManagementCostCenters(): Promise<ManagementCostCenter[]> {
  const db = await authorizedClient("management.read");
  const result = await db.from("management_cost_centers")
    .select("id,code,name,description,sort_order,is_active").order("sort_order").order("code");
  checkDatabase(result.error, "Lettura centri di costo");
  return result.data ?? [];
}

export async function getActiveManagementCostCenters() {
  return (await getManagementCostCenters()).filter(center => center.is_active);
}

export type CostEntry = {
  id: string;
  legal_entity_id: string | null;
  source_type: "invoice" | "manual";
  source_id: string | null;
  cost_date: string;
  description: string;
  supplier_id: string | null;
  cost_category_id: string | null;
  cost_center_id: string | null;
  cost_center_name: string | null;
  cost_center_code: string | null;
  cost_pool_id: string | null;
  cost_pool_name: string | null;
  cost_category_name: string | null;
  supplier_name: string | null;
  management_status: "allocated" | "partially_allocated" | "cost_center" | "unallocated" | "excluded";
  amount: number;
  currency: string;
  status: "active" | "excluded";
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  allocated_total: number;
  residual: number;
  allocated_amount: number;
  remaining_amount: number;
};

const filtersSchema = z.object({
  source_type: z.enum(["invoice", "manual"]).optional(),
  cost_category_id: uuidSchema.optional(),
  cost_center_id: uuidSchema.optional(),
  cost_pool_id: uuidSchema.optional(),
  status: z.enum(["active", "excluded"]).optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(50),
});

export async function getCostEntryById(id: string): Promise<CostEntry | null> {
  const db = await authorizedClient("management.read");
  const result = await db.from("cost_entry_balances").select("*")
    .eq("id", uuidSchema.parse(id)).maybeSingle();
  checkDatabase(result.error, "Lettura costo gestionale");
  return result.data as CostEntry | null;
}

export async function getCostEntries(filters: z.input<typeof filtersSchema> = {}) {
  const db = await authorizedClient("management.read");
  const input = filtersSchema.parse(filters);
  let query = db.from("cost_entry_balances").select("*", { count: "exact" });
  if (input.source_type) query = query.eq("source_type", input.source_type);
  if (input.cost_category_id) query = query.eq("cost_category_id", input.cost_category_id);
  if (input.cost_center_id) query = query.eq("cost_center_id", input.cost_center_id);
  if (input.cost_pool_id) query = query.eq("cost_pool_id", input.cost_pool_id);
  if (input.status) query = query.eq("status", input.status);
  const result = await query.order("cost_date", { ascending: false }).order("id")
    .range(input.offset, input.offset + input.limit - 1);
  checkDatabase(result.error, "Lettura costi gestionali");
  return { rows: (result.data ?? []) as CostEntry[], count: result.count ?? 0 };
}

export async function createManualCostEntry(input: z.input<typeof manualCostEntrySchema>) {
  const db = await authorizedClient("management.update");
  const values = manualCostEntrySchema.parse(input);
  const result = await db.from("cost_entries").insert({
    ...values, source_type: "manual", source_id: null, status: "active",
    // created_by is assigned to auth.uid() by the database trigger.
  }).select("id").single();
  checkCostEntryWrite(result.error, "Creazione costo manuale");
  return String(result.data!.id);
}

export async function updateManualCostEntry(id: string, input: z.input<typeof manualCostEntrySchema>) {
  const db = await authorizedClient("management.update");
  const values = manualCostEntrySchema.parse(input);
  const result = await db.from("cost_entries").update(values)
    .eq("id", uuidSchema.parse(id)).eq("source_type", "manual").select("id").maybeSingle();
  checkCostEntryWrite(result.error, "Modifica costo manuale");
  if (!result.data) throw new AppError("conflict", "Costo manuale non trovato. I costi da fattura si modificano dalla fattura.");
  return String(result.data.id);
}

export async function excludeCostEntry(id: string) {
  const db = await authorizedClient("management.update");
  const result = await db.from("cost_entries").update({ status: "excluded" })
    .eq("id", uuidSchema.parse(id)).eq("source_type", "manual").select("id").maybeSingle();
  checkDatabase(result.error, "Esclusione costo manuale");
  if (!result.data) throw new AppError("conflict", "Costo manuale non trovato. I costi da fattura si escludono dalla fattura.");
  return String(result.data.id);
}

export async function updateCostEntryClassification(id: string, input: z.input<typeof costEntryClassificationSchema>) {
  const db = await authorizedClient("management.update");
  const values = costEntryClassificationSchema.parse(input);
  const result = await db.rpc("update_cost_entry_classification", {
    p_id: uuidSchema.parse(id), p_cost_category_id: values.cost_category_id,
    p_cost_center_id: values.cost_center_id, p_notes: values.notes, p_cost_pool_id: values.cost_pool_id,
  });
  checkCostEntryWrite(result.error, "Modifica classificazione gestionale");
  return String(result.data);
}
