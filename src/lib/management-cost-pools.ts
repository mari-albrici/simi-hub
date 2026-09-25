import "server-only";
import { z } from "zod";
import { authorizedClient } from "@/lib/permissions";
import { AppError, checkDatabase } from "@/lib/errors";
import { managementCostPoolSchema, managementPoolDriverSchema, uuidSchema } from "@/lib/validations";
import { readAll } from "@/lib/data";

export type ManagementCostPool = {
  id: string; code: string; name: string; description: string | null;
  cost_center_id: string; cost_center_name: string | null; period_start: string; period_end: string;
  driver_type: "labor_hours" | "worker_days"; planned_driver_quantity: number | null;
  standard_rate: number | null; actual_cost: number; linked_cost_entries_count: number;
  currency: string; status: "draft" | "active" | "closed"; notes: string | null;
};

export async function getManagementCostPools(): Promise<ManagementCostPool[]> {
  const db = await authorizedClient("management.read");
  return await readAll((from, to) => db.from("management_cost_pool_summaries").select("*")
    .order("period_start", { ascending: false }).order("id").range(from, to)) as ManagementCostPool[];
}

export async function getManagementCostPoolById(id: string): Promise<ManagementCostPool | null> {
  const db = await authorizedClient("management.read");
  const result = await db.from("management_cost_pool_summaries").select("*").eq("id", uuidSchema.parse(id)).maybeSingle();
  checkDatabase(result.error, "Lettura pool costi");
  return result.data as ManagementCostPool | null;
}

export async function createManagementCostPool(input: z.input<typeof managementCostPoolSchema>) {
  const db = await authorizedClient("management.update");
  const result = await db.from("management_cost_pools").insert(managementCostPoolSchema.parse(input)).select("id").single();
  checkDatabase(result.error, "Creazione pool costi");
  return String(result.data!.id);
}

export async function updateManagementCostPool(id: string, input: z.input<typeof managementCostPoolSchema>) {
  const db = await authorizedClient("management.update");
  const result = await db.from("management_cost_pools").update(managementCostPoolSchema.parse(input))
    .eq("id", uuidSchema.parse(id)).select("id").maybeSingle();
  checkPoolMutation(result.error);
  if (!result.data) throw new AppError("conflict", "Pool non trovato.");
  return String(result.data.id);
}

export async function getCostPoolActualCost(poolId: string) {
  const pool = await getManagementCostPoolById(poolId);
  if (!pool) throw new AppError("validation", "Pool non trovato.");
  return pool.actual_cost;
}

export type PoolDriverEntry = {
  source_type: "manual" | "labor_entries";
  id: string; pool_id: string; project_id: string; project_code: string; project_name: string;
  driver_quantity: number; notes: string | null; standard_rate: number | null;
  calculated_amount: number | null; generated_rate: number | null; generated_quantity: number | null;
  allocated_amount: number | null; generated_at: string | null;
};
export type PoolDistributionSummary = {
  id: string; currency: string; actual_cost: number; total_driver_quantity: number;
  project_count: number; calculated_total: number; total_allocated: number;
  allocation_count: number; pool_variance: number;
};
export type PoolProjectOption = { id: string; project_code: string; name: string };

export async function getCostPoolDistribution(poolId: string) {
  const db = await authorizedClient("management.read");
  const id = uuidSchema.parse(poolId);
  const [entries, summary] = await Promise.all([
    readAll((from, to) => db.from("management_pool_driver_details").select("*").eq("pool_id", id).order("project_code").order("id").range(from, to)),
    db.from("management_pool_distribution_summaries").select("*").eq("id", id).single(),
  ]);
  checkDatabase(summary.error, "Riepilogo distribuzione pool");
  return { entries: entries as PoolDriverEntry[], summary: summary.data as PoolDistributionSummary };
}

export async function getCostPoolProjectOptions(): Promise<PoolProjectOption[]> {
  const db = await authorizedClient("management.update");
  return await readAll((from, to) => db.from("projects").select("id,project_code,name").is("archived_at", null)
    .order("project_code").order("id").range(from, to)) as PoolProjectOption[];
}

function checkPoolMutation(error: { code?: string; message: string } | null) {
  const messages = ["Pool non trovato o chiuso.", "Tariffa standard non disponibile o non positiva.",
    "Il pool chiuso è in sola lettura.", "Rimuovi i driver prima di cambiare unità, valuta o centro del pool."];
  if (error?.code === "22023" && messages.includes(error.message)) throw new AppError("validation", error.message);
  if (error?.code === "23505") throw new AppError("validation", "Questa commessa è già presente nel pool.");
  checkDatabase(error, "Aggiornamento distribuzione pool");
}

export async function saveCostPoolDriver(input: z.input<typeof managementPoolDriverSchema>, id?: string) {
  const db = await authorizedClient("management.update");
  const value = managementPoolDriverSchema.parse(input);
  const result = id
    ? await db.from("management_pool_driver_entries").update(value).eq("id", uuidSchema.parse(id)).eq("pool_id", value.pool_id).select("id").maybeSingle()
    : await db.from("management_pool_driver_entries").insert(value).select("id").single();
  checkPoolMutation(result.error);
  if (!result.data) throw new AppError("conflict", "Driver non trovato. Ricarica il pool.");
}

export async function removeCostPoolDriver(poolId: string, id: string) {
  const db = await authorizedClient("management.update");
  const result = await db.from("management_pool_driver_entries").delete().eq("id", uuidSchema.parse(id))
    .eq("pool_id", uuidSchema.parse(poolId)).select("id").maybeSingle();
  checkPoolMutation(result.error);
  if (!result.data) throw new AppError("conflict", "Driver non trovato. Ricarica il pool.");
}

export async function generateCostPoolAllocations(poolId: string) {
  const db = await authorizedClient("management.update");
  const result = await db.rpc("generate_cost_pool_allocations", { p_pool_id: uuidSchema.parse(poolId) });
  checkPoolMutation(result.error);
  return result.data as { count: number; total_driver_quantity: number; rate: number; total_allocated: number; currency: string };
}

export async function getPoolReconciliationSummary() {
  const db = await authorizedClient("management.read");
  const result = await db.rpc("management_pool_reconciliation_summary");
  checkDatabase(result.error, "Riconciliazione allocazioni da pool");
  return (result.data ?? []) as Pick<PoolDistributionSummary, "currency" | "actual_cost" | "total_allocated" | "pool_variance">[];
}
