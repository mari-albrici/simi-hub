import "server-only";
import { z } from "zod";
import { authorizedClient, requirePermission } from "@/lib/permissions";
import { AppError, checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { uuidSchema, projectManagementForecastSchema, projectManagementForecastLineSchema } from "@/lib/validations";
export type ForecastTotal = { currency: string; budget_amount: number; actual_cost: number; cost_to_complete: number; estimate_at_completion: number; forecast_variance: number | null; forecast_variance_percent: number | null };
export type ForecastComparison = { budget_id: string | null; budget_name: string | null; rows: (ForecastTotal & { category_id: string | null; category_name: string })[]; totals: ForecastTotal[] };
export type ManagementForecast = {
  id: string; project_id: string; version_number: number; name: string; status: "draft" | "approved" | "superseded";
  forecast_date: string; currency: string; notes: string | null; approved_at: string | null; created_at: string; totals: ForecastTotal[];
};
export type ManagementForecastLine = { id: string; forecast_id: string; cost_category_id: string; cost_to_complete: number; notes: string | null };
function check(error: { code?: string; message: string } | null) {
  if (error?.code === "22023" && ["Commessa non disponibile.", "Esiste già un forecast: crea una revisione.",
    "Il forecast è in sola lettura: crea una revisione.", "Dati forecast non validi.", "Importo o dati riga non validi.",
    "La categoria deve essere attiva per una nuova riga.", "Solo una bozza può essere approvata.",
    "Inserisci almeno una riga prima di approvare."].includes(error.message)) throw new AppError("validation", error.message);
  checkDatabase(error, "Gestione forecast commessa");
}
export async function getProjectManagementForecasts(projectId: string): Promise<ManagementForecast[]> {
  await requirePermission("project.read"); const db = await authorizedClient("management.read"); const id = uuidSchema.parse(projectId);
  return await readAll((a, b) => db.from("project_management_forecast_totals").select("*").eq("project_id", id).order("version_number", { ascending: false }).range(a, b)) as ManagementForecast[];
}
// Also serves the initial comparison when no forecast exists yet.
export async function getProjectManagementForecastById(id: string | null, projectId: string) {
  await requirePermission("project.read"); const db = await authorizedClient("management.read"); const project = uuidSchema.parse(projectId);
  const forecastId = id ? uuidSchema.parse(id) : null;
  const [header, lines, comparison] = await Promise.all([
    forecastId ? db.from("project_management_forecast_totals").select("*").eq("id", forecastId).eq("project_id", project).maybeSingle() : Promise.resolve({ data: null, error: null }),
    forecastId ? readAll((a, b) => db.from("project_management_forecast_lines").select("*").eq("forecast_id", forecastId).order("id").range(a, b)) : Promise.resolve([]),
    db.rpc("project_management_forecast_comparison", { p_project: project, p_forecast: forecastId }),
  ]);
  check(header.error); check(comparison.error);
  if (forecastId && !header.data) throw new AppError("validation", "Forecast non disponibile per questa commessa.");
  return { forecast: header.data as ManagementForecast | null, lines: lines as ManagementForecastLine[], comparison: comparison.data as ForecastComparison };
}
async function mutate(name: string, args: Record<string, unknown>) {
  await requirePermission("project.read"); const db = await authorizedClient("management.update"); const result = await db.rpc(name, args); check(result.error); return String(result.data);
}
export async function createProjectManagementForecast(projectId: string) { return mutate("create_project_management_forecast", { p_project: uuidSchema.parse(projectId) }); }
export async function updateProjectManagementForecast(id: string, input: z.input<typeof projectManagementForecastSchema>) {
  const v = projectManagementForecastSchema.parse(input); return mutate("update_project_management_forecast", { p_id: uuidSchema.parse(id), p_name: v.name, p_forecast_date: v.forecast_date, p_currency: v.currency, p_notes: v.notes });
}
export async function upsertProjectManagementForecastLine(input: z.input<typeof projectManagementForecastLineSchema>) {
  const v = projectManagementForecastLineSchema.parse(input); return mutate("upsert_project_management_forecast_line", { p_forecast: v.forecast_id, p_category: v.cost_category_id, p_cost_to_complete: v.cost_to_complete, p_notes: v.notes });
}
export async function approveProjectManagementForecast(id: string) { return mutate("approve_project_management_forecast", { p_id: uuidSchema.parse(id) }); }
export async function cloneProjectManagementForecast(id: string) { return mutate("clone_project_management_forecast", { p_source: uuidSchema.parse(id) }); }
