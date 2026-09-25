"use server";
import { revalidatePath } from "next/cache";
import { publicError } from "@/lib/errors";
import { parseMonetaryAmount } from "@/lib/money";
import { managementCostPoolSchema, uuidSchema } from "@/lib/validations";
import { createManagementCostPool, updateManagementCostPool, saveCostPoolDriver, removeCostPoolDriver, generateCostPoolAllocations } from "@/lib/management-cost-pools";
import { formatMoney } from "@/lib/formatters";
import { calculatePoolLaborDrivers } from "@/lib/management-labor";

export async function saveManagementCostPoolAction(_state: { error: string | null; success?: boolean }, form: FormData) {
  try {
    const quantity = String(form.get("planned_driver_quantity") ?? "").trim();
    const input = managementCostPoolSchema.parse({
      code: form.get("code"), name: form.get("name"), description: form.get("description"),
      cost_center_id: form.get("cost_center_id"), period_start: form.get("period_start"), period_end: form.get("period_end"),
      driver_type: form.get("driver_type"), planned_driver_quantity: quantity ? parseMonetaryAmount(quantity) ?? NaN : null,
      currency: form.get("currency"), status: form.get("status"), notes: form.get("notes"),
    });
    if (form.get("id")) await updateManagementCostPool(uuidSchema.parse(form.get("id")), input);
    else await createManagementCostPool(input);
    revalidatePath("/pool-costi");
    revalidatePath("/costi-gestionali");
    return { error: null, success: true };
  } catch (error) { return { error: publicError(error).message, success: false }; }
}

export async function costPoolDriverAction(_state: { error: string | null; message: string | null }, form: FormData) {
  try {
    const poolId = uuidSchema.parse(form.get("pool_id"));
    const operation = form.get("operation");
    let message = "Quantità salvata. Genera o ricalcola le allocazioni per applicarla alle commesse.";
    if (operation === "labor") {
      const count = await calculatePoolLaborDrivers(poolId);
      message = `${count} driver aggiornati dalle ore. Le righe manuali sono conservate. Genera o ricalcola le allocazioni per applicare le nuove quantità.`;
    } else if (operation === "generate") {
      const result = await generateCostPoolAllocations(poolId);
      message = `${result.count} allocazioni generate: ${formatMoney(result.total_allocated, result.currency)}.`;
    } else if (operation === "remove") {
      await removeCostPoolDriver(poolId, uuidSchema.parse(form.get("id")));
      message = "Quantità rimossa e relativa allocazione azzerata.";
    } else {
      await saveCostPoolDriver({ pool_id: poolId, project_id: uuidSchema.parse(form.get("project_id")),
        driver_quantity: parseMonetaryAmount(String(form.get("driver_quantity") ?? "")) ?? NaN,
        notes: String(form.get("notes") ?? ""),
      }, form.get("id") ? uuidSchema.parse(form.get("id")) : undefined);
    }
    revalidatePath("/pool-costi");
    revalidatePath("/costi-gestionali");
    revalidatePath("/commesse/[id]", "page");
    return { error: null, message };
  } catch (error) { return { error: publicError(error).message, message: null }; }
}
