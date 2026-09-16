export default function PersonnelPage() {
  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item active" aria-current="page">Personale</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Personale</h1>
          <p className="text-muted mb-0">Anagrafica dipendenti e referenti aziendali.</p>
        </div>
        <button className="btn btn-dark">+ Nuovo dipendente</button>
      </div>

      <div className="app-card p-3">
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
            <tr>
              <td>Mario Rossi</td>
              <td>EMP-101</td>
              <td>Amministrazione</td>
              <td>mario.rossi@simi.it</td>
              <td>SIMI Italia</td>
              <td><span className="badge text-bg-success">Attivo</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
