"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publicError } from "@/lib/errors";
import { parseMonetaryAmount } from "@/lib/money";
import { createManualCostEntry, updateManualCostEntry, updateCostEntryClassification, excludeCostEntry } from "@/lib/cost-entries";

type State = { error: string | null; success?: boolean };

export async function saveCostEntryAction(_state: State, form: FormData): Promise<State> {
  try {
    const operation = z.enum(["create", "update", "classify", "exclude"]).parse(form.get("operation"));
    const id = String(form.get("id") ?? "");
    const classification = {
      cost_category_id: form.get("cost_category_id") || null,
      cost_center_id: form.get("cost_center_id") || null,
      cost_pool_id: form.get("cost_pool_id") || null,
      notes: String(form.get("notes") ?? ""),
    };
    if (operation === "exclude") {
      await excludeCostEntry(id);
    } else if (operation === "classify") {
      await updateCostEntryClassification(id, classification);
    } else {
      const values = {
        ...classification,
        cost_date: String(form.get("cost_date") ?? ""),
        description: String(form.get("description") ?? ""),
        amount: parseMonetaryAmount(String(form.get("amount") ?? "")) ?? NaN,
        currency: String(form.get("currency") ?? ""),
        legal_entity_id: form.get("legal_entity_id") || null,
        supplier_id: form.get("supplier_id") || null,
      };
      if (operation === "create") await createManualCostEntry(values);
      else await updateManualCostEntry(id, values);
    }
    revalidatePath("/costi-gestionali");
    revalidatePath("/pool-costi");
    return { error: null, success: true };
  } catch (error) {
    return { error: publicError(error).message };
  }
}
