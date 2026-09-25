"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { managementForecastAction } from "@/lib/management-forecast-actions";
import { formatMoney } from "@/lib/formatters";
import type { ManagementForecast, ManagementForecastLine, ForecastComparison } from "@/lib/management-forecasts";
const initial = { error: null as string | null, success: false, forecastId: null as string | null };
type Category = { id: string; name: string; is_active: boolean };
export function ForecastAction({ operation, projectId, forecastId }: { operation: "create" | "clone" | "approve"; projectId: string; forecastId?: string }) {
  const [state, action] = useActionState(managementForecastAction, initial);
  const router = useRouter();
  useEffect(() => { if (state.success && state.forecastId && (operation === "create" || operation === "clone")) router.push(`/commesse/${projectId}?tab=management&forecast=${state.forecastId}`); }, [state, operation, projectId, router]);
  return <form action={action}><input type="hidden" name="operation" value={operation} /><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="forecast_id" value={forecastId ?? ""} />
    {operation === "approve" ? <ConfirmSubmitButton confirmMessage="Approvare il forecast? Diventerà il riferimento corrente e il CTC sarà modificabile solo creando una revisione.">Approva forecast</ConfirmSubmitButton> : <SubmitButton className="btn btn-sm btn-outline-primary">{operation === "create" ? "Crea forecast" : "Crea revisione forecast"}</SubmitButton>}
    {state.error && <p className="text-danger" role="alert">{state.error}</p>}
  </form>;
}
type EditorProps = { forecast: ManagementForecast; mode: "header" | "line"; line?: ManagementForecastLine; categoryId?: string; categories?: Category[]; rows?: ForecastComparison["rows"] };
function ForecastForm({ forecast, mode, line, categoryId, categories = [], rows = [], onSaved }: EditorProps & { onSaved: () => void }) {
  const [state, action, pending] = useActionState(managementForecastAction, initial);
  const [category, setCategory] = useState(line?.cost_category_id ?? categoryId ?? "");
  const [ctc, setCtc] = useState(String(line?.cost_to_complete ?? 0));
  const actual = Number(rows.find(r => r.category_id === category && r.currency === forecast.currency)?.actual_cost ?? 0);
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  return <form action={action}><input type="hidden" name="operation" value={mode} /><input type="hidden" name="forecast_id" value={forecast.id} />
    {state.error && <p className="alert alert-danger" role="alert">{state.error}</p>}
    <fieldset disabled={pending} className="d-grid gap-3">
      {mode === "header" ? <>
        <label>Nome<input name="name" required maxLength={200} className="form-control" defaultValue={forecast.name} /></label>
        <label>Data forecast<input type="date" name="forecast_date" required className="form-control" defaultValue={forecast.forecast_date} /></label>
        <label>Valuta<input name="currency" required maxLength={3} pattern="[A-Za-z]{3}" className="form-control" defaultValue={forecast.currency} /></label>
      </> : <>
        {line || categoryId ? <><input type="hidden" name="cost_category_id" value={category} /><p>{categories.find(c => c.id === category)?.name ?? rows.find(r => r.category_id === category)?.category_name}</p></> : <label>Categoria<select name="cost_category_id" required className="form-select" value={category} onChange={e => setCategory(e.target.value)}><option value="">Seleziona categoria</option>{categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <label>Costo ancora previsto ({forecast.currency})<input name="cost_to_complete" type="number" required min="0" max="999999999999.99" step="0.01" className="form-control" value={ctc} onChange={e => setCtc(e.target.value)} /></label>
        <div aria-live="polite">Consuntivo: <strong>{formatMoney(actual, forecast.currency)}</strong><br />EAC risultante: <strong>{ctc !== "" && Number.isFinite(Number(ctc)) && Number(ctc) >= 0 ? formatMoney(actual + Number(ctc), forecast.currency) : "—"}</strong></div>
      </>}
      <label>Note<textarea name="notes" maxLength={2000} className="form-control" defaultValue={(mode === "header" ? forecast.notes : line?.notes) ?? ""} /></label>
      <SubmitButton>Salva</SubmitButton>
    </fieldset>
  </form>;
}
export function ForecastEditor(props: EditorProps) {
  const [open, setOpen] = useState(false);
  const label = props.mode === "header" ? "Modifica forecast" : props.line || props.categoryId ? "Modifica CTC" : "Aggiungi categoria";
  return <><button className="btn btn-sm btn-outline-primary" type="button" onClick={() => setOpen(true)}>{label}</button>
    {open && <Modal title={label} onClose={() => setOpen(false)}><ForecastForm {...props} onSaved={() => setOpen(false)} /></Modal>}</>;
}
