"use client";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { saveManagementContainerAction, managementContainerOperationAction } from "@/lib/management-container-actions";
import type { ManagementContainer, ContainerAsset, ContainerAssetOption } from "@/lib/management-containers";
import type { AssetProject } from "@/lib/management-assets";
import { MANAGEMENT_CONTAINER_OWNERSHIP, MANAGEMENT_ASSET_STATUSES } from "@/lib/constants";

const initialState = { error: null as string | null, success: false };
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "col-12" : "col-md-6"}><label className="form-label w-100">{label}{children}</label></div>;
}
function Options({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}
function ContainerForm({ container, onSaved }: { container?: ManagementContainer; onSaved: () => void }) {
  const [state, action, pending] = useActionState(saveManagementContainerAction, initialState);
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  return <form action={action}>
    {container && <input type="hidden" name="id" value={container.id} />}
    {state.error && <p className="alert alert-danger" role="alert">{state.error}</p>}
    <fieldset disabled={pending} className="row g-3">
      <Field label="Codice"><input name="container_code" className="form-control" required maxLength={100} defaultValue={container?.container_code} /></Field>
      <Field label="Nome"><input name="name" className="form-control" required maxLength={200} defaultValue={container?.name} /></Field>
      <Field label="Descrizione" wide><textarea name="description" className="form-control" maxLength={2000} defaultValue={container?.description ?? ""} /></Field>
      <Field label="Proprietà"><select name="ownership_type" className="form-select" defaultValue={container?.ownership_type ?? "owned"}><Options values={MANAGEMENT_CONTAINER_OWNERSHIP} /></select></Field>
      <Field label="Data acquisto"><input name="purchase_date" type="date" className="form-control" defaultValue={container?.purchase_date ?? ""} /></Field>
      <Field label="Costo acquisto"><input name="purchase_cost" type="number" min="0" max="999999999999.99" step="0.01" className="form-control" defaultValue={container?.purchase_cost ?? ""} /></Field>
      <Field label="Valuta"><input name="currency" className="form-control" required pattern="[A-Za-z]{3}" maxLength={3} defaultValue={container?.currency ?? "EUR"} /></Field>
      <Field label="Stato"><select name="status" className="form-select" defaultValue={container?.status ?? "available"}><Options values={MANAGEMENT_ASSET_STATUSES} /></select></Field>
      <Field label="Note" wide><textarea name="notes" className="form-control" maxLength={2000} defaultValue={container?.notes ?? ""} /></Field>
      <p className="small text-muted mb-0">La posizione fisica si imposta con Sposta container.</p>
      <div className="col-12"><SubmitButton pendingLabel="Salvataggio…">Salva container</SubmitButton></div>
    </fieldset>
  </form>;
}
export function ContainerFormTrigger({ container }: { container?: ManagementContainer }) {
  const [open, setOpen] = useState(false);
  return <><button className={container ? "btn btn-sm btn-outline-secondary" : "btn btn-dark"} type="button" onClick={() => setOpen(true)}>{container ? "Modifica" : "Nuovo container"}</button>
    {open && <Modal title={container ? "Modifica container" : "Nuovo container"} size="lg" onClose={() => setOpen(false)}>
      <ContainerForm container={container} onSaved={() => setOpen(false)} />
    </Modal>}</>;
}

function OperationForm({ container, projects, assets, membership, move, onSaved }: {
  container: ManagementContainer; projects: AssetProject[]; assets: ContainerAssetOption[];
  membership?: ContainerAsset; move: boolean; onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(managementContainerOperationAction, initialState);
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  return <form action={action}>
    <input type="hidden" name="container_id" value={container.id} /><input type="hidden" name="operation" value={membership ? "remove" : move ? "move" : "add"} />
    {membership && <input type="hidden" name="id" value={membership.id} />}
    {state.error && <p className="alert alert-danger" role="alert">{state.error}</p>}
    <fieldset disabled={pending} className="row g-3">
      {membership ? <>
        <p className="mb-0">{membership.asset?.asset_code} · {membership.asset?.name}</p>
        <Field label="Data uscita"><input name="date_out" type="date" required min={membership.date_in} className="form-control" /></Field>
        <p className="small text-muted mb-0">La relazione rimarrà nello storico. L’attrezzatura conserverà la sua ultima posizione fisica.</p>
      </> : move ? <>
        <Field label="Nuova posizione fisica" wide><select name="to_project_id" className="form-select" defaultValue=""><option value="">Magazzino / non assegnato</option>
          {projects.map(project => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}
        </select></Field>
        <Field label="Data movimento"><input name="movement_date" type="date" required className="form-control" /></Field>
        <Field label="Costo trasporto"><input name="transport_cost" type="number" min="0" max="999999999999.99" step="0.01" className="form-control" /></Field>
        <Field label="Valuta"><input name="currency" required pattern="[A-Za-z]{3}" maxLength={3} className="form-control" defaultValue={container.currency} /></Field>
        <p className="small text-muted mb-0">Si aggiornerà anche la posizione delle attrezzature attualmente contenute. Il trasporto resta un dato logistico, senza imputazione economica.</p>
      </> : <>
        <Field label="Attrezzatura" wide><select name="asset_id" className="form-select" required defaultValue=""><option value="">Seleziona attrezzatura</option>
          {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.asset_code} · {asset.name}</option>)}
        </select></Field>
        {!assets.length && <p className="text-muted">Nessuna attrezzatura disponibile fuori dai container.</p>}
        <Field label="Data ingresso"><input name="date_in" type="date" required className="form-control" /></Field>
        <p className="small text-muted mb-0">La posizione fisica dell’attrezzatura verrà allineata a quella del container.</p>
      </>}
      {!membership && <Field label="Note" wide><textarea name="notes" className="form-control" maxLength={2000} /></Field>}
      <div className="col-12">{membership || move ? <ConfirmSubmitButton className={membership ? "btn btn-outline-danger" : "btn btn-primary"}
        confirmMessage={membership ? "Rimuovere l’attrezzatura dal container conservando lo storico e l’ultima posizione fisica?" : `Spostare ${container.container_code} e sincronizzare la posizione delle attrezzature contenute? L’operazione non genera costi gestionali.`}>
        {membership ? "Rimuovi dal container" : "Sposta container"}
      </ConfirmSubmitButton> : <SubmitButton pendingLabel="Salvataggio…">Aggiungi attrezzatura</SubmitButton>}</div>
    </fieldset>
  </form>;
}
export function ContainerOperationTrigger({ container, projects = [], assets = [], membership, move = false }: {
  container: ManagementContainer; projects?: AssetProject[]; assets?: ContainerAssetOption[]; membership?: ContainerAsset; move?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = membership ? "Rimuovi dal container" : move ? "Sposta container" : "Aggiungi attrezzatura";
  return <><button type="button" className={`btn btn-sm btn-outline-${membership ? "danger" : "primary"}`} onClick={() => setOpen(true)}>{label}</button>
    {open && <Modal title={`${label} · ${container.container_code}`} size="lg" onClose={() => setOpen(false)}>
      <OperationForm container={container} projects={projects} assets={assets} membership={membership} move={move} onSaved={() => setOpen(false)} />
    </Modal>}</>;
}
