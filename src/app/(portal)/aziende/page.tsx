import { getLegalEntities } from "@/lib/data";

export default async function LegalEntitiesPage() {
  const legalEntities = await getLegalEntities();

  return (
    <>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Aziende SIMI</h1>
          <p className="text-muted mb-0">Società e sedi del gruppo SIMI.</p>
        </div>
        <button className="btn btn-dark">+ Nuova azienda</button>
      </div>

      <div className="app-card p-3">
        {legalEntities.length === 0 ? (
          <div className="empty-state">
            <div className="h5">Nessuna azienda registrata</div>
            <p className="mb-0">Aggiungi le società e le sedi del gruppo SIMI per iniziare.</p>
          </div>
        ) : (
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th>Codice</th>
                <th>Ragione sociale</th>
                <th>Paese</th>
                <th>Email</th>
                <th>Telefono</th>
                <th>Attiva</th>
              </tr>
            </thead>
            <tbody>
              {legalEntities.map((entity) => (
                <tr key={entity.id}>
                  <td>{entity.code}</td>
                  <td>{entity.business_name}</td>
                  <td>{entity.country ?? "-"}</td>
                  <td>{entity.email ?? "-"}</td>
                  <td>{entity.phone ?? "-"}</td>
                  <td><span className={`badge text-bg-${entity.active ? "success" : "secondary"}`}>{entity.active ? "Sì" : "No"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
