import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
import { getProjectById } from "@/lib/data";

const timelineItems = [
  {
    time: "16/09/2026 15:42",
    user: "Mario Rossi",
    title: "Fattura 921",
    description: "Stato modificato: DA REGISTRARE → ANOMALIA",
  },
  {
    time: "15/09/2026 11:20",
    user: "Laura Verdi",
    title: "Documento caricato",
    description: "Contratto principale aggiornato per la commessa C1071",
  },
  {
    time: "14/09/2026 17:10",
    user: "Marco Bianchi",
    title: "Scadenza completata",
    description: "Verifica documentale completata per il team tecnico",
  },
];

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href="/commesse">Commesse</Link></li>
          <li className="breadcrumb-item active" aria-current="page">{project.project_code}</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <div className="text-uppercase small text-muted mb-1">Commessa</div>
          <h1 className="h3 mb-1">{project.project_code} - {project.name}</h1>
          <div className="small text-muted mb-2">ID: {project.id}</div>
          <div className="d-flex flex-wrap gap-3 text-muted small">
            <span>Stato: <strong className="text-success">{project.status}</strong></span>
            <span>Cliente: {project.customer_name}</span>
            <span>Paese: {project.country}</span>
            <span>Località: {project.city}</span>
          </div>
        </div>
        <button className="btn btn-dark">Modifica</button>
      </div>

      <ul className="nav nav-tabs mb-4">
        {[
          "Panoramica",
          "Documenti",
          "Contratti",
          "Tecnica",
          "Acquisti",
          "DDT",
          "Fatture",
          "Corrispondenza",
          "Scadenze",
          "Note",
          "Attività",
        ].map((tab) => (
          <li className="nav-item" key={tab}>
            <button className={`nav-link ${tab === "Panoramica" ? "active" : ""}`} type="button">{tab}</button>
          </li>
        ))}
      </ul>

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="app-card p-3 mb-4">
            <h2 className="h5 mb-3">Panoramica</h2>
            <div className="row g-3">
              <div className="col-md-6"><strong>Data apertura:</strong> {project.opening_date ?? "-"}</div>
              <div className="col-md-6"><strong>Responsabile:</strong> {project.project_manager_name}</div>
              <div className="col-md-6"><strong>Cliente:</strong> {project.customer_name}</div>
              <div className="col-md-6"><strong>Stato:</strong> {project.status}</div>
              <div className="col-md-6"><strong>Paese:</strong> {project.country}</div>
              <div className="col-md-6"><strong>Località:</strong> {project.city}</div>
            </div>
          </div>

          <div className="app-card p-3">
            <h2 className="h5 mb-3">Documenti principali</h2>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Nome</th>
                    <th>Data</th>
                    <th>Stato</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>01 Contratti</td>
                    <td>Contratto principale.pdf</td>
                    <td>01/09/2026</td>
                    <td><span className="badge text-bg-success">Validato</span></td>
                  </tr>
                  <tr>
                    <td>04 Tecnica</td>
                    <td>Schema impiantistico.pdf</td>
                    <td>04/09/2026</td>
                    <td><span className="badge text-bg-warning">Da verificare</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="app-card p-3 mb-4">
            <h2 className="h5 mb-3">Note</h2>
            <p className="mb-0 text-muted">Commessa in fase di avanzamento. Verifica documenti tecnici e scadenze di pagamento.</p>
          </div>

          <ActivityTimeline items={timelineItems} />
        </div>
      </div>
    </>
  );
}
