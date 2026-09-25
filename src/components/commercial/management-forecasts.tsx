import Link from "@/components/ui/app-link";
import { requirePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { formatDate, formatMoney, formatNumber } from "@/lib/formatters";
import { getProjectManagementForecasts, getProjectManagementForecastById, type ForecastTotal } from "@/lib/management-forecasts";
import { getManagementCostCategories } from "@/lib/management-allocations";
import { ForecastAction, ForecastEditor } from "./management-forecast-forms";
const statuses = { draft: "Bozza", approved: "Approvato", superseded: "Superato" };
const variance = (value: number | null, currency: string) => value === null ? "—" : `${value > 0 ? "+" : ""}${formatMoney(value, currency)}`;
const percent = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${formatNumber(value)}%`;
function AmountCells({ row }: { row: ForecastTotal }) {
  return <><td>{row.currency}</td><td>{formatMoney(row.budget_amount, row.currency)}</td><td>{formatMoney(row.actual_cost, row.currency)}</td><td>{formatMoney(row.cost_to_complete, row.currency)}</td><td>{formatMoney(row.estimate_at_completion, row.currency)}</td><td>{variance(row.forecast_variance, row.currency)}</td><td>{percent(row.forecast_variance_percent)}</td></>;
}
export async function ProjectForecastSection({ projectId, forecastId }: { projectId: string; forecastId?: string }) {
  const user = await requirePermission("management.read"); const canUpdate = hasPermission(user.role, "management.update");
  const versions = await getProjectManagementForecasts(projectId);
  const approved = versions.find(v => v.status === "approved");
  const selected = forecastId ? versions.find(v => v.id === forecastId) : approved ?? versions[0];
  if (forecastId && !selected) return <p className="alert alert-warning">Forecast non disponibile. <Link href={`/commesse/${projectId}?tab=management`}>Apri forecast corrente</Link></p>;
  const [{ forecast, lines, comparison }, categories] = await Promise.all([
    getProjectManagementForecastById(selected?.id ?? null, projectId), canUpdate && selected?.status === "draft" ? getManagementCostCategories() : Promise.resolve([]),
  ]);
  const editable = canUpdate && forecast?.status === "draft";
  return <section className="app-card p-3 mb-3"><h3 className="h5">Budget, consuntivo e forecast</h3>
    <p>{comparison.budget_id ? <>Budget di riferimento approvato: <Link href={`/commesse/${projectId}?tab=management&budget=${comparison.budget_id}`}>{comparison.budget_name}</Link></> : "Nessun budget approvato: scostamenti non disponibili."}</p>
    {!versions.length && <><p>Nessun forecast gestionale definito. Costi a finire pari a zero fino all’inserimento del forecast.</p>{canUpdate && <ForecastAction operation="create" projectId={projectId} />}</>}
    {approved && <p>Forecast corrente: <Link href={`/commesse/${projectId}?tab=management&forecast=${approved.id}`}>v{approved.version_number} · {approved.name}</Link></p>}
    {!!versions.length && <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Versione</th><th>Data forecast</th><th>Stato</th><th>EAC totale aggiornato</th><th>Azioni</th></tr></thead><tbody>{versions.map(v => <tr key={v.id} className={v.id === forecast?.id ? "table-active" : ""}>
      <td>v{v.version_number} · {v.name}</td><td>{formatDate(v.forecast_date)}</td><td>{statuses[v.status]}</td><td>{v.totals.map(t => <div key={t.currency}>{formatMoney(t.estimate_at_completion, t.currency)}</div>)}</td>
      <td><div className="d-flex flex-wrap gap-2"><Link className="btn btn-sm btn-outline-secondary" href={`/commesse/${projectId}?tab=management&forecast=${v.id}`}>Apri</Link>{canUpdate && <ForecastAction operation="clone" projectId={projectId} forecastId={v.id} />}{canUpdate && v.status === "draft" && <ForecastAction operation="approve" projectId={projectId} forecastId={v.id} />}</div></td>
    </tr>)}</tbody></table></div>}
    {forecast && <><h4 className="h6 mt-3">v{forecast.version_number} · {forecast.name} · {statuses[forecast.status]}</h4><p className="small text-muted">Data forecast: {formatDate(forecast.forecast_date)}. Consuntivo, EAC e scostamenti sono aggiornati ai costi attuali e al budget approvato corrente; non sono valori storicizzati. Il CTC non si riduce automaticamente.</p>{forecast.notes && <p>{forecast.notes}</p>}</>}
    {editable && forecast && <div className="d-flex gap-2 mb-3"><ForecastEditor forecast={forecast} mode="header" /><ForecastEditor forecast={forecast} mode="line" categories={categories.filter(c => !lines.some(l => l.cost_category_id === c.id))} rows={comparison.rows} /></div>}
    {comparison.totals.map(t => <div className="row g-3 my-2" key={t.currency}>{[
      ["Budget costi", formatMoney(t.budget_amount, t.currency)], ["Costi consuntivi", formatMoney(t.actual_cost, t.currency)], ["Costi a finire", formatMoney(t.cost_to_complete, t.currency)], ["Costo finale previsto", formatMoney(t.estimate_at_completion, t.currency)], ["Scostamento previsto", variance(t.forecast_variance, t.currency)],
    ].map(([label, value]) => <div className="col" key={label}><div className="small text-muted">{label} ({t.currency})</div><strong>{value}</strong></div>)}</div>)}
    <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Categoria</th><th>Valuta</th><th>Budget</th><th>Consuntivo</th><th>Da sostenere</th><th>Forecast finale</th><th>Scostamento forecast</th><th>Scostamento %</th>{editable && <th>Azioni</th>}</tr></thead><tbody>{comparison.rows.map(row => {
      const line = lines.find(l => l.cost_category_id === row.category_id);
      const category = categories.find(c => c.id === row.category_id);
      return <tr key={`${row.category_id ?? row.category_name}-${row.currency}`}><td>{row.category_name}{row.currency === forecast?.currency && line?.notes && <div className="small text-muted">{line.notes}</div>}</td><AmountCells row={row} />
        {editable && <td>{forecast && row.category_id && row.currency === forecast.currency && (line || category?.is_active) && <ForecastEditor forecast={forecast} mode="line" line={line} categoryId={row.category_id} categories={categories} rows={comparison.rows} />}</td>}</tr>;
    })}</tbody><tfoot>{comparison.totals.map(t => <tr key={t.currency} className="fw-bold"><td>TOTALE</td><AmountCells row={t} />{editable && <td />}</tr>)}</tfoot></table></div>
    {!comparison.rows.length && <p className="text-muted">Nessuna categoria presente in budget, consuntivo o forecast.</p>}
  </section>;
}
