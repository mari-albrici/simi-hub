export default function LegalEntitiesPage() {
  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item active" aria-current="page">Aziende SIMI</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Aziende SIMI</h1>
          <p className="text-muted mb-0">Società e sedi del gruppo SIMI.</p>
        </div>
        <button className="btn btn-dark">+ Nuova azienda</button>
      </div>

      <div className="app-card p-3">
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
            <tr>
              <td>SIMI-IT</td>
              <td>SIMI Italia</td>
              <td>Italia</td>
              <td>info@simi.it</td>
              <td>+39 02 5555 1234</td>
              <td><span className="badge text-bg-success">Sì</span></td>
            </tr>
            <tr>
              <td>SIMI-FR</td>
              <td>SIMI Francia</td>
              <td>Francia</td>
              <td>info@fr.simi.it</td>
              <td>+33 1 5555 9876</td>
              <td><span className="badge text-bg-success">Sì</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
