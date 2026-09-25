"use client";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { saveManagementAssetAction, managementAssetOperationAction } from "@/lib/management-asset-actions";
import type { ManagementAsset, AssetProject, AssetUsage } from "@/lib/management-assets";
import { MANAGEMENT_ASSET_CATEGORIES, MANAGEMENT_ASSET_METHODS, MANAGEMENT_ASSET_STATUSES } from "@/lib/constants";
import { formatMoney, formatNumber } from "@/lib/formatters";

const initialState = { error: null as string | null, success: false };
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "col-12" : "col-md-6"}><label className="form-label w-100">{label}{children}</label></div>;
}
function Options({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}
function ProjectSelect({ projects, name, defaultValue, current, warehouse = false }: {
  projects: AssetProject[]; name: string; defaultValue?: string | null; current?: AssetProject | null; warehouse?: boolean;
}) {
  return <select name={name} className="form-select" required={!warehouse} defaultValue={defaultValue ?? ""}>
    <option value="">{warehouse ? "Magazzino / non assegnato" : "Seleziona commessa"}</option>
    {defaultValue && !projects.some(project => project.id === defaultValue) && <option value={defaultValue}>{current?.project_code ?? defaultValue} (attuale)</option>}
    {projects.map(project => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}
  </select>;
}
function AssetForm({ asset, onSaved }: { asset?: ManagementAsset; onSaved: () => void }) {
  const [state, action, pending] = useActionState(saveManagementAssetAction, initialState);
  const [method, setMethod] = useState<ManagementAsset["allocation_method"]>(asset?.allocation_method ?? "daily");
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  return <form action={action}>
    {asset && <input type="hidden" name="id" value={asset.id} />}
    {state.error && <p role="alert" className="alert alert-danger">{state.error}</p>}
    <fieldset disabled={pending} className="row g-3">
      <Field label="Codice"><input name="asset_code" className="form-control" required maxLength={100} defaultValue={asset?.asset_code} /></Field>
      <Field label="Nome"><input name="name" className="form-control" required maxLength={200} defaultValue={asset?.name} /></Field>
      <Field label="Descrizione" wide><textarea name="description" className="form-control" maxLength={2000} defaultValue={asset?.description ?? ""} /></Field>
      <Field label="Categoria"><select name="category" className="form-select" defaultValue={asset?.category ?? "other"}><Options values={MANAGEMENT_ASSET_CATEGORIES} /></select></Field>
      <Field label="Data acquisto"><input name="purchase_date" type="date" className="form-control" defaultValue={asset?.purchase_date ?? ""} /></Field>
      <Field label="Costo acquisto"><input name="purchase_cost" type="number" min="0" step="0.01" max="999999999999.99" className="form-control" defaultValue={asset?.purchase_cost ?? ""} /></Field>
      <Field label="Valore gestionale"><input name="management_value" type="number" min="0" step="0.01" max="999999999999.99" className="form-control" defaultValue={asset?.management_value ?? ""} /></Field>
      <Field label="Valuta"><input name="currency" className="form-control" required pattern="[A-Za-z]{3}" maxLength={3} defaultValue={asset?.currency ?? "EUR"} /></Field>
      <Field label="Metodo imputazione"><select name="allocation_method" className="form-select" value={method} onChange={event => setMethod(event.target.value as typeof method)}><Options values={MANAGEMENT_ASSET_METHODS} /></select></Field>
      {method !== "manual" && <Field label={`Tariffa · ${MANAGEMENT_ASSET_METHODS[method]}`}><input key={method} name={`${method}_rate`} type="number" min="0" max="99999999.999999" step="0.000001" required className="form-control" defaultValue={asset?.[`${method}_rate`] ?? ""} /></Field>}
      <Field label="Stato"><select name="status" className="form-select" defaultValue={asset?.status ?? "available"}><Options values={MANAGEMENT_ASSET_STATUSES} /></select></Field>
      <Field label="Note" wide><textarea name="notes" className="form-control" maxLength={2000} defaultValue={asset?.notes ?? ""} /></Field>
      <p className="small text-muted mb-0">Costo d’acquisto e valore gestionale sono dati anagrafici. Le modifiche alle tariffe valgono per gli utilizzi registrati o modificati successivamente.</p>
      <div className="col-12"><SubmitButton pendingLabel="Salvataggio…">Salva attrezzatura</SubmitButton></div>
    </fieldset>
  </form>;
}
export function AssetFormTrigger({ asset }: { asset?: ManagementAsset }) {
  const [open, setOpen] = useState(false);
  return <><button className={asset ? "btn btn-sm btn-outline-secondary" : "btn btn-dark"} type="button" onClick={() => setOpen(true)}>{asset ? "Modifica" : "Nuova attrezzatura"}</button>
    {open && <Modal title={asset ? "Modifica attrezzatura" : "Nuova attrezzatura"} size="lg" onClose={() => setOpen(false)}>
      <AssetForm asset={asset} onSaved={() => setOpen(false)} />
    </Modal>}</>;
}

function OperationForm({ asset, projects, move, usage, onSaved }: {
  asset: ManagementAsset; projects: AssetProject[]; move: boolean; usage?: AssetUsage; onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(managementAssetOperationAction, initialState);
  const [quantity, setQuantity] = useState(usage?.usage_quantity === null || !usage ? "" : String(usage.usage_quantity));
  const [manualAmount, setManualAmount] = useState(usage ? String(usage.amount) : "");
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  const method = asset.allocation_method;
  const unit = method === "hourly" ? "ore" : method === "daily" ? "giorni" : "mesi";
  const rate = method === "manual" ? 1 : asset[`${method}_rate`];
  const preview = method === "manual" ? Number(manualAmount) : Number(quantity) * Number(rate);
  return <form action={action}>
    <input type="hidden" name="asset_id" value={asset.id} /><input type="hidden" name="operation" value={move ? "move" : "usage"} />
    {usage && <input type="hidden" name="id" value={usage.id} />}
    {state.error && <p role="alert" className="alert alert-danger">{state.error}</p>}
    <fieldset disabled={pending} className="row g-3">
      <Field label={move ? "Nuova posizione fisica" : "Commessa di utilizzo"} wide>
        <ProjectSelect projects={projects} name={move ? "to_project_id" : "project_id"} warehouse={move}
          defaultValue={move ? undefined : usage?.project_id} current={usage?.project} />
      </Field>
      {move ? <>
        <Field label="Data movimento"><input name="movement_date" type="date" required className="form-control" /></Field>
        <p className="small text-muted mb-0">Lo spostamento aggiorna soltanto la posizione fisica e lo storico. Non attribuisce costi alla commessa.</p>
      </> : <>
        <Field label="Data inizio"><input name="start_date" type="date" required className="form-control" defaultValue={usage?.start_date} /></Field>
        <Field label="Data fine"><input name="end_date" type="date" className="form-control" defaultValue={usage?.end_date ?? ""} /></Field>
        {method === "manual" ? <Field label={`Importo (${asset.currency})`}><input name="manual_amount" type="number" min="0" max="999999999999.99" step="0.01" required className="form-control" value={manualAmount} onChange={event => setManualAmount(event.target.value)} /></Field>
          : <Field label={`Quantità (${unit})`}><input name="usage_quantity" type="number" min="0" max="999999999999.99" step="0.01" required className="form-control" value={quantity} onChange={event => setQuantity(event.target.value)} /></Field>}
        <Field label="Stato utilizzo"><select name="status" className="form-select" defaultValue={usage?.status ?? "active"}><option value="active">Attivo</option><option value="closed">Chiuso</option></select></Field>
        <p className="small text-muted mb-0">{method !== "manual" && <>Tariffa attuale: {formatNumber(rate, 6)} {asset.currency}/{unit}. </>}
          Totale previsto: {(method === "manual" ? manualAmount : quantity) ? formatMoney(preview, asset.currency) : "—"}. Il salvataggio applica la tariffa e la valuta attuali dell’attrezzatura.</p>
      </>}
      <Field label="Note" wide><textarea name="notes" className="form-control" maxLength={2000} defaultValue={usage?.notes ?? ""} /></Field>
      <div className="col-12"><SubmitButton pendingLabel="Salvataggio…">{move ? "Sposta" : usage ? "Salva utilizzo" : "Registra utilizzo"}</SubmitButton></div>
    </fieldset>
  </form>;
}
export function AssetOperationTrigger({ asset, projects, move = false, usage }: {
  asset: ManagementAsset; projects: AssetProject[]; move?: boolean; usage?: AssetUsage;
}) {
  const [open, setOpen] = useState(false);
  const title = move ? "Sposta" : usage ? "Modifica utilizzo" : "Registra utilizzo";
  return <><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setOpen(true)}>{title}</button>
    {open && <Modal title={`${title} · ${asset.asset_code}`} size="lg" onClose={() => setOpen(false)}>
      <OperationForm asset={asset} projects={projects} move={move} usage={usage} onSaved={() => setOpen(false)} />
    </Modal>}</>;
}
export function CancelAssetUsage({ usage }: { usage: AssetUsage }) {
  const [state, action] = useActionState(managementAssetOperationAction, initialState);
  return <form action={action}>
    <input type="hidden" name="operation" value="cancel" /><input type="hidden" name="id" value={usage.id} />
    <ConfirmSubmitButton confirmMessage="Annullare questo utilizzo ed escluderne il costo dal riepilogo della commessa?">Annulla utilizzo</ConfirmSubmitButton>
    {state.error && <p role="alert" className="text-danger">{state.error}</p>}
  </form>;
}
