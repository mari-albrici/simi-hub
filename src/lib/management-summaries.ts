import "server-only";

import { z } from "zod";
import { authorizedClient, requirePermission } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { uuidSchema } from "@/lib/validations";

export type ProjectManagementCostSummary = {
  totalCost: number | null;
  allocationCount: number;
  byCurrency: { currency: string; totalCost: number; allocationCount: number }[];
  byCategory: { categoryId: string | null; categoryName: string; currency: string; totalCost: number }[];
};

export type ProjectManagementAllocation = {
  id: string; project_id: string; cost_entry_id: string | null; cost_date: string;
  description: string; source_type: "invoice" | "manual" | "pool" | "asset" | "consumable" | "labor"; source_id: string | null;
  invoice_id: string | null; cost_category_id: string | null; category_name: string;
  supplier_id: string | null; supplier_name: string | null; currency: string; economic_amount: number;
};

export async function getProjectManagementCostSummary(projectId: string): Promise<ProjectManagementCostSummary> {
  await requirePermission("project.read");
  const db = await authorizedClient("management.read");
  const result = await db.rpc("project_management_cost_summary", { p_project_id: uuidSchema.parse(projectId) });
  checkDatabase(result.error, "Riepilogo costi gestionali commessa");
  return result.data as ProjectManagementCostSummary;
}

export async function getProjectManagementAllocations(projectId: string, page = 1) {
  await requirePermission("project.read");
  const db = await authorizedClient("management.read");
  const offset = (z.number().int().min(1).max(100000).parse(page) - 1) * 50;
  const result = await db.from("project_management_allocations").select("*", { count: "exact" })
    .eq("project_id", uuidSchema.parse(projectId)).order("cost_date", { ascending: false }).order("id")
    .range(offset, offset + 49);
  checkDatabase(result.error, "Movimenti gestionali commessa");
  return { rows: (result.data ?? []) as ProjectManagementAllocation[], count: result.count ?? 0 };
}

export type ManagementReconciliation = {
  currency: string; total_active_costs: number; allocated: number;
  remaining_in_cost_centers: number; remaining_unallocated: number;
  excluded_costs: number; net_active_costs: number; balance_difference: number;
};

export async function getManagementReconciliationSummary(): Promise<ManagementReconciliation[]> {
  const db = await authorizedClient("management.read");
  const result = await db.rpc("management_reconciliation_summary");
  checkDatabase(result.error, "Riconciliazione costi gestionali");
  return (result.data ?? []) as ManagementReconciliation[];
}
