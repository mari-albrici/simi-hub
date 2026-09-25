"use server";
import { revalidatePath } from "next/cache";
import { publicError } from "@/lib/errors";
import { employeeManagementRateSchema, projectLaborEntrySchema, uuidSchema } from "@/lib/validations";
import { createEmployeeManagementRate, updateEmployeeManagementRate, createProjectLaborEntry, updateProjectLaborEntry, cancelProjectLaborEntry } from "@/lib/management-labor";
const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const decimal = (f: FormData, key: string) => /^\d+(?:[.,]\d+)?$/.test(text(f, key)) ? Number(text(f, key).replace(",", ".")) : NaN;
export async function saveEmployeeRateAction(_state: { error: string | null; success: boolean }, f: FormData) {
  try {
    const v = employeeManagementRateSchema.parse({ employee_id: f.get("employee_id"), valid_from: text(f, "valid_from"), valid_to: text(f, "valid_to"),
      hourly_cost: decimal(f, "hourly_cost"), currency: text(f, "currency"), notes: text(f, "notes") });
    if (f.get("id")) await updateEmployeeManagementRate(uuidSchema.parse(f.get("id")), v); else await createEmployeeManagementRate(v);
    revalidatePath(`/personale/${v.employee_id}`); return { error: null, success: true };
  } catch (error) { return { error: publicError(error).message, success: false }; }
}
export async function saveLaborEntryAction(_state: { error: string | null; success: boolean }, f: FormData) {
  try {
    if (f.get("operation") === "cancel") await cancelProjectLaborEntry(uuidSchema.parse(f.get("id")));
    else {
      const v = projectLaborEntrySchema.parse({ employee_id: f.get("employee_id"), project_id: f.get("project_id"), work_date: text(f, "work_date"),
        hours: decimal(f, "hours"), hour_type: text(f, "hour_type"), notes: text(f, "notes") });
      if (f.get("id")) await updateProjectLaborEntry(uuidSchema.parse(f.get("id")), v); else await createProjectLaborEntry(v);
    }
    revalidatePath("/commesse/[id]", "page"); revalidatePath("/costi-gestionali"); revalidatePath("/pool-costi");
    return { error: null, success: true };
  } catch (error) { return { error: publicError(error).message, success: false }; }
}
