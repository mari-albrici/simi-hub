"use client";
import { useActionState, useEffect, useState } from "react";
import type { ManagementCostPool } from "@/lib/management-cost-pools";
import type { ManagementCostCenter } from "@/lib/cost-entries";
import { saveManagementCostPoolAction } from "@/lib/management-cost-pool-actions";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

function PoolForm({ pool, centers, onSaved }: { pool?: ManagementCostPool; centers: ManagementCostCenter[]; onSaved: () => void }) {
  const [state, action, pending] = useActionState(saveManagementCostPoolAction, { error: null, success: false });
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  const locked = Boolean(pool?.linked_cost_entries_count);
  return <form action={action}>
    {pool && <input type="hidden" name="id" value={pool.id} />}
    {state.error && <div className="alert alert-danger" role="alert">{state.error}</div>}
    <fieldset disabled={pending} className="row g-3">
      <div className="col-md-6"><label className="form-label" htmlFor="pool-code">Codice</label><input id="pool-code" name="code" className="form-control" required maxLength={100} defaultValue={pool?.code ?? "small_equipment"} /></div>
      <div className="col-md-6"><label className="form-label" htmlFor="pool-name">Nome</label><input id="pool-name" name="name" className="form-control" required maxLength={200} defaultValue={pool?.name ?? "Piccola attrezzatura"} /></div>
      <div className="col-12"><label className="form-label" htmlFor="pool-description">Descrizione</label><textarea id="pool-description" name="description" className="form-control" maxLength={2000} defaultValue={pool?.description ?? ""} /></div>
      <div className="col-md-8"><label className="form-label" htmlFor="pool-center">Centro di costo</label>
        {locked && <input type="hidden" name="cost_center_id" value={pool!.cost_center_id} />}
        <select id="pool-center" name="cost_center_id" className="form-select" required disabled={locked} defaultValue={pool?.cost_center_id ?? centers.find(center => center.code === "small_equipment" && center.is_active)?.id ?? ""}>
          <option value="">Seleziona centro</option>
          {pool && !centers.some(center => center.id === pool.cost_center_id && center.is_active) && <option value={pool.cost_center_id}>Mantieni centro attuale ({pool.cost_center_name})</option>}
          {centers.filter(center => center.is_active).map(center => <option key={center.id} value={center.id}>{center.name}</option>)}
        </select>
      </div>
      <div className="col-md-4"><label className="form-label" htmlFor="pool-currency">Valuta</label><input id="pool-currency" name="currency" className="form-control" required pattern="[A-Za-z]{3}" maxLength={3} readOnly={locked} defaultValue={pool?.currency ?? "EUR"} /></div>
      {locked && <p className="small text-muted mb-0">Centro e valuta restano fissi finché sono presenti costi collegati.</p>}
      <div className="col-md-6"><label className="form-label" htmlFor="pool-start">Data inizio</label><input id="pool-start" name="period_start" type="date" className="form-control" required defaultValue={pool?.period_start} /></div>
      <div className="col-md-6"><label className="form-label" htmlFor="pool-end">Data fine</label><input id="pool-end" name="period_end" type="date" className="form-control" required defaultValue={pool?.period_end} /></div>
      <div className="col-md-6"><label className="form-label" htmlFor="pool-driver">Driver</label><select id="pool-driver" name="driver_type" className="form-select" defaultValue={pool?.driver_type ?? "labor_hours"}>
        <option value="labor_hours">Ore lavorate</option><option value="worker_days">Giornate-uomo</option>
      </select><div className="form-text">Con driver per commessa presenti, unità, centro e valuta non sono modificabili.</div></div>
      <div className="col-md-6"><label className="form-label" htmlFor="pool-quantity">Quantità driver prevista</label><input id="pool-quantity" name="planned_driver_quantity" type="number" min="0" max="999999999999.99" step="0.01" className="form-control" defaultValue={pool?.planned_driver_quantity ?? ""} /></div>
      <div className="col-md-6"><label className="form-label" htmlFor="pool-status">Stato</label><select id="pool-status" name="status" className="form-select" defaultValue={pool?.status ?? "draft"}>
        <option value="draft">Bozza</option><option value="active">Attivo</option><option value="closed">Chiuso</option>
      </select></div>
      <div className="col-12"><label className="form-label" htmlFor="pool-notes">Note</label><textarea id="pool-notes" name="notes" className="form-control" maxLength={2000} defaultValue={pool?.notes ?? ""} /></div>
      <p className="small text-muted mb-0">Tariffa calcolata dai costi attivi con segno reale. Con quantità prevista assente o zero la tariffa non è disponibile.</p>
      <div className="col-12"><SubmitButton pendingLabel="Salvataggio…">Salva pool</SubmitButton></div>
    </fieldset>
  </form>;
}

export function PoolFormTrigger({ pool, centers }: { pool?: ManagementCostPool; centers: ManagementCostCenter[] }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return <>
    <button type="button" className={pool ? "btn btn-sm btn-outline-secondary" : "btn btn-dark"} onClick={() => { setSaved(false); setOpen(true); }}>{pool ? "Modifica" : "Nuovo pool"}</button>
    {saved && <span className="small text-success ms-2" role="status">Salvato</span>}
    {open && <Modal title={pool ? "Modifica pool" : "Nuovo pool"} onClose={() => setOpen(false)} size="lg">
      <PoolForm pool={pool} centers={centers} onSaved={() => { setOpen(false); setSaved(true); }} />
    </Modal>}
  </>;
}
