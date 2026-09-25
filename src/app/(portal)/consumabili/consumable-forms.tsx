"use client";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { saveConsumableItemAction, consumableMovementAction } from "@/lib/management-consumable-actions";
import type { ConsumableItem, ConsumableStock } from "@/lib/management-consumables";
import type { AssetProject } from "@/lib/management-assets";
import { CONSUMABLE_UNITS } from "@/lib/constants";
import { formatMoney, formatNumber } from "@/lib/formatters";

const initial = { error: null as string | null, success: false };
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="col-md-6"><label className="form-label w-100">{label}{children}</label></div>;
}
function ItemForm({ item, onSaved }: { item?: ConsumableItem; onSaved: () => void }) {
  const [state, action, pending] = useActionState(saveConsumableItemAction, initial);
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  return <form action={action}>
    {item && <input type="hidden" name="id" value={item.id} />}
    {state.error && <p role="alert" className="alert alert-danger">{state.error}</p>}
    <fieldset disabled={pending} className="row g-3">
      <Field label="Codice"><input name="item_code" required maxLength={100} className="form-control" defaultValue={item?.item_code} /></Field>
      <Field label="Nome"><input name="name" required maxLength={200} className="form-control" defaultValue={item?.name} /></Field>
      <Field label="Descrizione"><textarea name="description" maxLength={2000} className="form-control" defaultValue={item?.description ?? ""} /></Field>
      <Field label="Categoria"><input name="category" maxLength={2000} className="form-control" defaultValue={item?.category ?? ""} /></Field>
      <Field label="Unità"><select name="unit" className="form-select" defaultValue={item?.unit ?? "pcs"}>{Object.entries(CONSUMABLE_UNITS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <Field label="Costo predefinito"><input name="default_unit_cost" type="number" min="0" max="99999999.999999" step="0.000001" className="form-control" defaultValue={item?.default_unit_cost ?? ""} /></Field>
      <Field label="Valuta"><input name="currency" required maxLength={3} pattern="[A-Za-z]{3}" className="form-control" defaultValue={item?.currency ?? "EUR"} /></Field>
      <Field label="Note"><textarea name="notes" maxLength={2000} className="form-control" defaultValue={item?.notes ?? ""} /></Field>
      <div className="col-12"><label className="form-check"><input name="is_active" type="checkbox" className="form-check-input" defaultChecked={item?.is_active ?? true} /> Articolo attivo</label></div>
      <p className="small text-muted mb-0">Dopo il primo movimento, unità e valuta restano fisse. Le variazioni del costo predefinito valgono per i carichi successivi.</p>
      <div className="col-12"><SubmitButton>Salva articolo</SubmitButton></div>
    </fieldset>
  </form>;
}
export function ConsumableItemTrigger({ item }: { item?: ConsumableItem }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={item ? "btn btn-sm btn-outline-secondary" : "btn btn-dark"} onClick={() => setOpen(true)}>{item ? "Modifica" : "Nuovo articolo"}</button>
    {open && <Modal title={item ? "Modifica consumabile" : "Nuovo consumabile"} size="lg" onClose={() => setOpen(false)}><ItemForm item={item} onSaved={() => setOpen(false)} /></Modal>}</>;
}
export function DeactivateConsumable({ item }: { item: ConsumableItem }) {
  const [state, action] = useActionState(saveConsumableItemAction, initial);
  return <form action={action}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="operation" value="deactivate" />
    <ConfirmSubmitButton confirmMessage="Disattivare l’articolo? Le giacenze esistenti potranno ancora essere trasferite o consumate.">Disattiva</ConfirmSubmitButton>
    {state.error && <p role="alert" className="text-danger">{state.error}</p>}
  </form>;
}
type Operation = "load" | "transfer" | "consumption" | "adjustment";
const labels = { load: "Carica", transfer: "Trasferisci", consumption: "Consuma", adjustment: "Rettifica" };
type MovementProps = {
  containerId: string; operation: Operation; stock?: ConsumableStock; items?: ConsumableItem[];
  containers?: { id: string; container_code: string; name: string }[]; projects?: AssetProject[];
};
function MovementForm({ containerId, operation, stock, items = [], containers = [], projects = [], onSaved }: MovementProps & { onSaved: () => void }) {
  const [state, action, pending] = useActionState(consumableMovementAction, initial);
  const [itemId, setItemId] = useState(stock?.item_id ?? "");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [direction, setDirection] = useState("decrease");
  const selected = items.find(item => item.id === itemId);
  const currency = stock?.currency ?? selected?.currency ?? "EUR";
  useEffect(() => { if (state.success) onSaved(); }, [state.success, onSaved]);
  return <form action={action}>
    <input type="hidden" name="container_id" value={containerId} /><input type="hidden" name="movement_type" value={operation} />
    {stock && <input type="hidden" name="item_id" value={stock.item_id} />}
    {state.error && <p role="alert" className="alert alert-danger">{state.error}</p>}
    <fieldset disabled={pending} className="row g-3">
      {operation === "load" && <Field label="Articolo"><select name="item_id" className="form-select" required value={itemId} onChange={event => {
        setItemId(event.target.value); const item = items.find(value => value.id === event.target.value); setCost(item?.default_unit_cost == null ? "" : String(item.default_unit_cost));
      }}><option value="">Seleziona articolo</option>{items.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{item.item_code} · {item.name} ({CONSUMABLE_UNITS[item.unit]})</option>)}</select></Field>}
      {stock && <p className="mb-0">{stock.item_code} · {stock.name}<br />Disponibile: {formatNumber(stock.quantity, 3)} {CONSUMABLE_UNITS[stock.unit]} · Costo unitario: {formatNumber(stock.unit_cost, 6)} {currency}</p>}
      {operation === "transfer" && <Field label="Container destinazione"><select name="to_container_id" required className="form-select" defaultValue=""><option value="">Seleziona container</option>{containers.filter(container => container.id !== containerId).map(container => <option key={container.id} value={container.id}>{container.container_code} · {container.name}</option>)}</select></Field>}
      {operation === "consumption" && <Field label="Commessa"><select name="project_id" required className="form-select" defaultValue=""><option value="">Seleziona commessa</option>{projects.map(project => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}</select></Field>}
      {operation === "adjustment" && <Field label="Rettifica"><select name="direction" className="form-select" value={direction} onChange={event => setDirection(event.target.value)}><option value="decrease">Riduzione</option><option value="increase">Aumento</option></select></Field>}
      <Field label={`Quantità${stock ? ` (${CONSUMABLE_UNITS[stock.unit]})` : selected ? ` (${CONSUMABLE_UNITS[selected.unit]})` : ""}`}><input name="quantity" type="number" min="0.001" max={stock && (operation !== "adjustment" || direction === "decrease") ? stock.quantity : "99999999999.999"} step="0.001" required className="form-control" value={quantity} onChange={event => setQuantity(event.target.value)} /></Field>
      {operation === "load" && <Field label={`Costo unitario (${currency})`}><input name="unit_cost" type="number" min="0" max="99999999.999999" step="0.000001" required className="form-control" value={cost} onChange={event => setCost(event.target.value)} /></Field>}
      <Field label="Data"><input name="movement_date" type="date" required className="form-control" /></Field>
      <Field label={operation === "adjustment" ? "Motivazione obbligatoria" : "Note"}><textarea name="notes" required={operation === "adjustment"} maxLength={2000} className="form-control" /></Field>
      {operation === "consumption" && <p className="small text-muted mb-0">Costo commessa previsto: {quantity ? formatMoney(Number(quantity) * Number(stock?.unit_cost), currency) : "—"}. Il costo definitivo viene ricalcolato al salvataggio.</p>}
      {operation === "adjustment" && <p className="small text-muted mb-0">La rettifica usa il costo unitario della giacenza e non attribuisce costi alla commessa.</p>}
      <div className="col-12"><ConfirmSubmitButton className="btn btn-primary" confirmMessage={`Confermare ${labels[operation].toLowerCase()}? Il movimento sarà conservato nello storico.`}>{labels[operation]}</ConfirmSubmitButton></div>
    </fieldset>
  </form>;
}
export function ConsumableMovementTrigger(props: MovementProps) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setOpen(true)}>{labels[props.operation]}</button>
    {open && <Modal title={`${labels[props.operation]} consumabili`} size="lg" onClose={() => setOpen(false)}><MovementForm {...props} onSaved={() => setOpen(false)} /></Modal>}</>;
}
