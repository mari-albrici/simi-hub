import Link from "@/components/ui/app-link";
import { requirePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { formatDate, formatMoney, formatNumber } from "@/lib/formatters";
import { getProjectManagementBudgets, getProjectManagementBudgetById } from "@/lib/management-budgets";
import { getManagementCostCategories } from "@/lib/management-allocations";
import { BudgetAction, BudgetEditor } from "./management-budget-forms";
const statuses = { draft: "Bozza", approved: "Approvato", superseded: "Superato" };
const signedMoney = (value: number, currency: string) => `${value > 0 ? "+" : ""}${formatMoney(value, currency)}`;
export async function ProjectBudgetSection({ projectId, budgetId }: { projectId: string; budgetId?: string }) {
  const user = await requirePermission("management.read");
  const canUpdate = hasPermission(user.role, "management.update");
  const versions = await getProjectManagementBudgets(projectId);
  const approved = versions.find(v => v.status === "approved");
  const selected = budgetId ? versions.find(v => v.id === budgetId) : approved ?? versions[0];
  if (!versions.length) return <section className="app-card p-3 mb-3"><h3 className="h5">Budget</h3><p>Nessun budget gestionale definito</p>{canUpdate && <BudgetAction operation="create" projectId={projectId} label="Crea budget" />}</section>;
  if (!selected) return <p className="alert alert-warning">Versione budget non disponibile. <Link href={`/commesse/${projectId}?tab=management`}>Apri budget corrente</Link></p>;
  const [detail, categories] = await Promise.all([getProjectManagementBudgetById(selected.id), canUpdate && selected.status === "draft" ? getManagementCostCategories() : Promise.resolve([])]);
  if (!detail) return <p className="alert alert-warning">Versione budget non disponibile.</p>;
  const { budget, lines, comparison } = detail;
  const editable = canUpdate && budget.status === "draft";
  const totals = comparison.totals.length ? comparison.totals : [{ currency: budget.currency, budget_amount: 0, actual_cost: 0, variance: 0 }];
  return <section className="app-card p-3 mb-3"><h3 className="h5">Budget</h3>
    {approved && <p>Riferimento corrente: <Link href={`/commesse/${projectId}?tab=management&budget=${approved.id}`}>v{approved.version_number} · {approved.name}</Link> · {formatMoney(approved.budget_total, approved.currency)} · {formatDate(approved.approved_at ?? approved.created_at)}</p>}
    <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Versione</th><th>Nome</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>{versions.map(v => <tr key={v.id} className={v.id === budget.id ? "table-active" : ""}>
      <td>v{v.version_number}</td><td>{v.name}</td><td>{statuses[v.status]}</td><td><div className="d-flex flex-wrap gap-2"><Link className="btn btn-sm btn-outline-secondary" href={`/commesse/${projectId}?tab=management&budget=${v.id}`}>Apri</Link>
        {canUpdate && <BudgetAction operation="clone" projectId={projectId} budgetId={v.id} label="Crea revisione" />}{canUpdate && v.status === "draft" && <BudgetAction operation="approve" projectId={projectId} budgetId={v.id} label="Approva" />}</div></td>
    </tr>)}</tbody></table></div>
    <h4 className="h6 mt-3">v{budget.version_number} · {budget.name} · {statuses[budget.status]}</h4>
    <p className="small text-muted">Creazione: {formatDate(budget.created_at)}{budget.approved_at && <> · Approvazione: {formatDate(budget.approved_at)}</>}{budget.valid_from && <> · Valido dal: {formatDate(budget.valid_from)}</>}</p>
    {budget.notes && <p>{budget.notes}</p>}
    {editable && <div className="d-flex gap-2 mb-3"><BudgetEditor budget={budget} mode="header" /><BudgetEditor budget={budget} mode="line" categories={categories.filter(c => !lines.some(l => l.cost_category_id === c.id))} /></div>}
    {totals.map(total => <div className="row g-3 mb-3" key={total.currency}>
      <div className="col-md-4"><span className="small text-muted">Budget costi ({total.currency})</span><div className="h5">{formatMoney(total.budget_amount, total.currency)}</div></div>
      <div className="col-md-4"><span className="small text-muted">Costi consuntivi ({total.currency})</span><div className="h5">{formatMoney(total.actual_cost, total.currency)}</div></div>
      <div className="col-md-4"><span className="small text-muted">Scostamento ({total.currency})</span><div className="h5">{signedMoney(total.variance, total.currency)}</div></div>
    </div>)}
    <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Categoria</th><th>Valuta</th><th>Budget</th><th>Consuntivo</th><th>Scostamento</th><th>Scostamento %</th>{editable && <th>Azioni</th>}</tr></thead><tbody>{comparison.rows.map(row => {
      const line = row.currency === budget.currency ? lines.find(l => l.cost_category_id === row.category_id) : undefined;
      return <tr key={`${row.category_id ?? row.category_name}-${row.currency}`}><td>{row.category_name}{line?.category?.is_active === false && <span className="text-muted"> (disattivata)</span>}{line?.description && <div className="small">{line.description}</div>}{line?.notes && <div className="small text-muted">{line.notes}</div>}</td><td>{row.currency}</td>
        <td>{formatMoney(row.budget_amount, row.currency)}</td><td>{formatMoney(row.actual_cost, row.currency)}</td><td>{signedMoney(row.variance, row.currency)}</td><td>{row.variance_percent === null ? "—" : `${row.variance_percent > 0 ? "+" : ""}${formatNumber(row.variance_percent)}%`}</td>
        {editable && <td>{line && <div className="d-flex gap-2"><BudgetEditor budget={budget} mode="line" line={line} /><BudgetAction operation="delete" projectId={projectId} budgetId={budget.id} lineId={line.id} label="Elimina riga" /></div>}</td>}</tr>;
    })}</tbody></table></div>{!comparison.rows.length && <p className="text-muted">Nessuna riga budget o costo consuntivo.</p>}
  </section>;
}
