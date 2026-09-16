export default function DeadlinesPage() {
  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item active" aria-current="page">Scadenze</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Scadenze</h1>
          <p className="text-muted mb-0">Monitoraggio dei passaggi amministrativi e tecnici.</p>
        </div>
        <button className="btn btn-dark">+ Nuova scadenza</button>
      </div>

      <div className="row g-3">
        <div className="col-md-4">
          <div className="app-card p-3 h-100">
            <h2 className="h6">Scadute</h2>
            <div className="fs-2 fw-bold">2</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="app-card p-3 h-100">
            <h2 className="h6">Oggi</h2>
            <div className="fs-2 fw-bold">1</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="app-card p-3 h-100">
            <h2 className="h6">Prossimi 30 giorni</h2>
            <div className="fs-2 fw-bold">8</div>
          </div>
        </div>
      </div>
    </>
  );
}
