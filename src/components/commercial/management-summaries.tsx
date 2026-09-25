import Link from "@/components/ui/app-link";
import { formatDate, formatMoney } from "@/lib/formatters";
import { getProjectManagementCostSummary, getProjectManagementAllocations, getManagementReconciliationSummary } from "@/lib/management-summaries";
import { getPoolReconciliationSummary } from "@/lib/management-cost-pools";
import { getManagementAssetUsageTotals } from "@/lib/management-assets";
import { getConsumptionTotals } from "@/lib/management-consumables";
import { getLaborTotals } from "@/lib/management-labor";
import { ProjectForecastSection } from "./management-forecasts";
import { ProjectBudgetSection } from "./management-budgets";
import { ProjectLaborSection } from "./management-labor";

export async function ProjectManagementSummary({ projectId, page = 1, budgetId, forecastId }: { projectId: string; page?: number; budgetId?: string; forecastId?: string }) {
  const [summary, movements] = await Promise.all([
    getProjectManagementCostSummary(projectId), getProjectManagementAllocations(projectId, page),
  ]);
  return <section aria-labelledby="project-management-title">
    <h2 id="project-management-title" className="h5 mb-3">Controllo di gestione</h2>
    <ProjectForecastSection projectId={projectId} forecastId={forecastId} />
    <details className="mb-3" open={!!budgetId}><summary>Gestione budget e versioni</summary><ProjectBudgetSection projectId={projectId} budgetId={budgetId} /></details>
    <div className="row g-3 mb-3">
      <div className="col-md-8"><div className="app-card p-3 h-100">
        <div className="small text-muted">Costi gestionali allocati</div>
        {summary.byCurrency.length ? summary.byCurrency.map(total => <div key={total.currency} className="h4 mb-0">{formatMoney(total.totalCost, total.currency)}</div>) : <div className="h4 mb-0">0</div>}
      </div></div>
      <div className="col-md-4"><div className="app-card p-3 h-100"><div className="small text-muted">Numero movimenti</div><div className="h4 mb-0">{summary.allocationCount}</div></div></div>
    </div>
    <div className="app-card p-3 mb-3">
      <h3 className="h6">Riepilogo per categoria</h3>
      {summary.byCategory.length ? <div className="table-responsive"><table className="table table-sm mb-0">
        <thead><tr><th>Categoria</th><th>Valuta</th><th className="text-end">Costo netto</th></tr></thead>
        <tbody>{summary.byCategory.map(category => <tr key={`${category.currency}-${category.categoryId ?? "unclassified"}-${category.categoryName}`}>
          <td>{category.categoryName}</td><td>{category.currency}</td><td className="text-end">{formatMoney(category.totalCost, category.currency)}</td>
        </tr>)}</tbody>
        <tfoot>{summary.byCurrency.map(total => <tr key={total.currency}><th>Totale</th><td>{total.currency}</td><th className="text-end">{formatMoney(total.totalCost, total.currency)}</th></tr>)}</tfoot>
      </table></div> : <p className="text-muted mb-0">Nessun costo gestionale attivo allocato alla commessa.</p>}
    </div>
    <div className="app-card p-3">
      <h3 className="h6">Movimenti allocati</h3>
      {movements.rows.length ? <div className="table-responsive"><table className="table table-sm align-middle mb-0">
        <thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th>Origine</th><th>Fornitore</th><th className="text-end">Importo</th></tr></thead>
        <tbody>{movements.rows.map(movement => <tr key={movement.id}>
          <td className="text-nowrap">{formatDate(movement.cost_date)}</td><td>{movement.description}</td><td>{movement.category_name}</td>
          <td>{movement.source_type === "labor" ? "Manodopera" : movement.source_type === "consumable" ? <Link href={`/consumabili#item-${movement.source_id}`}>Consumabile</Link> : movement.source_type === "asset" ? <Link href={`/attrezzature?asset=${movement.source_id}`}>Attrezzatura</Link> : movement.source_type === "pool" ? <Link href={`/pool-costi?pool=${movement.source_id}`}>Pool</Link> : movement.source_type === "invoice" ? movement.invoice_id ? <Link href={`/fatture/${movement.invoice_id}`}>Fattura</Link> : "Fattura" : "Manuale"}</td>
          <td>{movement.supplier_name ?? "—"}</td><td className="text-end text-nowrap">{formatMoney(movement.economic_amount, movement.currency)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="text-muted mb-0">Nessun movimento da mostrare.</p>}
      {(page > 1 || page * 50 < movements.count) && <nav className="d-flex justify-content-end gap-2 mt-3" aria-label="Paginazione movimenti gestionali">
        {page > 1 && <Link className="btn btn-sm btn-outline-secondary" href={`/commesse/${projectId}?tab=management&management_page=${page - 1}${budgetId ? `&budget=${encodeURIComponent(budgetId)}` : ""}${forecastId ? `&forecast=${encodeURIComponent(forecastId)}` : ""}`}>Precedente</Link>}
        {page * 50 < movements.count && <Link className="btn btn-sm btn-outline-secondary" href={`/commesse/${projectId}?tab=management&management_page=${page + 1}${budgetId ? `&budget=${encodeURIComponent(budgetId)}` : ""}${forecastId ? `&forecast=${encodeURIComponent(forecastId)}` : ""}`}>Successiva</Link>}
      </nav>}
    </div>
    <ProjectLaborSection projectId={projectId} />
  </section>;
}

export async function ManagementReconciliationSummary() {
  const [summaries, pools, assets, consumptions, labor] = await Promise.all([getManagementReconciliationSummary(), getPoolReconciliationSummary(), getManagementAssetUsageTotals(), getConsumptionTotals(), getLaborTotals()]);
  return <section className="app-card p-3 mb-3" aria-labelledby="management-reconciliation-title">
    <h2 id="management-reconciliation-title" className="h5">Riconciliazione</h2>
    <p className="small text-muted">Copertura delle allocazioni in valore assoluto, per valuta. Riepilogo complessivo, indipendente dal filtro dell’elenco.</p>
    {summaries.length ? <div className="table-responsive"><table className="table table-sm mb-0">
      <thead><tr><th>Indicatore</th>{summaries.map(item => <th className="text-end" key={item.currency}>{item.currency}</th>)}</tr></thead>
      <tbody>
        {([
          ["total_active_costs", "Totale costi attivi"], ["allocated", "Totale allocato"],
          ["remaining_in_cost_centers", "Residuo in centri di costo"], ["remaining_unallocated", "Residuo da gestire"],
          ["excluded_costs", "Costi esclusi"], ["net_active_costs", "Valore economico netto dei costi attivi"],
        ] as const).map(([key, label]) => <tr key={key}><th scope="row" className="fw-normal">{label}</th>
          {summaries.map(item => <td className="text-end text-nowrap" key={item.currency}>{formatMoney(item[key], item.currency)}</td>)}
        </tr>)}
        <tr><th scope="row">Differenza di quadratura</th>{summaries.map(item => <td className="text-end text-nowrap" key={item.currency}>
          {formatMoney(item.balance_difference, item.currency)} <span className={`badge text-bg-${Number(item.balance_difference) === 0 ? "success" : "warning"}`}>
            {Number(item.balance_difference) === 0 ? "Quadrato" : "Da verificare"}
          </span>
        </td>)}</tr>
      </tbody>
    </table></div> : <p className="text-muted mb-0">Nessun costo gestionale registrato.</p>}
    <h3 className="h6 mt-4">Allocazioni da pool</h3>
    <p className="small text-muted">Distribuzione secondaria dei costi già presenti nel registro aziendale. La differenza è uno scostamento gestionale e non modifica la quadratura primaria.</p>
    {pools.length ? <div className="table-responsive"><table className="table table-sm mb-0">
      <thead><tr><th>Valuta</th><th>Costi nei pool</th><th>Allocazioni generate dai pool</th><th>Differenza / sovra-sotto allocazione</th></tr></thead>
      <tbody>{pools.map(pool => <tr key={pool.currency}><td>{pool.currency}</td><td>{formatMoney(pool.actual_cost, pool.currency)}</td>
        <td>{formatMoney(pool.total_allocated, pool.currency)}</td><td>{formatMoney(pool.pool_variance, pool.currency)}</td></tr>)}</tbody>
    </table></div> : <p className="text-muted mb-0">Nessun pool registrato.</p>}
    <h3 className="h6 mt-4">Costi da utilizzo attrezzature</h3>
    <p className="small text-muted">Utilizzi attivi e chiusi, distinti dai costi aziendali originari e dalla quadratura primaria.</p>
    {assets.length ? assets.map(total => <div key={total.currency}>{formatMoney(total.total_usage, total.currency)}</div>)
      : <p className="text-muted mb-0">Nessun utilizzo economico registrato.</p>}
    <h3 className="h6 mt-4">Consumi materiali</h3>
    <p className="small text-muted">Consumi imputati alle commesse, separati dal costo originario aziendale e dalla quadratura primaria.</p>
    {consumptions.length ? consumptions.map(total => <div key={total.currency}>{formatMoney(total.total_consumption, total.currency)}</div>) : <p className="text-muted mb-0">Nessun consumo registrato.</p>}
    <h3 className="h6 mt-4">Manodopera imputata</h3>
    <p className="small text-muted">Ore attive attribuite alle commesse, separate dalla quadratura primaria.</p>
    {labor.length ? labor.map(total => <div key={total.currency}>{total.total_hours} h · {formatMoney(total.total_cost, total.currency)}</div>) : <p className="text-muted mb-0">Nessuna ora registrata.</p>}
  </section>;
}
