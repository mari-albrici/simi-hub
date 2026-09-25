"use client";
import { useActionState, useState } from "react";
import Link from "@/components/ui/app-link";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { costPoolDriverAction } from "@/lib/management-cost-pool-actions";
import type { ManagementCostPool, PoolDriverEntry, PoolDistributionSummary, PoolProjectOption } from "@/lib/management-cost-pools";
import { formatMoney, formatNumber } from "@/lib/formatters";

const initialState = { error: null, message: null } as { error: string | null; message: string | null };
function Feedback({ state }: { state: typeof initialState }) {
  return <>{state.error && <p role="alert" className="alert alert-danger mt-2">{state.error}</p>}
    {state.message && <p role="status" className="alert alert-success mt-2">{state.message}</p>}</>;
}

function DriverForm({ pool, entry, projects }: { pool: ManagementCostPool; entry?: PoolDriverEntry; projects: PoolProjectOption[] }) {
  const [state, action, pending] = useActionState(costPoolDriverAction, initialState);
  const unit = pool.driver_type === "labor_hours" ? "h" : "giornate-uomo";
  return <form action={action} className="border rounded p-3 my-2">
    <input type="hidden" name="pool_id" value={pool.id} />
    {entry && <><input type="hidden" name="id" value={entry.id} /><input type="hidden" name="project_id" value={entry.project_id} /></>}
    <fieldset disabled={pending} className="row g-2 align-items-end">
      {!entry && <div className="col-md-5"><label className="form-label w-100">Commessa
        <select name="project_id" className="form-select" required defaultValue=""><option value="">Seleziona commessa</option>
          {projects.map(project => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}
        </select></label></div>}
      <div className="col-md-3"><label className="form-label w-100">Quantità ({unit})
        <input name="driver_quantity" type="number" min="0" max="999999999999.99" step="0.01" required className="form-control" defaultValue={entry?.driver_quantity} /></label></div>
      <div className="col-md-4"><label className="form-label w-100">Note
        <input name="notes" maxLength={2000} className="form-control" defaultValue={entry?.notes ?? ""} /></label></div>
      <div><SubmitButton>{entry ? "Salva quantità" : "Aggiungi commessa"}</SubmitButton></div>
    </fieldset>
    <Feedback state={state} />
  </form>;
}

function RemoveDriver({ entry }: { entry: PoolDriverEntry }) {
  const [state, action] = useActionState(costPoolDriverAction, initialState);
  return <form action={action}>
    <input type="hidden" name="pool_id" value={entry.pool_id} /><input type="hidden" name="id" value={entry.id} />
    <input type="hidden" name="operation" value="remove" />
    <ConfirmSubmitButton confirmMessage={`Rimuovere il driver di ${entry.project_code} e la relativa allocazione generata?`}>Rimuovi quantità</ConfirmSubmitButton>
    <Feedback state={state} />
  </form>;
}

export function PoolDrivers({ pool, entries, summary, projects, canUpdate }: {
  pool: ManagementCostPool; entries: PoolDriverEntry[]; summary: PoolDistributionSummary;
  projects: PoolProjectOption[]; canUpdate: boolean;
}) {
  const [state, action] = useActionState(costPoolDriverAction, initialState);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const editable = canUpdate && pool.status !== "closed";
  const unit = pool.driver_type === "labor_hours" ? "h" : "giornate-uomo";
  const rate = (value: number | null) => value === null ? "—" : `${formatNumber(value, 6)} ${pool.currency}/${unit}`;
  const available = projects.filter(project => !entries.some(entry => entry.project_id === project.id));
  const stale = entries.some(entry => entry.generated_at === null || Number(entry.generated_quantity) !== Number(entry.driver_quantity)
    || Number(entry.generated_rate) !== Number(pool.standard_rate));
  return <section className="border-top pt-3 mt-3" aria-labelledby="pool-drivers-title">
    <h3 className="h5" id="pool-drivers-title">Driver per commessa</h3>
    <div className="row g-3 mb-3">
      {[["Driver previsto", `${formatNumber(pool.planned_driver_quantity)} ${unit}`],
        ["Driver inserito", `${formatNumber(summary.total_driver_quantity)} ${unit}`],
        ["Allocato", formatMoney(summary.total_allocated, pool.currency)],
        ["Scostamento gestionale", formatMoney(summary.pool_variance, pool.currency)]].map(([label, value]) =>
        <div className="col-md-3" key={label}><div className="small text-muted">{label}</div><strong>{value}</strong></div>)}
    </div>
    <p className="small text-muted">La quota calcolata usa la tariffa attuale. Solo Genera/Ricalcola aggiorna le quote contabilizzate nelle commesse. Lo scostamento è costi effettivi meno allocato.</p>
    {stale && <p className="alert alert-warning">Sono presenti quantità o tariffe non ancora applicate alle commesse.</p>}
    {pool.status === "closed" && <p className="small text-muted">Pool chiuso: driver e allocazioni sono in sola lettura.</p>}
    <div className="table-responsive"><table className="table table-sm align-middle">
      <thead><tr><th>Commessa</th><th>Quantità driver</th><th>Unità</th><th>Tariffa attuale</th><th>Quota calcolata</th><th>Quota generata</th>{editable && <th>Azioni</th>}</tr></thead>
      <tbody>{entries.map(entry => <tr key={entry.id}>
        <td><Link href={`/commesse/${entry.project_id}?tab=management`}>{entry.project_code}</Link><div className="small text-muted">{entry.project_name}</div>
          {entry.notes && <div className="small">{entry.notes}</div>}</td>
        <td>{formatNumber(entry.driver_quantity)}<div className="small text-muted">{entry.source_type === "labor_entries" ? "Ore registrate" : "Manuale"}</div></td><td>{unit}</td><td>{rate(entry.standard_rate)}</td>
        <td>{entry.calculated_amount === null ? "—" : formatMoney(entry.calculated_amount, pool.currency)}</td>
        <td>{entry.allocated_amount === null ? "Non generata" : <>{formatMoney(entry.allocated_amount, pool.currency)}
          <div className="small text-muted">{formatNumber(entry.generated_quantity)} {unit} × {rate(entry.generated_rate)}</div></>}</td>
        {editable && <td>{entry.source_type === "manual" && <button type="button" className="btn btn-sm btn-outline-secondary mb-1" onClick={() => setEditing(editing === entry.id ? null : entry.id)}>Modifica quantità</button>}
          <RemoveDriver entry={entry} />
          {entry.source_type === "manual" && editing === entry.id && <DriverForm key={`${entry.id}-${entry.driver_quantity}-${entry.notes}`} pool={pool} entry={entry} projects={[]} />}</td>}
      </tr>)}</tbody>
    </table></div>
    {!entries.length && <p className="text-muted">Nessuna quantità inserita.</p>}
    {editable && <>
      {pool.driver_type === "labor_hours" && <form action={action} className="mb-3">
        <input type="hidden" name="pool_id" value={pool.id} /><input type="hidden" name="operation" value="labor" />
        <ConfirmSubmitButton className="btn btn-outline-primary" confirmMessage="Calcolare le ore attive nel periodo del pool? Le righe manuali saranno conservate; le allocazioni resteranno invariate fino al ricalcolo esplicito.">Calcola dalle ore registrate</ConfirmSubmitButton>
        <p className="small text-muted mb-0 mt-1">Conserva i driver manuali. Aggiorna quelli da ore registrate e aggiunge le commesse mancanti. Le modifiche alle ore richiedono un nuovo calcolo.</p>
      </form>}
      <button type="button" className="btn btn-sm btn-outline-primary mb-2" onClick={() => setAdding(!adding)}>Aggiungi commessa</button>
      {adding && <DriverForm key={entries.length} pool={pool} projects={available} />}
      {Number(pool.standard_rate) > 0 ? <form action={action}>
        <input type="hidden" name="pool_id" value={pool.id} /><input type="hidden" name="operation" value="generate" />
        <ConfirmSubmitButton className="btn btn-primary" confirmMessage={`${summary.project_count} commesse · ${formatNumber(summary.total_driver_quantity)} ${unit} · tariffa ${rate(pool.standard_rate)} · totale ${formatMoney(summary.calculated_total, pool.currency)}. Generare/ricalcolare le allocazioni? I valori saranno verificati al salvataggio.`}>
          {summary.allocation_count > 0 ? "Ricalcola allocazioni" : "Genera allocazioni"}
        </ConfirmSubmitButton>
      </form> : <p className="small text-muted">Generazione disponibile con tariffa standard positiva e quantità prevista maggiore di zero.</p>}
      <Feedback state={state} />
    </>}
  </section>;
}
