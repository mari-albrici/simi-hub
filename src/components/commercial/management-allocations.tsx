"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import type { ManagementAllocation, ManagementCostCategory } from "@/lib/management-allocations";
import { saveManagementAllocationAction, deleteManagementAllocationAction, loadCostEntryAllocationsAction } from "@/lib/management-allocation-actions";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatMoney } from "@/lib/formatters";
import { cents } from "@/lib/money";
import { LoadingSpinner } from "@/components/ui/loading";

type ProjectOption = { id: string; project_code: string; name: string };

function AllocationForm({ invoiceId, costEntryId, allocation, projects, costCategories, maximum, currency, defaultCategoryId, onSaved }: {
  invoiceId?: string;
  costEntryId?: string;
  allocation?: ManagementAllocation;
  projects: ProjectOption[];
  costCategories: ManagementCostCategory[];
  onSaved: () => void;
  maximum: number;
  currency: string;
  defaultCategoryId?: string | null;
}) {
  const [state, action, pending] = useActionState(saveManagementAllocationAction, { error: null });
  const inactiveCategory = allocation?.cost_category && !allocation.cost_category.is_active;
  const [categoryId, setCategoryId] = useState(inactiveCategory ? "keep" : allocation ? allocation.cost_category_id ?? "" : costCategories.find(category => category.id === defaultCategoryId && category.is_active)?.id ?? "");
  useEffect(() => {
    if (state.success) onSaved();
  }, [state, onSaved]);
  return <form action={action}>
    {invoiceId && <input type="hidden" name="invoice_id" value={invoiceId} />}
    {costEntryId && <input type="hidden" name="cost_entry_id" value={costEntryId} />}
    {allocation && <input type="hidden" name="id" value={allocation.id} />}
    <input type="hidden" name="cost_category_id" value={categoryId === "keep" ? allocation?.cost_category_id ?? "" : categoryId} />
    {state.error && <div className="alert alert-danger" role="alert">{state.error}</div>}
    <fieldset disabled={pending}>
      <div className="mb-3">
        <label className="form-label" htmlFor="allocation-project">Commessa</label>
        <select id="allocation-project" name="project_id" className="form-select" defaultValue={allocation?.project_id ?? ""} required>
          <option value="">Seleziona commessa</option>
          {allocation && !projects.some(project => project.id === allocation.project_id) &&
            <option value={allocation.project_id}>{allocation.project?.project_code ?? allocation.project_id} (commessa attuale)</option>}
          {projects.map(project => <option key={project.id} value={project.id}>{project.project_code} — {project.name}</option>)}
        </select>
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="allocation-category">Categoria di costo</label>
        {inactiveCategory && <p className="small text-muted">Categoria attuale: {allocation.cost_category?.name} (disattivata).</p>}
        <select id="allocation-category" className="form-select" value={categoryId} onChange={event => setCategoryId(event.target.value)}>
          {inactiveCategory && <option value="keep">Mantieni categoria attuale</option>}
          <option value="">Non classificato</option>
          {costCategories.filter(category => category.is_active).map(category =>
            <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="allocation-amount">Importo</label>
        <input id="allocation-amount" name="allocated_amount" type="number" className="form-control"
          min="0.01" max={maximum.toFixed(2)} step="0.01" defaultValue={allocation?.allocated_amount} required />
        <div className="form-text">{allocation ? "Massimo modificabile" : "Residuo allocabile"}: {formatMoney(maximum, currency)}</div>
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="allocation-method">Metodo</label>
        <select id="allocation-method" name="allocation_method" className="form-select" defaultValue={allocation?.allocation_method ?? "manual"}>
          <option value="direct">Diretto</option>
          <option value="manual">Manuale</option>
        </select>
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="allocation-notes">Note</label>
        <textarea id="allocation-notes" name="notes" className="form-control" maxLength={2000} defaultValue={allocation?.notes ?? ""} />
      </div>
      <SubmitButton pendingLabel="Salvataggio…">Salva allocazione</SubmitButton>
    </fieldset>
  </form>;
}

function DeleteAllocation({ allocation, onChanged }: { allocation: ManagementAllocation; onChanged?: () => void }) {
  const [state, action] = useActionState(deleteManagementAllocationAction, { error: null });
  useEffect(() => { if (state.success) onChanged?.(); }, [state.success, onChanged]);
  return <form action={action}>
    {allocation.invoice_id && <input type="hidden" name="invoice_id" value={allocation.invoice_id} />}
    {allocation.cost_entry_id && <input type="hidden" name="cost_entry_id" value={allocation.cost_entry_id} />}
    <input type="hidden" name="id" value={allocation.id} />
    <ConfirmSubmitButton confirmMessage="Eliminare questa allocazione gestionale?" pendingLabel="Eliminazione…">
      Elimina
    </ConfirmSubmitButton>
    {state.error && <div className="text-danger small mt-1" role="alert">{state.error}</div>}
  </form>;
}

export function ManagementAllocations({ invoiceId, costEntryId, amountTotal, currency, allocations, projects, costCategories, canUpdate, defaultCategoryId, costCenterName, inlineForms = false, onChanged }: {
  invoiceId?: string;
  costEntryId?: string;
  amountTotal: number;
  currency: string;
  allocations: ManagementAllocation[];
  projects: ProjectOption[];
  costCategories: ManagementCostCategory[];
  canUpdate: boolean;
  defaultCategoryId?: string | null;
  costCenterName?: string | null;
  inlineForms?: boolean;
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState<ManagementAllocation | "new" | null>(null);
  const [saved, setSaved] = useState(false);
  const finishEdit = useCallback(() => { setEditing(null); setSaved(true); onChanged?.(); }, [onChanged]);
  const allocatedCents = allocations.reduce((total, allocation) => total + cents(allocation.allocated_amount), 0);
  const residualCents = Math.abs(cents(amountTotal)) - allocatedCents;
  const money = (value: number) => formatMoney(value, currency);
  const editForm = editing && <AllocationForm key={editing === "new" ? "new" : editing.id} invoiceId={invoiceId} costEntryId={costEntryId ?? (editing !== "new" ? editing.cost_entry_id ?? undefined : undefined)}
    allocation={editing === "new" ? undefined : editing} projects={projects} costCategories={costCategories}
    defaultCategoryId={defaultCategoryId} currency={currency}
    maximum={(residualCents + (editing === "new" ? 0 : cents(editing.allocated_amount))) / 100} onSaved={finishEdit} />;
  const categoryTotals = new Map<string, { name: string; amountCents: number; sortOrder: number }>();
  for (const allocation of allocations) {
    const key = allocation.cost_category_id ?? "unclassified";
    const entry = categoryTotals.get(key) ?? {
      name: allocation.cost_category?.name ?? (allocation.cost_category_id ? "Categoria non disponibile" : "Non classificato"),
      amountCents: 0,
      sortOrder: allocation.cost_category?.sort_order ?? Number.MAX_SAFE_INTEGER,
    };
    entry.amountCents += cents(allocation.allocated_amount);
    categoryTotals.set(key, entry);
  }

  return <section className="app-card p-3 mb-3" aria-labelledby="management-allocation-title">
    <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
      <h2 id="management-allocation-title" className="h5 mb-0">Imputazione gestionale</h2>
      {canUpdate && <button type="button" className="btn btn-sm btn-outline-dark"
        disabled={residualCents <= 0} onClick={() => { setSaved(false); setEditing("new"); }}>Aggiungi allocazione</button>}
    </div>
    {saved && <div className="alert alert-success" role="status">Allocazione salvata.</div>}
    <dl className="row mb-3">
      <dt className="col-sm-4">{costEntryId ? "Importo originale" : "Totale fattura"}</dt><dd className="col-sm-8">{money(amountTotal)}</dd>
      <dt className="col-sm-4">Totale allocato</dt><dd className="col-sm-8">{money(allocatedCents / 100)}</dd>
      <dt className="col-sm-4">Residuo da allocare</dt><dd className="col-sm-8">{money(residualCents / 100)}</dd>
    </dl>
    {costCenterName && residualCents > 0 && <p className="small text-muted">Residuo in {costCenterName}: {money(residualCents / 100)}</p>}
    {allocations.length ? <div className="table-responsive">
      <table className="table align-middle">
        <thead><tr><th>Commessa</th><th>Categoria</th><th className="text-end">Importo</th><th>Metodo</th><th>Note</th>{canUpdate && <th>Azioni</th>}</tr></thead>
        <tbody>{allocations.map(allocation => <tr key={allocation.id}>
          <td>{allocation.project ? `${allocation.project.project_code} — ${allocation.project.name}` : allocation.project_id}</td>
          <td>{allocation.cost_category?.name ?? (allocation.cost_category_id ? "Categoria non disponibile" : "Non classificato")}</td>
          <td className="text-end text-nowrap">{money(allocation.allocated_amount)}</td>
          <td><span className="badge text-bg-light">{allocation.allocation_method === "direct" ? "Diretto" : "Manuale"}</span></td>
          <td className="text-break">{allocation.notes || "—"}</td>
          {canUpdate && <td><div className="d-flex gap-2 flex-wrap">
            <button type="button" className="btn btn-sm btn-outline-secondary"
              onClick={() => { setSaved(false); setEditing(allocation); }}>Modifica</button>
            <DeleteAllocation allocation={allocation} onChanged={onChanged} />
          </div></td>}
        </tr>)}</tbody>
      </table>
    </div> : <p className="text-muted mb-0">Nessuna allocazione gestionale.</p>}
    {allocations.some(allocation => allocation.cost_category_id !== null) && <div className="mt-3">
      <h3 className="h6">Riepilogo gestionale</h3>
      <div className="table-responsive"><table className="table table-sm mb-0">
        <thead><tr><th>Categoria</th><th className="text-end">Importo</th></tr></thead>
        <tbody>{[...categoryTotals].sort((a, b) => a[1].sortOrder - b[1].sortOrder || a[1].name.localeCompare(b[1].name, "it"))
          .map(([id, entry]) => <tr key={id}><td>{entry.name}</td><td className="text-end">{money(entry.amountCents / 100)}</td></tr>)}</tbody>
      </table></div>
    </div>}
    {canUpdate && editing && (inlineForms ? <div className="border-top pt-3 mt-3">
      <div className="d-flex justify-content-between mb-2"><h3 className="h6">{editing === "new" ? "Aggiungi allocazione" : "Modifica allocazione"}</h3>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(null)}>Annulla</button></div>
      {editForm}
    </div> : <Modal title={editing === "new" ? "Aggiungi allocazione" : "Modifica allocazione"} onClose={() => setEditing(null)}>{editForm}</Modal>)}
  </section>;
}

export function CostEntryAllocationsModal({ costEntryId, canUpdate, onClose }: { costEntryId: string; canUpdate: boolean; onClose: () => void }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadCostEntryAllocationsAction>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => { setVersion(value => value + 1); }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadCostEntryAllocationsAction(costEntryId).then(value => {
      if (!cancelled) { setResult(value); setLoading(false); }
    }).catch(() => {
      if (!cancelled) { setResult({ error: "Caricamento non riuscito. Riprova.", data: null }); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [costEntryId, version]);
  const data = result?.data;
  return <Modal title="Gestisci allocazioni" onClose={onClose} size="xl">
    {loading && <div className="mb-3"><LoadingSpinner label="Caricamento allocazioni…" /></div>}
    {result?.error && <div className="alert alert-danger" role="alert">{result.error} <button className="btn btn-sm btn-outline-danger ms-2" type="button" onClick={refresh}>Riprova</button></div>}
    {data && <>
      <p className="fw-semibold mb-1">{data.entry.description}</p>
      <p className="small text-muted">Categoria: {data.entry.cost_category_name ?? "Non classificato"}{data.entry.cost_center_name ? ` · Centro di costo: ${data.entry.cost_center_name}` : ""}</p>
      {data.entry.status === "excluded" && <p className="alert alert-warning">Costo escluso: allocazioni in sola lettura.</p>}
      <ManagementAllocations costEntryId={data.entry.id} invoiceId={data.entry.source_type === "invoice" ? data.entry.source_id ?? undefined : undefined}
        amountTotal={data.entry.amount} currency={data.entry.currency} allocations={data.allocations}
        projects={data.projects} costCategories={data.categories} defaultCategoryId={data.entry.cost_category_id}
        costCenterName={data.entry.cost_center_name} canUpdate={canUpdate && data.entry.status === "active" && !loading}
        inlineForms onChanged={refresh} />
    </>}
  </Modal>;
}
