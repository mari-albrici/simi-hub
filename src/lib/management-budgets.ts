import "server-only";
import { z } from "zod";
import { authorizedClient, requirePermission } from "@/lib/permissions";
import { AppError, checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { uuidSchema, projectManagementBudgetSchema, projectManagementBudgetLineSchema } from "@/lib/validations";
export type ManagementBudget = {
  id: string; project_id: string; version_number: number; name: string; status: "draft" | "approved" | "superseded";
  valid_from: string | null; currency: string; notes: string | null; approved_at: string | null; created_at: string; budget_total: number;
};
export type ManagementBudgetLine = {
  id: string; budget_id: string; cost_category_id: string; description: string | null; amount: number; notes: string | null;
  category: { name: string; is_active: boolean } | null;
};
export type BudgetComparison = {
  rows: { category_id: string | null; category_name: string; currency: string; budget_amount: number; actual_cost: number; variance: number; variance_percent: number | null }[];
  totals: { currency: string; budget_amount: number; actual_cost: number; variance: number }[];
};
function check(error: { code?: string; message: string } | null) {
  if (error?.code === "22023" && ["Commessa non disponibile.", "Esiste già un budget: crea una revisione.",
    "Il budget è in sola lettura: crea una revisione.", "Dati budget non validi.", "Importo o dati riga non validi.",
    "La categoria deve essere attiva per una nuova riga.", "Riga budget non trovata.", "Solo una bozza può essere approvata.",
    "Inserisci almeno una riga prima di approvare."].includes(error.message)) throw new AppError("validation", error.message);
  checkDatabase(error, "Gestione budget commessa");
}
export async function getProjectManagementBudgets(projectId: string): Promise<ManagementBudget[]> {
  await requirePermission("project.read"); const db = await authorizedClient("management.read"); const id = uuidSchema.parse(projectId);
  return await readAll((a, b) => db.from("project_management_budget_totals").select("*").eq("project_id", id).order("version_number", { ascending: false }).range(a, b)) as ManagementBudget[];
}
export async function getProjectManagementBudgetById(id: string) {
  await requirePermission("project.read"); const db = await authorizedClient("management.read"); const budgetId = uuidSchema.parse(id);
  const [budget, lines, comparison] = await Promise.all([
    db.from("project_management_budget_totals").select("*").eq("id", budgetId).maybeSingle(),
    readAll((a, b) => db.from("project_management_budget_lines").select("*,category:management_cost_categories(name,is_active)").eq("budget_id", budgetId).order("id").range(a, b)),
    db.rpc("project_management_budget_comparison", { p_budget: budgetId }),
  ]);
  check(budget.error); check(comparison.error);
  return budget.data ? { budget: budget.data as ManagementBudget,
    lines: lines.map(line => ({ ...line, category: (Array.isArray(line.category) ? line.category[0] : line.category) ?? null })) as ManagementBudgetLine[],
    comparison: comparison.data as BudgetComparison } : null;
}
async function mutate(name: string, args: Record<string, unknown>) {
  await requirePermission("project.read"); const db = await authorizedClient("management.update"); const result = await db.rpc(name, args); check(result.error); return String(result.data);
}
export async function createProjectManagementBudget(projectId: string) { return mutate("create_project_management_budget", { p_project: uuidSchema.parse(projectId) }); }
export async function updateProjectManagementBudget(id: string, input: z.input<typeof projectManagementBudgetSchema>) {
  const v = projectManagementBudgetSchema.parse(input); return mutate("update_project_management_budget", { p_id: uuidSchema.parse(id), p_name: v.name, p_valid_from: v.valid_from, p_currency: v.currency, p_notes: v.notes });
}
export async function upsertProjectManagementBudgetLine(input: z.input<typeof projectManagementBudgetLineSchema>) {
  const v = projectManagementBudgetLineSchema.parse(input); return mutate("upsert_project_management_budget_line", { p_budget: v.budget_id, p_category: v.cost_category_id, p_description: v.description, p_amount: v.amount, p_notes: v.notes });
}
export async function deleteProjectManagementBudgetLine(id: string) { return mutate("delete_project_management_budget_line", { p_id: uuidSchema.parse(id) }); }
export async function approveProjectManagementBudget(id: string) { return mutate("approve_project_management_budget", { p_id: uuidSchema.parse(id) }); }
export async function cloneProjectManagementBudget(id: string) { return mutate("clone_project_management_budget", { p_source: uuidSchema.parse(id) }); }
