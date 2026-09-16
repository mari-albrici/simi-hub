import Link from "next/link";
import { getDashboardViewModel } from "@/lib/data";

export default async function DashboardPage() {
  const data = await getDashboardViewModel();

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item active" aria-current="page">Dashboard</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 mb-1">Dashboard</h1>
          <p className="text-muted mb-0">Attività amministrative e operazioni da completare.</p>
        </div>
      </div>

      <div className="row g-3 mb-4">
        {data.cards.map((card) => (
          <div className="col-md-6 col-xl-3" key={card.label}>
            <div className="app-card kpi-card h-100">
              <div className={`badge-soft text-bg-${card.tone ?? "primary"} mb-2`}>{card.value}</div>
              <div className="kpi-value">{card.value}</div>
              <div className="kpi-label">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-4">
        <div className="col-xl-7">
          <div className="app-card p-3 h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="h5 mb-0">Attività da completare</h2>
              <Link href="/commesse" className="btn btn-sm btn-outline-secondary">Vedi tutto</Link>
            </div>
            <div className="list-group list-group-flush">
              {data.recentActivity.map((item) => (
                <div key={item} className="list-group-item px-0 py-2">
                  <div className="d-flex align-items-center gap-3">
                    <span className="rounded-circle bg-warning-subtle" style={{ width: 10, height: 10, display: "inline-block" }}></span>
                    <span>{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-xl-5">
          <div className="app-card p-3 h-100">
            <h2 className="h5 mb-3">Scadenze imminenti</h2>
            <div className="list-group list-group-flush">
              {data.upcomingDeadlines.map((item) => (
                <div key={item.title} className="list-group-item px-0 py-2">
                  <div className="d-flex justify-content-between gap-3">
                    <div>
                      <div className="fw-semibold">{item.title}</div>
                      <small className="text-muted">Scadenza: {item.dueDate}</small>
                    </div>
                    <span className="badge text-bg-warning">{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-xl-6">
          <div className="app-card p-3 h-100">
            <h2 className="h5 mb-3">Commesse recenti</h2>
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Codice</th>
                    <th>Commessa</th>
                    <th>Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((project) => (
                    <tr key={project.id}>
                      <td>{project.project_code}</td>
                      <td>{project.name}</td>
                      <td><span className="badge text-bg-success">{project.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-xl-6">
          <div className="app-card p-3 h-100">
            <h2 className="h5 mb-3">Attività recenti</h2>
            <div className="list-group list-group-flush">
              {data.recentActivity.map((item) => (
                <div key={item} className="list-group-item px-0 py-2">
                  <small className="text-muted">16/09/2026 15:42</small>
                  <div>{item}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
