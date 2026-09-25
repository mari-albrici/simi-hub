import { requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { getConsumableItems } from "@/lib/management-consumables";
import { CONSUMABLE_UNITS } from "@/lib/constants";
import { formatNumber } from "@/lib/formatters";
import { ConsumableItemTrigger, DeactivateConsumable } from "./consumable-forms";
export default async function ConsumablesPage() {
  const user = await requirePagePermission("management.read"); const canUpdate = hasPermission(user.role, "management.update");
  const items = await getConsumableItems();
  return <><div className="d-flex justify-content-between align-items-center mb-3"><h1 className="h3 mb-0">Consumabili</h1>{canUpdate && <ConsumableItemTrigger />}</div>
    <p className="small text-muted">Controllo di gestione · Carichi, trasferimenti, consumi e rettifiche si registrano dal dettaglio del container.</p>
    <div className="app-card p-3 table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Codice</th><th>Nome</th><th>Categoria</th><th>Unità</th><th>Costo predefinito</th><th>Stato</th>{canUpdate && <th>Azioni</th>}</tr></thead>
      <tbody>{items.map(item => <tr id={`item-${item.id}`} key={item.id}><td>{item.item_code}</td><td>{item.name}</td><td>{item.category || "—"}</td><td>{CONSUMABLE_UNITS[item.unit]}</td>
        <td>{formatNumber(item.default_unit_cost, 6)} {item.currency}</td><td>{item.is_active ? "Attivo" : "Disattivato"}</td>
        {canUpdate && <td><div className="d-flex gap-1"><ConsumableItemTrigger item={item} />{item.is_active && <DeactivateConsumable item={item} />}</div></td>}</tr>)}</tbody>
    </table>{!items.length && <p className="text-muted mb-0">Nessun articolo registrato.</p>}</div></>;
}
