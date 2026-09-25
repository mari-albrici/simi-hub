import Link from "@/components/ui/app-link";
import { requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { uuidSchema } from "@/lib/validations";
import { formatDate, formatMoney, formatNumber } from "@/lib/formatters";
import { MANAGEMENT_CONTAINER_OWNERSHIP, MANAGEMENT_ASSET_STATUSES, MANAGEMENT_ASSET_CATEGORIES, MANAGEMENT_ASSET_METHODS } from "@/lib/constants";
import { getManagementContainers, getManagementContainerById, getManagementContainerMovements, getManagementContainerAssets, getAvailableContainerAssets } from "@/lib/management-containers";
import { getManagementAssetProjects } from "@/lib/management-assets";
import { ContainerFormTrigger, ContainerOperationTrigger } from "./container-forms";
import { ContainerConsumables } from "@/components/commercial/container-consumables";

const location = (code: string | null | undefined, id: string | null) => code ?? (id ? "Commessa non disponibile" : "Magazzino / non assegnato");
export default async function ManagementContainersPage({ searchParams }: { searchParams: Promise<{ container?: string }> }) {
  const user = await requirePagePermission("management.read");
  const canUpdate = hasPermission(user.role, "management.update");
  const params = await searchParams;
  const parsed = params.container ? uuidSchema.safeParse(params.container) : null;
  if (parsed && !parsed.success) return <p className="alert alert-danger">Container non valido. <Link href="/container">Reimposta</Link></p>;
  const [containers, selected] = await Promise.all([getManagementContainers(), parsed?.data ? getManagementContainerById(parsed.data) : Promise.resolve(null)]);
  const [contents, movements, projects, available] = await Promise.all([
    selected ? getManagementContainerAssets(selected.id) : Promise.resolve([]),
    selected ? getManagementContainerMovements(selected.id) : Promise.resolve([]),
    selected && canUpdate ? getManagementAssetProjects() : Promise.resolve([]),
    selected && canUpdate && selected.status !== "retired" ? getAvailableContainerAssets() : Promise.resolve([]),
  ]);
  const current = contents.filter(row => row.date_out === null);
  const history = contents.filter(row => row.date_out !== null);
  return <>
    <div className="d-flex justify-content-between align-items-center gap-2 mb-3"><h1 className="h3 mb-0">Container</h1>{canUpdate && <ContainerFormTrigger />}</div>
    <p className="small text-muted">Controllo di gestione · Registro logistico. Posizione e contenuto non attribuiscono costi alle commesse.</p>
    <div className="app-card p-3 mb-3 table-responsive"><table className="table table-sm align-middle mb-0">
      <thead><tr><th>Codice</th><th>Nome</th><th>Proprietà</th><th>Posizione</th><th>N. attrezzature</th><th>Stato</th>{canUpdate && <th>Azioni</th>}</tr></thead>
      <tbody>{containers.map(container => <tr key={container.id}>
        <td><Link href={`/container?container=${container.id}`}>{container.container_code}</Link></td><td>{container.name}</td>
        <td>{MANAGEMENT_CONTAINER_OWNERSHIP[container.ownership_type]}</td><td>{location(container.current_project_code, container.current_project_id)}</td>
        <td>{container.asset_count}</td><td>{MANAGEMENT_ASSET_STATUSES[container.status]}</td>{canUpdate && <td><ContainerFormTrigger container={container} /></td>}
      </tr>)}</tbody>
    </table>{!containers.length && <p className="text-muted mb-0">Nessun container registrato.</p>}</div>
    {parsed?.data && !selected && <p className="alert alert-warning">Container non trovato.</p>}
    {selected && <section className="app-card p-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><h2 className="h5 mb-0">{selected.container_code} — {selected.name}</h2>
        {canUpdate && <ContainerOperationTrigger container={selected} projects={projects} move />}
      </div>
      <div className="row g-3 mb-3">
        {[["Stato", MANAGEMENT_ASSET_STATUSES[selected.status]], ["Posizione fisica attuale", location(selected.current_project_code, selected.current_project_id)],
          ["Proprietà", MANAGEMENT_CONTAINER_OWNERSHIP[selected.ownership_type]], ["Attrezzature contenute", String(selected.asset_count)]].map(([label, value]) =>
          <div className="col-md-3" key={label}><div className="small text-muted">{label}</div><strong>{value}</strong></div>)}
      </div>
      {selected.description && <p>{selected.description}</p>}
      <p className="small text-muted">Data acquisto: {formatDate(selected.purchase_date)} · Costo acquisto: {formatMoney(selected.purchase_cost, selected.currency)}</p>
      {selected.notes && <p className="small">{selected.notes}</p>}
      <div className="d-flex justify-content-between flex-wrap gap-2 mt-4 mb-2"><h3 className="h6">Contenuto</h3>
        {canUpdate && selected.status !== "retired" && <ContainerOperationTrigger container={selected} assets={available} />}
      </div>
      <div className="table-responsive"><table className="table table-sm align-middle">
        <thead><tr><th>Codice asset</th><th>Nome</th><th>Categoria</th><th>Stato</th><th>Metodo costo</th><th>Tariffa</th><th>Data ingresso</th><th>Note</th>{canUpdate && <th>Azioni</th>}</tr></thead>
        <tbody>{current.map(row => <tr key={row.id}>
          <td><Link href={`/attrezzature?asset=${row.asset_id}`}>{row.asset?.asset_code ?? "Attrezzatura"}</Link></td><td>{row.asset?.name}</td>
          <td>{row.asset && MANAGEMENT_ASSET_CATEGORIES[row.asset.category]}</td><td>{row.asset && MANAGEMENT_ASSET_STATUSES[row.asset.status]}</td>
          <td>{row.asset && MANAGEMENT_ASSET_METHODS[row.asset.allocation_method]}</td>
          <td>{row.asset && (row.asset.allocation_method === "manual" ? "Importo manuale" : `${formatNumber(row.asset[`${row.asset.allocation_method}_rate`], 6)} ${row.asset.currency}/${({ hourly: "ora", daily: "giorno", monthly: "mese" })[row.asset.allocation_method]}`)}</td>
          <td>{formatDate(row.date_in)}</td><td>{row.notes}</td>{canUpdate && <td><ContainerOperationTrigger container={selected} membership={row} /></td>}
        </tr>)}</tbody>
      </table></div>
      {!current.length && <p className="text-muted">Nessuna attrezzatura attualmente contenuta.</p>}
      {history.length > 0 && <><h4 className="h6 mt-3">Storico contenuto</h4><div className="table-responsive"><table className="table table-sm">
        <thead><tr><th>Attrezzatura</th><th>Data ingresso</th><th>Data uscita</th><th>Note</th></tr></thead>
        <tbody>{history.map(row => <tr key={row.id}><td><Link href={`/attrezzature?asset=${row.asset_id}`}>{row.asset?.asset_code ?? "Attrezzatura"}</Link> · {row.asset?.name}</td>
          <td>{formatDate(row.date_in)}</td><td>{formatDate(row.date_out)}</td><td>{row.notes}</td></tr>)}</tbody>
      </table></div></>}
      <ContainerConsumables containerId={selected.id} containers={containers} projects={projects} canUpdate={canUpdate} />
      <h3 className="h6 mt-4">Movimenti container</h3>
      <p className="small text-muted">Il costo di trasporto è informativo e non entra nei totali gestionali.</p>
      <div className="table-responsive"><table className="table table-sm"><thead><tr><th>Data</th><th>Da</th><th>A</th><th>Costo trasporto</th><th>Valuta</th><th>Note</th></tr></thead>
        <tbody>{movements.map(movement => <tr key={movement.id}><td>{formatDate(movement.movement_date)}</td>
          <td>{location(movement.from_project?.project_code, movement.from_project_id)}</td><td>{location(movement.to_project?.project_code, movement.to_project_id)}</td>
          <td>{formatMoney(movement.transport_cost, movement.currency)}</td><td>{movement.currency}</td><td>{movement.notes}</td></tr>)}</tbody>
      </table></div>
      {!movements.length && <p className="text-muted mb-0">Nessuno spostamento registrato.</p>}
    </section>}
  </>;
}
