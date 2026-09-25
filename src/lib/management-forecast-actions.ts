"use server";
import { revalidatePath } from "next/cache";
import { AppError, publicError } from "@/lib/errors";
import { parseMonetaryAmount } from "@/lib/money";
import { uuidSchema } from "@/lib/validations";
import { createProjectManagementForecast, updateProjectManagementForecast, upsertProjectManagementForecastLine, approveProjectManagementForecast, cloneProjectManagementForecast } from "@/lib/management-forecasts";
const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
export async function managementForecastAction(_state: { error: string | null; success: boolean; forecastId: string | null }, f: FormData) {
  try {
    let forecastId: string | null = f.get("forecast_id") ? uuidSchema.parse(f.get("forecast_id")) : null;
    switch (text(f, "operation")) {
      case "create": forecastId = await createProjectManagementForecast(uuidSchema.parse(f.get("project_id"))); break;
      case "clone": forecastId = await cloneProjectManagementForecast(uuidSchema.parse(forecastId)); break;
      case "approve": await approveProjectManagementForecast(uuidSchema.parse(forecastId)); break;
      case "header": await updateProjectManagementForecast(uuidSchema.parse(forecastId), { name: text(f, "name"), forecast_date: text(f, "forecast_date"), currency: text(f, "currency"), notes: text(f, "notes") }); break;
      case "line": await upsertProjectManagementForecastLine({ forecast_id: uuidSchema.parse(forecastId), cost_category_id: uuidSchema.parse(f.get("cost_category_id")), cost_to_complete: parseMonetaryAmount(text(f, "cost_to_complete")) ?? NaN, notes: text(f, "notes") }); break;
      default: throw new AppError("validation", "Operazione forecast non valida.");
    }
    revalidatePath("/commesse/[id]", "page"); return { error: null, success: true, forecastId };
  } catch (error) { return { error: publicError(error).message, success: false, forecastId: null }; }
}
