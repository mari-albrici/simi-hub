import { getEmployees } from "@/lib/data";

export default async function PersonnelPage() {
  const employees = await getEmployees();

  return (
    <>
     <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Personale</h1>
          <p className="text-muted mb-0">Anagrafica dipendenti e referenti aziendali.</p>
        </div>
        <button className="btn btn-dark">+ Nuovo dipendente</button>
      </div>

      <div className="app-card p-3">
        {employees.length === 0 ? (
          <div className="empty-state">
            <div className="h5">Nessun dipendente registrato</div>
            <p className="mb-0">Aggiungi l'anagrafica del personale per iniziare.</p>
          </div>
        ) : (
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th>Dipendente</th>
                <th>Codice</th>
                <th>Ruolo</th>
                <th>Email</th>
                <th>Società</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.full_name}</td>
                  <td>{employee.employee_code ?? "-"}</td>
                  <td>{employee.role_title ?? "-"}</td>
                  <td>{employee.email ?? "-"}</td>
                  <td>{employee.legal_entity_name ?? "-"}</td>
                  <td><span className={`badge text-bg-${employee.status === "active" ? "success" : "secondary"}`}>{employee.status === "active" ? "Attivo" : employee.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
