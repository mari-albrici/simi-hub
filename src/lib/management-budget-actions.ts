"use server";
import { revalidatePath } from "next/cache";
import { AppError, publicError } from "@/lib/errors";
import { parseMonetaryAmount } from "@/lib/money";
import { uuidSchema } from "@/lib/validations";
import { createProjectManagementBudget, updateProjectManagementBudget, upsertProjectManagementBudgetLine,
  deleteProjectManagementBudgetLine, approveProjectManagementBudget, cloneProjectManagementBudget } from "@/lib/management-budgets";
const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
export async function managementBudgetAction(_state: { error: string | null; success: boolean; budgetId: string | null }, f: FormData) {
  try {
    let budgetId: string | null = f.get("budget_id") ? uuidSchema.parse(f.get("budget_id")) : null;
    switch (text(f, "operation")) {
      case "create": budgetId = await createProjectManagementBudget(uuidSchema.parse(f.get("project_id"))); break;
      case "clone": budgetId = await cloneProjectManagementBudget(uuidSchema.parse(budgetId)); break;
      case "approve": await approveProjectManagementBudget(uuidSchema.parse(budgetId)); break;
      case "header": await updateProjectManagementBudget(uuidSchema.parse(budgetId), { name: text(f, "name"), valid_from: text(f, "valid_from"), currency: text(f, "currency"), notes: text(f, "notes") }); break;
      case "line": await upsertProjectManagementBudgetLine({ budget_id: uuidSchema.parse(budgetId), cost_category_id: uuidSchema.parse(f.get("cost_category_id")),
        description: text(f, "description"), amount: parseMonetaryAmount(text(f, "amount")) ?? NaN, notes: text(f, "notes") }); break;
      case "delete": await deleteProjectManagementBudgetLine(uuidSchema.parse(f.get("line_id"))); break;
      default: throw new AppError("validation", "Operazione budget non valida.");
    }
    revalidatePath("/commesse/[id]", "page"); return { error: null, success: true, budgetId };
  } catch (error) { return { error: publicError(error).message, success: false, budgetId: null }; }
}
