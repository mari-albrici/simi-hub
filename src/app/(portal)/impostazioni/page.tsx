export default function SettingsPage() {
  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item active" aria-current="page">Impostazioni</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Impostazioni</h1>
          <p className="text-muted mb-0">Configurazione amministrativa del portale.</p>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-6">
          <div className="app-card p-3">
            <h2 className="h5 mb-3">Azienda</h2>
            <div className="mb-3">
              <label className="form-label">Nome azienda</label>
              <input className="form-control" defaultValue="SIMI Group" />
            </div>
            <div className="mb-3">
              <label className="form-label">Dominio email consentito</label>
              <input className="form-control" defaultValue="simi.it" />
            </div>
            <button className="btn btn-dark">Salva impostazioni</button>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="app-card p-3">
            <h2 className="h5 mb-3">Permessi e ruoli</h2>
            <ul className="list-group list-group-flush">
              <li className="list-group-item px-0">admin</li>
              <li className="list-group-item px-0">administration</li>
              <li className="list-group-item px-0">management</li>
              <li className="list-group-item px-0">project_manager</li>
              <li className="list-group-item px-0">technical</li>
              <li className="list-group-item px-0">viewer</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
