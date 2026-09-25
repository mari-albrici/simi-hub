"use server";

import { revalidatePath } from "next/cache";
import { authorizedClient } from "@/lib/permissions";
import { AppError, checkDatabase, publicError } from "@/lib/errors";
import { managementAllocationSchema, uuidSchema } from "@/lib/validations";
import { parseMonetaryAmount } from "@/lib/money";
import { createCostEntryAllocation, updateCostEntryAllocation, deleteCostEntryAllocation, getCostEntryAllocations, getManagementCostCategories } from "@/lib/management-allocations";
import { getCostEntryById } from "@/lib/cost-entries";
import { getProjects } from "@/lib/data";
import { requirePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";

type ActionState = { error: string | null; success?: boolean };

function checkAllocationError(error: { code?: string; message: string } | null) {
  if (error?.code === "22023") {
    throw new AppError("validation", "La categoria di costo non esiste o non è più attiva. Seleziona un'altra categoria.");
  }
  if (error?.code === "23505") {
    throw new AppError("validation", "Esiste già un'allocazione per questa commessa. Modifica quella esistente.");
  }
  if (error?.code === "23514") {
    throw new AppError("validation", "Importo non valido: il totale allocato non può superare il valore assoluto della fattura.");
  }
  checkDatabase(error, "Salvataggio allocazione gestionale");
}

export async function saveManagementAllocationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    if (form.get("cost_entry_id")) {
      const costEntryId = uuidSchema.parse(form.get("cost_entry_id"));
      const values = {
        project_id: String(form.get("project_id") ?? ""),
        cost_category_id: form.get("cost_category_id") || null,
        allocated_amount: parseMonetaryAmount(String(form.get("allocated_amount") ?? "")) ?? NaN,
        allocation_method: form.get("allocation_method") as "manual" | "direct",
        notes: String(form.get("notes") ?? ""),
      };
      const result = form.get("id")
        ? await updateCostEntryAllocation(costEntryId, uuidSchema.parse(form.get("id")), values)
        : await createCostEntryAllocation(costEntryId, values);
      if (result.invoice_id) revalidatePath(`/fatture/${result.invoice_id}`);
      revalidatePath("/costi-gestionali");
      return { error: null, success: true };
    }
    const db = await authorizedClient("management.update");
    const input = managementAllocationSchema.parse({
      id: form.get("id") || undefined,
      invoice_id: form.get("invoice_id"),
      project_id: form.get("project_id"),
      cost_category_id: form.get("cost_category_id") || null,
      allocated_amount: parseMonetaryAmount(String(form.get("allocated_amount") ?? "")),
      allocation_method: form.get("allocation_method"),
      notes: form.get("notes") || null,
    });
    const { id, ...values } = input;
    const result = id
      ? await db.from("management_allocations").update(values)
          .eq("id", id).eq("invoice_id", input.invoice_id).select("id").maybeSingle()
      : await db.from("management_allocations").insert(values).select("id").single();
    checkAllocationError(result.error);
    if (!result.data) throw new AppError("conflict", "Allocazione non trovata. Ricarica la fattura.");
    revalidatePath(`/fatture/${input.invoice_id}`);
    revalidatePath("/costi-gestionali");
    return { error: null, success: true };
  } catch (error) {
    return { error: publicError(error).message };
  }
}

export async function deleteManagementAllocationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    if (form.get("cost_entry_id")) {
      const result = await deleteCostEntryAllocation(uuidSchema.parse(form.get("cost_entry_id")), uuidSchema.parse(form.get("id")));
      if (result.invoice_id) revalidatePath(`/fatture/${result.invoice_id}`);
      revalidatePath("/costi-gestionali");
      return { error: null, success: true };
    }
    const db = await authorizedClient("management.update");
    const id = uuidSchema.parse(form.get("id"));
    const invoiceId = uuidSchema.parse(form.get("invoice_id"));
    const result = await db.from("management_allocations").delete()
      .eq("id", id).eq("invoice_id", invoiceId).select("id").maybeSingle();
    checkDatabase(result.error, "Eliminazione allocazione gestionale");
    if (!result.data) throw new AppError("conflict", "Allocazione non trovata. Ricarica la fattura.");
    revalidatePath(`/fatture/${invoiceId}`);
    revalidatePath("/costi-gestionali");
    return { error: null, success: true };
  } catch (error) {
    return { error: publicError(error).message };
  }
}

export async function loadCostEntryAllocationsAction(costEntryId: string) {
  try {
    const user = await requirePermission("management.read");
    const id = uuidSchema.parse(costEntryId);
    const [entry, allocations, categories, projects] = await Promise.all([
      getCostEntryById(id), getCostEntryAllocations(id), getManagementCostCategories(),
      hasPermission(user.role, "management.update") ? getProjects() : Promise.resolve([]),
    ]);
    if (!entry) throw new AppError("validation", "Costo gestionale non trovato.");
    return { error: null, data: { entry, allocations, categories, projects } };
  } catch (error) {
    return { error: publicError(error).message, data: null };
  }
}
