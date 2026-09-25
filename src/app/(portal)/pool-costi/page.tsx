import Link from "@/components/ui/app-link";
import { requirePagePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { getManagementCostPools, getManagementCostPoolById, getCostPoolDistribution, getCostPoolProjectOptions } from "@/lib/management-cost-pools";
import { getManagementCostCenters, getCostEntries } from "@/lib/cost-entries";
import { formatDate, formatMoney, formatNumber } from "@/lib/formatters";
import { uuidSchema } from "@/lib/validations";
import { PoolFormTrigger } from "./pool-form";
import { PoolDrivers } from "./pool-drivers";

export default async function CostPoolsPage({ searchParams }: { searchParams: Promise<{ pool?: string; page?: string }> }) {
  const user = await requirePagePermission("management.read");
  const canUpdate = hasPermission(user.role, "management.update");
  const params = await searchParams;
  const parsedId = params.pool ? uuidSchema.safeParse(params.pool) : null;
  if (parsedId && !parsedId.success) return <div className="alert alert-danger">Pool non valido. <Link href="/pool-costi">Reimposta</Link></div>;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage < 100000 ? requestedPage : 1;
  const [pools, centers, selected] = await Promise.all([
    getManagementCostPools(), canUpdate ? getManagementCostCenters() : Promise.resolve([]),
    parsedId?.data ? getManagementCostPoolById(parsedId.data) : Promise.resolve(null),
  ]);
  const entries = selected ? await getCostEntries({ cost_pool_id: selected.id, offset: (page - 1) * 50 }) : null;
  const [distribution, projects] = await Promise.all([
    selected ? getCostPoolDistribution(selected.id) : Promise.resolve(null),
    selected && canUpdate && selected.status !== "closed" ? getCostPoolProjectOptions() : Promise.resolve([]),
  ]);
  const rate = (value: number | null, currency: string, driver: string) => value === null ? "—" : `${formatNumber(value, 6)} ${currency}/${driver === "labor_hours" ? "h" : "giorno-uomo"}`;
  return <>
    <div className="d-flex justify-content-between align-items-center gap-2 mb-3"><h1 className="h3 mb-0">Pool costi</h1>{canUpdate && <PoolFormTrigger centers={centers} />}</div>
    <p className="small text-muted">Controllo di gestione · Costi raggruppati e distribuiti alle commesse tramite quantità driver. <Link href="/costi-gestionali">Apri Costi gestionali</Link></p>
    <div className="app-card p-3 mb-3">
      {pools.length ? <div className="table-responsive"><table className="table table-sm align-middle mb-0">
        <thead><tr><th>Nome</th><th>Periodo</th><th>Centro di costo</th><th>Driver</th><th>Costi effettivi</th><th>Quantità prevista</th><th>Tariffa standard</th><th>Stato</th>{canUpdate && <th>Azioni</th>}</tr></thead>
        <tbody>{pools.map(pool => <tr key={pool.id}>
          <td><Link href={`/pool-costi?pool=${pool.id}`}>{pool.name}</Link></td>
          <td>{formatDate(pool.period_start)} – {formatDate(pool.period_end)}</td><td>{pool.cost_center_name}</td>
          <td>{pool.driver_type === "labor_hours" ? "Ore lavorate" : "Giornate-uomo"}</td>
          <td className="text-nowrap">{formatMoney(pool.actual_cost, pool.currency)}</td><td>{formatNumber(pool.planned_driver_quantity)} {pool.driver_type === "labor_hours" ? "h" : "gg-uomo"}</td>
          <td className="text-nowrap">{rate(pool.standard_rate, pool.currency, pool.driver_type)}</td>
          <td><span className={`badge text-bg-${pool.status === "active" ? "success" : "secondary"}`}>{({ draft: "Bozza", active: "Attivo", closed: "Chiuso" })[pool.status]}</span></td>
          {canUpdate && <td>{pool.status !== "closed" && <PoolFormTrigger pool={pool} centers={centers} />}</td>}
        </tr>)}</tbody>
      </table></div> : <p className="text-muted mb-0">Nessun pool. Crea Piccola attrezzatura scegliendo il periodo di riferimento.</p>}
    </div>
    {parsedId?.data && !selected && <p className="alert alert-warning">Pool non trovato.</p>}
    {selected && entries && <section className="app-card p-3">
      <h2 className="h5">{selected.name} · {formatDate(selected.period_start)} – {formatDate(selected.period_end)}</h2>
      <div className="row g-3 mb-3">
        {[["Costi effettivi", formatMoney(selected.actual_cost, selected.currency)], ["Quantità driver prevista", formatNumber(selected.planned_driver_quantity)],
          ["Tariffa standard", rate(selected.standard_rate, selected.currency, selected.driver_type)], ["Numero costi collegati", String(selected.linked_cost_entries_count)]].map(([label, value]) =>
          <div className="col-md-3" key={label}><div className="small text-muted">{label}</div><div className="fw-semibold">{value}</div></div>)}
      </div>
      <div className="table-responsive"><table className="table table-sm">
        <thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th>Fornitore</th><th>Importo</th><th>Origine</th></tr></thead>
        <tbody>{entries.rows.map(entry => <tr key={entry.id}><td>{formatDate(entry.cost_date)}</td><td>{entry.description} {entry.status === "excluded" && <span className="badge text-bg-secondary">Escluso</span>}</td>
          <td>{entry.cost_category_name ?? "—"}</td><td>{entry.supplier_name ?? "—"}</td><td>{formatMoney(entry.amount, entry.currency)}</td>
          <td>{entry.source_type === "invoice" ? <Link href={`/fatture/${entry.source_id}`}>Fattura</Link> : "Manuale"}</td></tr>)}</tbody>
      </table></div>
      {!entries.count && <p className="text-muted">Nessun costo collegato. Assegna i costi dalla pagina Costi gestionali.</p>}
      <nav className="d-flex gap-2" aria-label="Paginazione costi del pool">
        {page > 1 && <Link className="btn btn-sm btn-outline-secondary" href={`/pool-costi?pool=${selected.id}&page=${page - 1}`}>Precedente</Link>}
        {page * 50 < entries.count && <Link className="btn btn-sm btn-outline-secondary" href={`/pool-costi?pool=${selected.id}&page=${page + 1}`}>Successiva</Link>}
      </nav>
      {distribution && <PoolDrivers pool={selected} entries={distribution.entries} summary={distribution.summary} projects={projects} canUpdate={canUpdate} />}
    </section>}
  </>;
}
