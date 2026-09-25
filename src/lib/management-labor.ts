import "server-only";
import { z } from "zod";
import { authorizedClient, requirePermission } from "@/lib/permissions";
import { AppError, checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { employeeManagementRateSchema, projectLaborEntrySchema, uuidSchema } from "@/lib/validations";
export type EmployeeManagementRate = z.output<typeof employeeManagementRateSchema> & { id: string };
export type ProjectLaborEntry = z.output<typeof projectLaborEntrySchema> & {
  id: string; employee_name: string; hourly_cost_snapshot: number; amount: number; currency: string; status: "active" | "cancelled";
};
export type LaborEmployee = { employee_id: string; employee_name: string; is_available: boolean };
export type LaborTotal = { currency: string; total_hours: number; total_cost: number };
function check(error: { code?: string; message: string } | null) {
  if (error?.code === "22023" && ["Tariffa o periodo non valido.", "Dipendente non disponibile.", "Tariffa non trovata.",
    "Il periodo si sovrappone a una tariffa esistente.", "Ore o data non valide.", "Commessa non disponibile.",
    "Riga ore non trovata o annullata.", "Nessun costo gestionale valido per il dipendente alla data selezionata.",
    "Serve un pool ore non chiuso."].includes(error.message)) throw new AppError("validation", error.message);
  checkDatabase(error, "Gestione manodopera");
}
export async function getEmployeeManagementRates(employeeId: string): Promise<EmployeeManagementRate[]> {
  const db = await authorizedClient("employee.hr.read"); const id = uuidSchema.parse(employeeId);
  return await readAll((a, b) => db.from("employee_management_rates").select("*").eq("employee_id", id).order("valid_from", { ascending: false }).order("id").range(a, b)) as EmployeeManagementRate[];
}
async function saveRate(input: z.input<typeof employeeManagementRateSchema>, id: string | null) {
  await requirePermission("employee.update"); const db = await authorizedClient("employee.hr.read");
  const v = employeeManagementRateSchema.parse(input);
  const result = await db.rpc("save_employee_management_rate", { p_id: id, p_employee: v.employee_id, p_from: v.valid_from,
    p_to: v.valid_to, p_cost: v.hourly_cost, p_currency: v.currency, p_notes: v.notes }); check(result.error);
}
export async function createEmployeeManagementRate(input: z.input<typeof employeeManagementRateSchema>) { return saveRate(input, null); }
export async function updateEmployeeManagementRate(id: string, input: z.input<typeof employeeManagementRateSchema>) { return saveRate(input, uuidSchema.parse(id)); }
export async function getLaborEmployees(): Promise<LaborEmployee[]> {
  const db = await authorizedClient("management.read");
  return await readAll((a, b) => db.rpc("management_labor_employees").order("employee_name").order("employee_id").range(a, b)) as LaborEmployee[];
}
export async function getProjectLaborEntries(projectId: string): Promise<ProjectLaborEntry[]> {
  const db = await authorizedClient("management.read"); const id = uuidSchema.parse(projectId);
  return await readAll((a, b) => db.from("project_labor_details").select("*").eq("project_id", id).order("work_date", { ascending: false }).order("id").range(a, b)) as ProjectLaborEntry[];
}
async function saveLabor(input: z.input<typeof projectLaborEntrySchema>, id: string | null) {
  const db = await authorizedClient("management.update"); const v = projectLaborEntrySchema.parse(input);
  const result = await db.rpc("save_project_labor_entry", { p_id: id, p_employee: v.employee_id, p_project: v.project_id,
    p_date: v.work_date, p_hours: v.hours, p_type: v.hour_type, p_notes: v.notes }); check(result.error);
}
export async function createProjectLaborEntry(input: z.input<typeof projectLaborEntrySchema>) { return saveLabor(input, null); }
export async function updateProjectLaborEntry(id: string, input: z.input<typeof projectLaborEntrySchema>) { return saveLabor(input, uuidSchema.parse(id)); }
export async function cancelProjectLaborEntry(id: string) {
  const db = await authorizedClient("management.update"); const result = await db.rpc("cancel_project_labor_entry", { p_id: uuidSchema.parse(id) }); check(result.error);
}
export async function getLaborTotals(projectId?: string): Promise<LaborTotal[]> {
  const db = await authorizedClient("management.read"); const result = await db.rpc("management_labor_summary", { p_project: projectId ? uuidSchema.parse(projectId) : null });
  check(result.error); return (result.data ?? []) as LaborTotal[];
}
export async function calculatePoolLaborDrivers(poolId: string) {
  const db = await authorizedClient("management.update"); const result = await db.rpc("calculate_pool_labor_drivers", { p_pool_id: uuidSchema.parse(poolId) });
  check(result.error); return Number(result.data);
}
