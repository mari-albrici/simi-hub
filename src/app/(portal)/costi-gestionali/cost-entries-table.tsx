"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import type { CostEntry, ManagementCostCenter } from "@/lib/cost-entries";
import type { ManagementCostCategory } from "@/lib/management-allocations";
import type { ManagementCostPool } from "@/lib/management-cost-pools";
import { saveCostEntryAction } from "@/lib/cost-entry-actions";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import Link from "@/components/ui/app-link";
import { formatDate, formatMoney } from "@/lib/formatters";
import { CostEntryAllocationsModal } from "@/components/commercial/management-allocations";

type Option = { id: string; name: string };
type Options = { centers: ManagementCostCenter[]; categories: ManagementCostCategory[]; suppliers: Option[]; entities: Option[]; pools: ManagementCostPool[] };

function ClassificationSelect({ name, label, options, currentId, currentName, onValueChange }: {
  name: string; label: string; options: (Option & { is_active: boolean })[];
  currentId?: string | null; currentName?: string | null;
  onValueChange?: (id: string) => void;
}) {
  const historical = currentId && !options.some(option => option.id === currentId && option.is_active);
  const [value, setValue] = useState(historical ? "keep" : currentId ?? "");
  return <div className="col-md-6">
    <label className="form-label" htmlFor={`cost-${name}`}>{label}</label>
    {historical && <p className="small text-muted mb-1">Attuale: {currentName ?? currentId} (non attivo).</p>}
    <input type="hidden" name={name} value={value === "keep" ? currentId ?? "" : value} />
    <select id={`cost-${name}`} className="form-select" value={value} onChange={event => { setValue(event.target.value); onValueChange?.(event.target.value === "keep" ? currentId ?? "" : event.target.value); }}>
      {historical && <option value="keep">Mantieni valore attuale</option>}
      <option value="">Nessuno</option>
      {options.filter(option => option.is_active).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
  </div>;
}

function CostForm({ entry, options, onSaved }: { entry?: CostEntry; options: Options; onSaved: () => void }) {
  const [state, action, pending] = useActionState(saveCostEntryAction, { error: null });
  const invoice = entry?.source_type === "invoice";
  const [centerId, setCenterId] = useState(entry?.cost_center_id ?? "");
  const [currency, setCurrency] = useState(entry?.currency ?? "EUR");
  const [poolId, setPoolId] = useState(entry?.cost_pool_id ?? "");
  const compatiblePools = options.pools.filter(pool => pool.status !== "closed" && (!centerId || pool.cost_center_id === centerId) && pool.currency === currency.toUpperCase()
    && options.centers.some(center => center.id === pool.cost_center_id && center.is_active));
  const historicalPool = options.pools.find(pool => pool.id === entry?.cost_pool_id && pool.id === poolId
    && (!centerId || pool.cost_center_id === centerId) && pool.currency === currency.toUpperCase());
  const incompatiblePool = Boolean(poolId && !historicalPool && !compatiblePools.some(pool => pool.id === poolId));
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  return <form action={action}>
    <input type="hidden" name="operation" value={invoice ? "classify" : entry ? "update" : "create"} />
    {entry && <input type="hidden" name="id" value={entry.id} />}
    {state.error && <div className="alert alert-danger" role="alert">{state.error}</div>}
    {invoice && <p>{entry.description} · {formatMoney(entry.amount, entry.currency)}</p>}
    <fieldset disabled={pending} className="row g-3">
      {!invoice && <>
        <div className="col-md-4"><label className="form-label" htmlFor="cost-date">Data</label>
          <input id="cost-date" name="cost_date" type="date" className="form-control" required defaultValue={entry?.cost_date ?? new Date().toISOString().slice(0, 10)} /></div>
        <div className="col-md-8"><label className="form-label" htmlFor="cost-description">Descrizione</label>
          <input id="cost-description" name="description" className="form-control" required maxLength={2000} defaultValue={entry?.description} /></div>
        <div className="col-md-6"><label className="form-label" htmlFor="cost-amount">Importo</label>
          <input id="cost-amount" name="amount" type="number" step="0.01" min="-999999999999.99" max="999999999999.99" required className="form-control" defaultValue={entry?.amount} /></div>
        <div className="col-md-6"><label className="form-label" htmlFor="cost-currency">Valuta</label>
          <input id="cost-currency" name="currency" className="form-control" minLength={3} maxLength={3} pattern="[A-Za-z]{3}" required value={currency} onChange={event => setCurrency(event.target.value)} /></div>
      </>}
      <ClassificationSelect name="cost_category_id" label="Categoria" options={options.categories} currentId={entry?.cost_category_id} currentName={entry?.cost_category_name} />
      <ClassificationSelect name="cost_center_id" label="Centro di costo" options={options.centers} currentId={entry?.cost_center_id} currentName={entry?.cost_center_name} onValueChange={setCenterId} />
      <div className="col-12"><label className="form-label" htmlFor="cost-pool">Pool di costo</label>
        <input type="hidden" name="cost_pool_id" value={poolId} />
        <select id="cost-pool" className="form-select" value={incompatiblePool ? "" : poolId} required={incompatiblePool} onChange={event => setPoolId(event.target.value)}>
          <option value="">Nessuno</option>
          {historicalPool && !compatiblePools.some(pool => pool.id === historicalPool.id) && <option value={historicalPool.id}>Mantieni pool attuale ({historicalPool.name})</option>}
          {compatiblePools.map(pool => <option key={pool.id} value={pool.id}>{pool.name} · {formatDate(pool.period_start)} – {formatDate(pool.period_end)}</option>)}
        </select>
        {incompatiblePool && <p className="text-danger small mb-0">Il pool selezionato non è compatibile con centro o valuta. Seleziona un pool compatibile oppure <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setPoolId("")}>rimuovi il collegamento</button>.</p>}
        {!centerId && poolId && <div className="form-text">Il centro di costo verrà impostato dal pool scelto.</div>}
      </div>
      {!invoice && <>
        <div className="col-md-6"><label className="form-label" htmlFor="cost-entity">Società SIMI</label>
          <select id="cost-entity" name="legal_entity_id" className="form-select" defaultValue={entry?.legal_entity_id ?? ""}>
            <option value="">Nessuna</option>
            {entry?.legal_entity_id && !options.entities.some(option => option.id === entry.legal_entity_id) && <option value={entry.legal_entity_id}>Società attuale</option>}
            {options.entities.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select></div>
        <div className="col-md-6"><label className="form-label" htmlFor="cost-supplier">Fornitore</label>
          <select id="cost-supplier" name="supplier_id" className="form-select" defaultValue={entry?.supplier_id ?? ""}>
            <option value="">Nessuno</option>
            {entry?.supplier_id && !options.suppliers.some(option => option.id === entry.supplier_id) && <option value={entry.supplier_id}>{entry.supplier_name ?? "Fornitore attuale"}</option>}
            {options.suppliers.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select></div>
      </>}
      <div className="col-12"><label className="form-label" htmlFor="cost-notes">Note gestionali</label>
        <textarea id="cost-notes" name="notes" className="form-control" maxLength={2000} defaultValue={entry?.notes ?? ""} /></div>
      <div className="col-12"><SubmitButton pendingLabel="Salvataggio…">Salva</SubmitButton></div>
    </fieldset>
  </form>;
}

function ExcludeCost({ id }: { id: string }) {
  const [state, action] = useActionState(saveCostEntryAction, { error: null });
  return <form action={action}>
    <input type="hidden" name="operation" value="exclude" /><input type="hidden" name="id" value={id} />
    <ConfirmSubmitButton confirmMessage="Escludere questo costo dal registro attivo?" pendingLabel="Esclusione…">Escludi</ConfirmSubmitButton>
    {state.error && <p className="text-danger small mb-0" role="alert">{state.error}</p>}
  </form>;
}

const statuses: Record<CostEntry["management_status"], { label: string; variant: string }> = {
  allocated: { label: "Allocato", variant: "success" },
  partially_allocated: { label: "Parzialmente allocato", variant: "warning" },
  cost_center: { label: "In centro di costo", variant: "info" },
  unallocated: { label: "Da gestire", variant: "secondary" },
  excluded: { label: "Escluso", variant: "secondary" },
};

export function CostEntriesTable({ entries, canUpdate, ...options }: Options & { entries: CostEntry[]; canUpdate: boolean }) {
  const [editing, setEditing] = useState<CostEntry | "new" | null>(null);
  const [allocatingId, setAllocatingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const onSaved = useCallback(() => { setEditing(null); setSaved(true); }, []);
  return <div className="app-card p-3">
    {canUpdate && <div className="mb-3"><button className="btn btn-dark" type="button" onClick={() => { setSaved(false); setEditing("new"); }}>Nuovo costo manuale</button></div>}
    {saved && <div className="alert alert-success" role="status">Costo aggiornato.</div>}
    {entries.length ? <div className="table-responsive"><table className="table table-sm align-middle">
      <thead><tr><th>Data</th><th>Descrizione</th><th>Origine</th><th>Categoria</th><th>Centro di costo</th><th>Fornitore</th><th className="text-end">Importo</th><th className="text-end">Allocato</th><th className="text-end">Residuo</th><th>Stato</th><th>Azioni</th></tr></thead>
      <tbody>{entries.map(entry => <tr key={entry.id}>
        <td className="text-nowrap">{formatDate(entry.cost_date)}</td><td>{entry.description}</td>
        <td>{entry.source_type === "invoice" ? <Link href={`/fatture/${entry.source_id}`}>Fattura</Link> : "Manuale"}</td>
        <td>{entry.cost_category_name ?? "—"}</td><td title={entry.cost_center_code ?? undefined}>{entry.cost_center_name ?? "—"}</td>
        <td>{entry.supplier_name ?? "—"}</td><td className="text-end text-nowrap">{formatMoney(entry.amount, entry.currency)}</td>
        <td className="text-end text-nowrap">{formatMoney(entry.allocated_amount, entry.currency)}</td>
        <td className="text-end text-nowrap">{formatMoney(entry.remaining_amount, entry.currency)}
          {entry.cost_center_name && entry.remaining_amount > 0 && <div className="small text-muted text-wrap">Residuo in {entry.cost_center_name}: {formatMoney(entry.remaining_amount, entry.currency)}</div>}
        </td>
        <td><span className={`badge text-bg-${statuses[entry.management_status].variant}`}>{statuses[entry.management_status].label}</span></td>
        <td><div className="d-flex gap-2 flex-wrap">
          {entry.status === "active" && <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => setAllocatingId(entry.id)}>Gestisci allocazioni</button>}
          {canUpdate && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setSaved(false); setEditing(entry); }}>{entry.source_type === "invoice" ? "Classifica" : "Modifica"}</button>}
          {canUpdate && entry.source_type === "manual" && entry.status === "active" && <ExcludeCost id={entry.id} />}
        </div></td>
      </tr>)}</tbody>
    </table></div> : <p className="text-muted mb-0">Nessun costo gestionale trovato.</p>}
    {canUpdate && editing && <Modal title={editing === "new" ? "Nuovo costo manuale" : editing.source_type === "invoice" ? "Classificazione costo" : "Modifica costo manuale"} onClose={() => setEditing(null)} size="lg">
      <CostForm entry={editing === "new" ? undefined : editing} options={options} onSaved={onSaved} />
    </Modal>}
    {allocatingId && <CostEntryAllocationsModal costEntryId={allocatingId} canUpdate={canUpdate} onClose={() => setAllocatingId(null)} />}
  </div>;
}
