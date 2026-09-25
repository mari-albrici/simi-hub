import { requirePermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/auth";
import { getEmployeeManagementRates, getProjectLaborEntries, getLaborEmployees, getLaborTotals } from "@/lib/management-labor";
import { formatDate, formatMoney, formatNumber } from "@/lib/formatters";
import { EmployeeRateTrigger, LaborEntryTrigger, CancelLaborEntry } from "./management-labor-forms";
import { LABOR_HOUR_TYPES } from "@/lib/constants";
export async function EmployeeManagementRates({ employeeId }: { employeeId: string }) {
  const user = await requirePermission("employee.hr.read"); const canUpdate = hasPermission(user.role, "employee.update");
  const rates = await getEmployeeManagementRates(employeeId);
  const today = new Date().toISOString().slice(0, 10);
  const current = rates.find(rate => rate.valid_from <= today && (!rate.valid_to || rate.valid_to >= today));
  return <section className="app-card p-3 mb-3">
    <div className="d-flex justify-content-between align-items-center mb-3"><h2 className="h5 mb-0">Costo gestionale</h2>{canUpdate && <EmployeeRateTrigger employeeId={employeeId} />}</div>
    <p>{current ? <>Tariffa corrente: <strong>{formatNumber(current.hourly_cost, 6)} {current.currency}/h</strong> · {formatDate(current.valid_from)} – {formatDate(current.valid_to)}</> : "Nessun costo gestionale valido alla data odierna."}</p>
    <div className="table-responsive"><table className="table table-sm"><thead><tr><th>Valida dal</th><th>Valida al</th><th>Costo orario</th><th>Note</th>{canUpdate && <th>Azioni</th>}</tr></thead>
      <tbody>{rates.map(rate => <tr key={rate.id}><td>{formatDate(rate.valid_from)}</td><td>{rate.valid_to ? formatDate(rate.valid_to) : "Senza fine"}</td>
        <td>{formatNumber(rate.hourly_cost, 6)} {rate.currency}/h</td><td>{rate.notes}</td>{canUpdate && <td><EmployeeRateTrigger employeeId={employeeId} rate={rate} /></td>}</tr>)}</tbody>
    </table></div>
  </section>;
}
export async function ProjectLaborSection({ projectId }: { projectId: string }) {
  const user = await requirePermission("management.read"); const canUpdate = hasPermission(user.role, "management.update");
  const [entries, totals, employees] = await Promise.all([getProjectLaborEntries(projectId), getLaborTotals(projectId), canUpdate ? getLaborEmployees() : Promise.resolve([])]);
  return <section className="app-card p-3 mt-3">
    <div className="d-flex justify-content-between align-items-center mb-3"><h3 className="h5 mb-0">Manodopera</h3>{canUpdate && <LaborEntryTrigger projectId={projectId} employees={employees} />}</div>
    <div className="row g-3 mb-3"><div className="col-md-6"><div className="small text-muted">Ore totali attive</div><strong>{formatNumber(totals.reduce((sum, row) => sum + Number(row.total_hours), 0))} h</strong></div>
      <div className="col-md-6"><div className="small text-muted">Costo manodopera</div>{totals.length ? totals.map(total => <strong className="d-block" key={total.currency}>{formatMoney(total.total_cost, total.currency)}</strong>) : <strong>0</strong>}</div></div>
    <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Data</th><th>Dipendente</th><th>Tipo ore</th><th>Ore</th><th>Costo orario</th><th>Importo</th><th>Stato</th><th>Note</th>{canUpdate && <th>Azioni</th>}</tr></thead>
      <tbody>{entries.map(entry => <tr key={entry.id}><td>{formatDate(entry.work_date)}</td><td>{entry.employee_name}</td><td>{LABOR_HOUR_TYPES[entry.hour_type]}</td>
        <td>{formatNumber(entry.hours)}</td><td>{formatNumber(entry.hourly_cost_snapshot, 6)} {entry.currency}/h</td><td>{formatMoney(entry.amount, entry.currency)}</td>
        <td>{entry.status === "active" ? "Attivo" : "Annullato"}</td><td>{entry.notes}</td>{canUpdate && <td>{entry.status === "active" && <div className="d-flex gap-1"><LaborEntryTrigger projectId={projectId} employees={employees} entry={entry} /><CancelLaborEntry entry={entry} /></div>}</td>}</tr>)}</tbody>
    </table></div>{!entries.length && <p className="text-muted mb-0">Nessuna ora registrata.</p>}
  </section>;
}
