import "server-only";

import { z } from "zod";
import { authorizedClient } from "@/lib/permissions";
import { AppError, checkDatabase } from "@/lib/errors";
import { costEntryAllocationSchema, uuidSchema } from "@/lib/validations";
import { getCostEntryById } from "@/lib/cost-entries";
import { readAll } from "@/lib/data";

export type ManagementCostCategory = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function getManagementCostCategories(): Promise<ManagementCostCategory[]> {
  const db = await authorizedClient("management.read");
  const result = await db.from("management_cost_categories")
    .select("id,code,name,description,sort_order,is_active")
    .order("sort_order").order("code");
  checkDatabase(result.error, "Lettura categorie di costo gestionali");
  return result.data ?? [];
}

export type ManagementAllocation = {
  id: string;
  invoice_id: string | null;
  cost_entry_id: string | null;
  project_id: string;
  cost_category_id: string | null;
  cost_category: ManagementCostCategory | null;
  allocated_amount: number;
  allocation_method: "direct" | "manual";
  notes: string | null;
  project: { project_code: string; name: string } | null;
};

export async function getManagementAllocationsByInvoice(invoiceId: string): Promise<ManagementAllocation[]> {
  return getAllocations("invoice_id", invoiceId);
}

async function getAllocations(column: "invoice_id" | "cost_entry_id", id: string): Promise<ManagementAllocation[]> {
  const sourceId = uuidSchema.parse(id);
  const db = await authorizedClient("management.read");
  const rows = await readAll((from, to) => db.from("management_allocations")
    .select("id,invoice_id,cost_entry_id,project_id,cost_category_id,allocated_amount,allocation_method,notes,project:projects(project_code,name),cost_category:management_cost_categories(id,code,name,description,sort_order,is_active)")
    .eq(column, sourceId)
    .order("created_at").order("id").range(from, to));
  return rows.map(row => ({
    ...row,
    allocated_amount: Number(row.allocated_amount),
    allocation_method: row.allocation_method as ManagementAllocation["allocation_method"],
    project: (Array.isArray(row.project) ? row.project[0] : row.project) ?? null,
    cost_category: (Array.isArray(row.cost_category) ? row.cost_category[0] : row.cost_category) ?? null,
  }));
}

export async function getCostEntryAllocations(costEntryId: string) {
  if (!await getCostEntryById(uuidSchema.parse(costEntryId))) throw new AppError("validation", "Costo gestionale non trovato.");
  return getAllocations("cost_entry_id", costEntryId);
}

async function allocationWriteClient(costEntryId: string, allowExcluded = false) {
  const db = await authorizedClient("management.update");
  const entry = await getCostEntryById(uuidSchema.parse(costEntryId));
  if (!entry) throw new AppError("validation", "Costo gestionale non trovato.");
  if (!allowExcluded && entry.status !== "active") throw new AppError("validation", "Il costo è escluso: non è possibile allocarlo.");
  return db;
}

function checkAllocationWrite(error: { code?: string; message: string } | null) {
  if (error?.code === "23505") throw new AppError("validation", "Esiste già un'allocazione per questa commessa. Modifica quella esistente.");
  if (error?.code === "23514") throw new AppError("validation", "Allocazione non valida: verifica che il costo sia attivo e che il totale non superi il suo valore assoluto.");
  checkDatabase(error, "Aggiornamento allocazione gestionale");
}

export async function createCostEntryAllocation(costEntryId: string, input: z.input<typeof costEntryAllocationSchema>) {
  const db = await allocationWriteClient(costEntryId);
  const result = await db.from("management_allocations")
    .insert({ ...costEntryAllocationSchema.parse(input), cost_entry_id: costEntryId })
    .select("id,invoice_id").single();
  checkAllocationWrite(result.error);
  return result.data!;
}

export async function updateCostEntryAllocation(costEntryId: string, id: string, input: z.input<typeof costEntryAllocationSchema>) {
  const db = await allocationWriteClient(costEntryId);
  const result = await db.from("management_allocations").update(costEntryAllocationSchema.parse(input))
    .eq("cost_entry_id", costEntryId).eq("id", uuidSchema.parse(id)).select("id,invoice_id").maybeSingle();
  checkAllocationWrite(result.error);
  if (!result.data) throw new AppError("conflict", "Allocazione non trovata per questo costo. Ricarica l'elenco.");
  return result.data;
}

export async function deleteCostEntryAllocation(costEntryId: string, id: string) {
  const db = await allocationWriteClient(costEntryId, true);
  const result = await db.from("management_allocations").delete()
    .eq("cost_entry_id", costEntryId).eq("id", uuidSchema.parse(id)).select("id,invoice_id").maybeSingle();
  checkAllocationWrite(result.error);
  if (!result.data) throw new AppError("conflict", "Allocazione non trovata per questo costo. Ricarica l'elenco.");
  return result.data;
}
