import Link from "next/link";
import { deleteProjectAction } from "@/lib/crud";
import { getProjects } from "@/lib/data";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Commesse</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Commesse</h1>
          <p className="text-muted mb-0">Gestione delle attività e delle commesse attive.</p>
        </div>
        <Link href="/commesse/new" className="btn btn-dark">+ Nuova</Link>
      </div>

      <div className="content-panel p-3 mb-4">
        <div className="row g-2 align-items-end">
          <div className="col-md-4">
            <label className="form-label small text-muted">Ricerca</label>
            <input className="form-control" placeholder="Codice o nome commessa" />
          </div>
          <div className="col-md-2">
            <label className="form-label small text-muted">Stato</label>
            <select className="form-select">
              <option>Tutti</option>
              <option>active</option>
              <option>draft</option>
              <option>completed</option>
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small text-muted">Paese</label>
            <select className="form-select">
              <option>Tutti</option>
              <option>Italia</option>
              <option>Francia</option>
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small text-muted">Cliente</label>
            <select className="form-select">
              <option>Tutti</option>
              <option>Cimolai</option>
            </select>
          </div>
          <div className="col-md-2">
            <button className="btn btn-outline-secondary w-100">Filtra</button>
          </div>
        </div>
      </div>

      <div className="app-card">
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th>Codice</th>
                <th>Commessa</th>
                <th>Cliente</th>
                <th>Paese</th>
                <th>Località</th>
                <th>Responsabile</th>
                <th>Apertura</th>
                <th>Stato</th>
                <th className="text-end">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td><Link href={`/commesse/${project.id}`} className="text-decoration-none fw-semibold">{project.project_code}</Link></td>
                  <td>{project.name}</td>
                  <td>{project.customer_name}</td>
                  <td>{project.country}</td>
                  <td>{project.city}</td>
                  <td>{project.project_manager_name}</td>
                  <td>{project.opening_date}</td>
                  <td><span className="badge text-bg-success">{project.status}</span></td>
                  <td className="text-end">
                    <div className="d-flex gap-2 justify-content-end">
                      <Link href={`/commesse/${project.id}/edit`} className="btn btn-sm btn-outline-secondary">Modifica</Link>
                      <form action={async () => {
                        "use server";
                        await deleteProjectAction(project.id);
                      }}>
                        <button type="submit" className="btn btn-sm btn-outline-danger">Elimina</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
