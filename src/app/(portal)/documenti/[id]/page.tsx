import Link from "next/link";

export default function DocumentDetailPage() {
  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href="/documenti">Documenti</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Contratto principale</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <div className="text-uppercase small text-muted mb-1">Documento</div>
          <h1 className="h3 mb-1">Contratto principale.pdf</h1>
          <div className="d-flex flex-wrap gap-3 text-muted small">
            <span>Categoria: 01 Contratti</span>
            <span>Commessa: C1071</span>
            <span>Data: 01/09/2026</span>
          </div>
        </div>
        <button className="btn btn-dark">Scarica</button>
      </div>

      <div className="app-card p-3">
        <h2 className="h5 mb-3">Metadati</h2>
        <div className="row g-3">
          <div className="col-md-6"><strong>Nome originale:</strong> Contratto principale.pdf</div>
          <div className="col-md-6"><strong>Formato:</strong> PDF</div>
          <div className="col-md-6"><strong>Dimensione:</strong> 1.8 MB</div>
          <div className="col-md-6"><strong>Stato:</strong> <span className="badge text-bg-success">Valido</span></div>
          <div className="col-md-12"><strong>Descrizione:</strong> Contratto principale di riferimento per l’avanzamento della commessa C1071.</div>
        </div>
      </div>
    </>
  );
}
