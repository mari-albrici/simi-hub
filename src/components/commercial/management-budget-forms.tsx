"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { managementBudgetAction } from "@/lib/management-budget-actions";
import type { ManagementBudget, ManagementBudgetLine } from "@/lib/management-budgets";
const initial = { error: null as string | null, success: false, budgetId: null as string | null };
type Category = { id: string; name: string; is_active: boolean };
export function BudgetAction({ operation, projectId, budgetId, lineId, label }: {
  operation: "create" | "clone" | "approve" | "delete"; projectId: string; budgetId?: string; lineId?: string; label: string;
}) {
  const [state, action] = useActionState(managementBudgetAction, initial);
  const router = useRouter();
  useEffect(() => { if (state.success && state.budgetId && (operation === "create" || operation === "clone")) router.push(`/commesse/${projectId}?tab=management&budget=${state.budgetId}`); }, [state, operation, projectId, router]);
  return <form action={action}><input type="hidden" name="operation" value={operation} /><input type="hidden" name="project_id" value={projectId} />
    <input type="hidden" name="budget_id" value={budgetId ?? ""} /><input type="hidden" name="line_id" value={lineId ?? ""} />
    {operation === "approve" || operation === "delete" ? <ConfirmSubmitButton confirmMessage={operation === "approve" ? "Approvare questa versione? Diventerà il riferimento corrente e non sarà più modificabile." : "Eliminare questa riga dalla bozza?"}>{label}</ConfirmSubmitButton> : <SubmitButton className="btn btn-sm btn-outline-primary">{label}</SubmitButton>}
    {state.error && <p className="text-danger" role="alert">{state.error}</p>}
  </form>;
}
function BudgetForm({ budget, mode, line, categories, onSaved }: { budget: ManagementBudget; mode: "header" | "line"; line?: ManagementBudgetLine; categories: Category[]; onSaved: () => void }) {
  const [state, action, pending] = useActionState(managementBudgetAction, initial);
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  return <form action={action}><input type="hidden" name="operation" value={mode} /><input type="hidden" name="budget_id" value={budget.id} />
    {state.error && <p className="alert alert-danger" role="alert">{state.error}</p>}
    <fieldset disabled={pending} className="d-grid gap-3">
      {mode === "header" ? <>
        <label>Nome<input name="name" required maxLength={200} className="form-control" defaultValue={budget.name} /></label>
        <label>Valido dal<input type="date" name="valid_from" className="form-control" defaultValue={budget.valid_from ?? ""} /></label>
        <label>Valuta<input name="currency" required maxLength={3} pattern="[A-Za-z]{3}" className="form-control" defaultValue={budget.currency} /></label>
      </> : <>
        {line ? <><input type="hidden" name="cost_category_id" value={line.cost_category_id} /><p>{line.category?.name ?? "Categoria"}</p></> : <label>Categoria<select name="cost_category_id" required className="form-select" defaultValue=""><option value="">Seleziona categoria</option>{categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <label>Importo ({budget.currency})<input name="amount" type="number" required min="0" max="999999999999.99" step="0.01" className="form-control" defaultValue={line?.amount} /></label>
        <label>Descrizione<textarea name="description" maxLength={2000} className="form-control" defaultValue={line?.description ?? ""} /></label>
      </>}
      <label>Note<textarea name="notes" maxLength={2000} className="form-control" defaultValue={(mode === "header" ? budget.notes : line?.notes) ?? ""} /></label>
      <SubmitButton>Salva</SubmitButton>
    </fieldset>
  </form>;
}
export function BudgetEditor({ budget, mode, line, categories = [] }: { budget: ManagementBudget; mode: "header" | "line"; line?: ManagementBudgetLine; categories?: Category[] }) {
  const [open, setOpen] = useState(false);
  const label = mode === "header" ? "Modifica budget" : line ? "Modifica riga" : "Aggiungi categoria";
  return <><button className="btn btn-sm btn-outline-primary" type="button" onClick={() => setOpen(true)}>{label}</button>
    {open && <Modal title={label} onClose={() => setOpen(false)}><BudgetForm budget={budget} mode={mode} line={line} categories={categories} onSaved={() => setOpen(false)} /></Modal>}</>;
}
