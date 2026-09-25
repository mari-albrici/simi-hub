import Link from "@/components/ui/app-link";
import { requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { uuidSchema } from "@/lib/validations";
import { formatDate, formatMoney, formatNumber } from "@/lib/formatters";
import { MANAGEMENT_ASSET_CATEGORIES, MANAGEMENT_ASSET_METHODS, MANAGEMENT_ASSET_STATUSES, MANAGEMENT_ASSET_UNITS } from "@/lib/constants";
import { getManagementAssets, getManagementAssetById, getManagementAssetMovements, getManagementAssetUsages,
  getManagementAssetProjects, getManagementAssetUsageTotals, type ManagementAsset, type AssetProject } from "@/lib/management-assets";
import { AssetFormTrigger, AssetOperationTrigger, CancelAssetUsage } from "./asset-forms";
import { getAssetCurrentContainer } from "@/lib/management-containers";

const location = (project: AssetProject | null, id: string | null) => project?.project_code ?? (id ? "Commessa non disponibile" : "Magazzino / non assegnato");
const rate = (asset: ManagementAsset) => asset.allocation_method === "manual" ? "Importo manuale"
  : `${formatNumber(asset[`${asset.allocation_method}_rate`], 6)} ${asset.currency}/${({ hourly: "ora", daily: "giorno", monthly: "mese" })[asset.allocation_method]}`;

export default async function ManagementAssetsPage({ searchParams }: { searchParams: Promise<{ asset?: string }> }) {
  const user = await requirePagePermission("management.read");
  const canUpdate = hasPermission(user.role, "management.update");
  const params = await searchParams;
  const parsed = params.asset ? uuidSchema.safeParse(params.asset) : null;
  if (parsed && !parsed.success) return <p className="alert alert-danger">Attrezzatura non valida. <Link href="/attrezzature">Reimposta</Link></p>;
  const [assets, selected] = await Promise.all([getManagementAssets(), parsed?.data ? getManagementAssetById(parsed.data) : Promise.resolve(null)]);
  const [movements, usages, totals, projects, container] = await Promise.all([
    selected ? getManagementAssetMovements(selected.id) : Promise.resolve([]),
    selected ? getManagementAssetUsages(selected.id) : Promise.resolve([]),
    selected ? getManagementAssetUsageTotals(selected.id) : Promise.resolve([]),
    selected && canUpdate ? getManagementAssetProjects() : Promise.resolve([]),
    selected ? getAssetCurrentContainer(selected.id) : Promise.resolve(null),
  ]);
  return <>
    <div className="d-flex justify-content-between align-items-center gap-2 mb-3"><h1 className="h3 mb-0">Attrezzature</h1>{canUpdate && <AssetFormTrigger />}</div>
    <p className="small text-muted">Controllo di gestione · La posizione fisica è distinta dall’utilizzo economico. Solo gli utilizzi espliciti attribuiscono costi alle commesse.</p>
    <div className="app-card p-3 mb-3 table-responsive"><table className="table table-sm align-middle mb-0">
      <thead><tr><th>Codice</th><th>Nome</th><th>Categoria</th><th>Metodo costo</th><th>Tariffa</th><th>Posizione fisica</th><th>Stato</th>{canUpdate && <th>Azioni</th>}</tr></thead>
      <tbody>{assets.map(asset => <tr key={asset.id}>
        <td><Link href={`/attrezzature?asset=${asset.id}`}>{asset.asset_code}</Link></td><td>{asset.name}</td>
        <td>{MANAGEMENT_ASSET_CATEGORIES[asset.category]}</td><td>{MANAGEMENT_ASSET_METHODS[asset.allocation_method]}</td><td className="text-nowrap">{rate(asset)}</td>
        <td>{location(asset.physical_project, asset.current_project_id)}</td><td>{MANAGEMENT_ASSET_STATUSES[asset.status]}</td>
        {canUpdate && <td><AssetFormTrigger asset={asset} /></td>}
      </tr>)}</tbody>
    </table>{!assets.length && <p className="text-muted mb-0">Nessuna attrezzatura registrata.</p>}</div>
    {parsed?.data && !selected && <p className="alert alert-warning">Attrezzatura non trovata.</p>}
    {selected && <section className="app-card p-3">
      <div className="d-flex justify-content-between flex-wrap gap-2 mb-3"><h2 className="h5">{selected.asset_code} — {selected.name}</h2>
        {canUpdate && <div className="d-flex gap-2"><AssetOperationTrigger asset={selected} projects={projects} move /><AssetOperationTrigger asset={selected} projects={projects} /></div>}
      </div>
      <div className="row g-3 mb-3">
        {[["Posizione fisica attuale", location(selected.physical_project, selected.current_project_id)], ["Stato", MANAGEMENT_ASSET_STATUSES[selected.status]],
          ["Metodo costo", MANAGEMENT_ASSET_METHODS[selected.allocation_method]], ["Tariffa", rate(selected)]].map(([label, value]) =>
          <div className="col-md-3" key={label}><div className="small text-muted">{label}</div><strong>{value}</strong></div>)}
        <div className="col-12"><div className="small text-muted">Totale utilizzi gestionali (attivi e chiusi)</div>
          {totals.length ? totals.map(total => <strong className="d-block" key={total.currency}>{formatMoney(total.total_usage, total.currency)}</strong>) : <strong>0</strong>}
        </div>
      </div>
      {selected.description && <p>{selected.description}</p>}
      {container && <p>Container attuale: <Link href={`/container?container=${container.id}`}>{container.container_code} · {container.name}</Link>
        <span className="d-block small text-muted">Al prossimo spostamento del container, la posizione fisica dell’attrezzatura sarà allineata alla destinazione. Lo storico degli spostamenti collettivi è nel container.</span></p>}
      <p className="small text-muted">Acquisto: {formatDate(selected.purchase_date)} · Costo acquisto: {formatMoney(selected.purchase_cost, selected.currency)} · Valore gestionale: {formatMoney(selected.management_value, selected.currency)}</p>
      {selected.notes && <p className="small">{selected.notes}</p>}
      <h3 className="h6 mt-4">Utilizzi</h3>
      <div className="table-responsive"><table className="table table-sm align-middle">
        <thead><tr><th>Commessa</th><th>Periodo</th><th>Quantità</th><th>Tariffa applicata</th><th>Importo</th><th>Stato</th><th>Note</th>{canUpdate && <th>Azioni</th>}</tr></thead>
        <tbody>{usages.map(usage => <tr key={usage.id}>
          <td><Link href={`/commesse/${usage.project_id}?tab=management`}>{usage.project?.project_code ?? "Commessa"}</Link></td>
          <td>{formatDate(usage.start_date)} – {formatDate(usage.end_date)}</td><td>{usage.usage_unit === "manual" ? "Manuale" : `${formatNumber(usage.usage_quantity)} ${MANAGEMENT_ASSET_UNITS[usage.usage_unit]}`}</td>
          <td>{usage.usage_unit === "manual" ? "—" : `${formatNumber(usage.rate, 6)} ${usage.currency}/${MANAGEMENT_ASSET_UNITS[usage.usage_unit]}`}</td><td>{formatMoney(usage.amount, usage.currency)}</td>
          <td>{({ active: "Attivo", closed: "Chiuso", cancelled: "Annullato" })[usage.status]}</td><td>{usage.notes}</td>
          {canUpdate && <td>{usage.status !== "cancelled" && <div className="d-flex flex-wrap gap-1"><AssetOperationTrigger asset={selected} projects={projects} usage={usage} /><CancelAssetUsage usage={usage} /></div>}</td>}
        </tr>)}</tbody>
      </table></div>
      {!usages.length && <p className="text-muted">Nessun utilizzo economico registrato.</p>}
      <h3 className="h6 mt-4">Movimenti</h3>
      <div className="table-responsive"><table className="table table-sm"><thead><tr><th>Data</th><th>Da</th><th>A</th><th>Note</th></tr></thead>
        <tbody>{movements.map(movement => <tr key={movement.id}><td>{formatDate(movement.movement_date)}</td>
          <td>{location(movement.from_project, movement.from_project_id)}</td><td>{location(movement.to_project, movement.to_project_id)}</td><td>{movement.notes}</td></tr>)}</tbody>
      </table></div>
      {!movements.length && <p className="text-muted mb-0">Nessun movimento fisico registrato.</p>}
    </section>}
  </>;
}
