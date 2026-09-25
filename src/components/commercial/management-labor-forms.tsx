"use client";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { saveEmployeeRateAction, saveLaborEntryAction } from "@/lib/management-labor-actions";
import type { EmployeeManagementRate, ProjectLaborEntry, LaborEmployee } from "@/lib/management-labor";
import { LABOR_HOUR_TYPES } from "@/lib/constants";
const initial = { error: null as string | null, success: false };
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="col-md-6"><label className="form-label w-100">{label}{children}</label></div>;
}
function RateForm({ employeeId, rate, onSaved }: { employeeId: string; rate?: EmployeeManagementRate; onSaved: () => void }) {
  const [state, action, pending] = useActionState(saveEmployeeRateAction, initial);
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  return <form action={action}>
    <input type="hidden" name="employee_id" value={employeeId} />{rate && <input type="hidden" name="id" value={rate.id} />}
    {state.error && <p className="alert alert-danger" role="alert">{state.error}</p>}
    <fieldset className="row g-3" disabled={pending}>
      <Field label="Valida dal"><input name="valid_from" type="date" required className="form-control" defaultValue={rate?.valid_from} /></Field>
      <Field label="Valida al"><input name="valid_to" type="date" className="form-control" defaultValue={rate?.valid_to ?? ""} /></Field>
      <Field label="Costo orario gestionale"><input name="hourly_cost" type="number" min="0" max="99999999.999999" step="0.000001" required className="form-control" defaultValue={rate?.hourly_cost} /></Field>
      <Field label="Valuta"><input name="currency" className="form-control" maxLength={3} pattern="[A-Za-z]{3}" required defaultValue={rate?.currency ?? "EUR"} /></Field>
      <Field label="Note"><textarea name="notes" className="form-control" maxLength={2000} defaultValue={rate?.notes ?? ""} /></Field>
      <p className="small text-muted mb-0">Costo interno di controllo di gestione. Chiudi la validità della tariffa precedente prima di inserire un nuovo periodo sovrapposto. Le ore già registrate mantengono il costo storico.</p>
      <div className="col-12"><SubmitButton>Salva tariffa</SubmitButton></div>
    </fieldset>
  </form>;
}
export function EmployeeRateTrigger({ employeeId, rate }: { employeeId: string; rate?: EmployeeManagementRate }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setOpen(true)}>{rate ? "Modifica tariffa" : "Nuova tariffa"}</button>
    {open && <Modal title="Costo gestionale" size="lg" onClose={() => setOpen(false)}><RateForm employeeId={employeeId} rate={rate} onSaved={() => setOpen(false)} /></Modal>}</>;
}
function LaborForm({ projectId, employees, entry, onSaved }: { projectId: string; employees: LaborEmployee[]; entry?: ProjectLaborEntry; onSaved: () => void }) {
  const [state, action, pending] = useActionState(saveLaborEntryAction, initial);
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  return <form action={action}><input type="hidden" name="project_id" value={projectId} />{entry && <input type="hidden" name="id" value={entry.id} />}
    {state.error && <p className="alert alert-danger" role="alert">{state.error}</p>}
    <fieldset className="row g-3" disabled={pending}>
      <Field label="Dipendente"><select name="employee_id" required className="form-select" defaultValue={entry?.employee_id ?? ""}><option value="">Seleziona dipendente</option>
        {entry && !employees.some(e => e.employee_id === entry.employee_id && e.is_available) && <option value={entry.employee_id}>{entry.employee_name} (non disponibile)</option>}
        {employees.filter(e => e.is_available).map(e => <option key={e.employee_id} value={e.employee_id}>{e.employee_name}</option>)}
      </select></Field>
      <Field label="Data"><input name="work_date" type="date" required className="form-control" defaultValue={entry?.work_date} /></Field>
      <Field label="Ore"><input name="hours" type="number" required min="0.01" max="999999.99" step="0.01" className="form-control" defaultValue={entry?.hours} /></Field>
      <Field label="Tipo ore"><select name="hour_type" className="form-select" defaultValue={entry?.hour_type ?? "ordinary"}>{Object.entries(LABOR_HOUR_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label="Note"><textarea name="notes" className="form-control" maxLength={2000} defaultValue={entry?.notes ?? ""} /></Field>
      <p className="small text-muted mb-0">Il costo viene calcolato dalla tariffa gestionale valida alla data indicata, senza maggiorazioni per tipo ore. Modificare solo le ore mantiene la tariffa storica.</p>
      <div className="col-12"><SubmitButton>Salva ore</SubmitButton></div>
    </fieldset>
  </form>;
}
export function LaborEntryTrigger({ projectId, employees, entry }: { projectId: string; employees: LaborEmployee[]; entry?: ProjectLaborEntry }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setOpen(true)}>{entry ? "Modifica" : "Aggiungi ore"}</button>
    {open && <Modal title="Manodopera" size="lg" onClose={() => setOpen(false)}><LaborForm projectId={projectId} employees={employees} entry={entry} onSaved={() => setOpen(false)} /></Modal>}</>;
}
export function CancelLaborEntry({ entry }: { entry: ProjectLaborEntry }) {
  const [state, action] = useActionState(saveLaborEntryAction, initial);
  return <form action={action}><input type="hidden" name="operation" value="cancel" /><input type="hidden" name="id" value={entry.id} />
    <ConfirmSubmitButton confirmMessage="Annullare le ore? Il costo sarà escluso dalla commessa. I driver già importati richiedono un nuovo calcolo dalle ore.">Annulla</ConfirmSubmitButton>
    {state.error && <p role="alert" className="text-danger">{state.error}</p>}
  </form>;
}
