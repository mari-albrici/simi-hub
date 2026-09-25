import Link from "@/components/ui/app-link";
import { getContainerConsumables, getConsumableMovements, getConsumableItems } from "@/lib/management-consumables";
import type { AssetProject } from "@/lib/management-assets";
import { CONSUMABLE_UNITS, CONSUMABLE_MOVEMENTS } from "@/lib/constants";
import { formatDate, formatMoney, formatNumber } from "@/lib/formatters";
import { ConsumableMovementTrigger } from "@/app/(portal)/consumabili/consumable-forms";
export async function ContainerConsumables({ containerId, containers, projects, canUpdate }: {
  containerId: string; containers: { id: string; container_code: string; name: string }[]; projects: AssetProject[]; canUpdate: boolean;
}) {
  const [stocks, movements, items] = await Promise.all([getContainerConsumables(containerId), getConsumableMovements(containerId), canUpdate ? getConsumableItems() : Promise.resolve([])]);
  const totals = new Map<string, number>();
  for (const stock of stocks) totals.set(stock.currency, (totals.get(stock.currency) ?? 0) + Number(stock.stock_value ?? 0));
  return <section className="border-top mt-4 pt-3" aria-labelledby="container-consumables">
    <div className="d-flex justify-content-between align-items-center mb-3"><h3 id="container-consumables" className="h5 mb-0">Consumabili</h3>
      {canUpdate && <ConsumableMovementTrigger containerId={containerId} operation="load" items={items} />}</div>
    <div className="mb-3"><div className="small text-muted">Valore consumabili presenti</div>{totals.size ? [...totals].map(([currency, value]) => <strong key={currency} className="d-block">{formatMoney(value, currency)}</strong>) : <strong>0</strong>}</div>
    <p className="small text-muted">Valore della giacenza, senza attribuzione automatica alla commessa. Spostare il container non consuma materiali.</p>
    <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Articolo</th><th>Quantità</th><th>Unità</th><th>Costo unitario</th><th>Valore</th>{canUpdate && <th>Azioni</th>}</tr></thead>
      <tbody>{stocks.map(stock => <tr key={stock.id}><td>{stock.item_code} · {stock.name}</td><td>{formatNumber(stock.quantity, 3)}</td><td>{CONSUMABLE_UNITS[stock.unit]}</td><td>{formatNumber(stock.unit_cost, 6)} {stock.currency}</td><td>{formatMoney(stock.stock_value, stock.currency)}</td>
        {canUpdate && <td><div className="d-flex gap-1 flex-wrap">{(["transfer", "consumption", "adjustment"] as const).map(operation => <ConsumableMovementTrigger key={operation} containerId={containerId} stock={stock} operation={operation} containers={containers} projects={projects} />)}</div></td>}</tr>)}</tbody>
    </table></div>{!stocks.length && <p className="text-muted">Nessuna giacenza registrata.</p>}
    <h4 className="h6 mt-3">Storico consumabili</h4>
    <div className="table-responsive"><table className="table table-sm"><thead><tr><th>Data</th><th>Articolo</th><th>Movimento</th><th>Quantità</th><th>Costo unitario</th><th>Valore movimento</th><th>Destinazione / origine</th><th>Note</th></tr></thead>
      <tbody>{movements.map(movement => <tr key={movement.id}><td>{formatDate(movement.movement_date)}</td><td>{movement.item?.item_code} · {movement.item?.name}</td>
        <td>{CONSUMABLE_MOVEMENTS[movement.movement_type]}{movement.movement_type === "adjustment" && (movement.to_container_id ? " +" : " −")}</td>
        <td>{formatNumber(movement.quantity, 3)} {movement.item && CONSUMABLE_UNITS[movement.item.unit]}</td><td>{formatNumber(movement.unit_cost, 6)} {movement.currency}</td><td>{formatMoney(movement.amount, movement.currency)}</td>
        <td>{movement.project_id ? <Link href={`/commesse/${movement.project_id}?tab=management`}>Commessa</Link> : movement.movement_type === "transfer" ? <Link href={`/container?container=${movement.from_container_id === containerId ? movement.to_container_id : movement.from_container_id}`}>
          {movement.from_container_id === containerId ? "Verso " : "Da "}{containers.find(c => c.id === (movement.from_container_id === containerId ? movement.to_container_id : movement.from_container_id))?.container_code ?? "container"}</Link> : "—"}</td><td>{movement.notes}</td></tr>)}</tbody>
    </table></div>{!movements.length && <p className="text-muted mb-0">Nessun movimento.</p>}
  </section>;
}
