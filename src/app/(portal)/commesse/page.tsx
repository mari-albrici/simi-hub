import { getAccessScope, requirePagePermission } from "@/lib/permissions";
import Link from "next/link";
import { deleteProjectAction } from "@/lib/crud";
import { getProjects } from "@/lib/data";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

export default async function ProjectsPage() {
  await requirePagePermission("project.read");
  const access = await getAccessScope("project");
  const projects = await getProjects();

  return (
    <>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Commesse</h1>
          <p className="text-muted mb-0">Gestione delle attività e delle commesse attive.</p>
        </div>
        {access.canCreate && <Link href="/commesse/new" className="btn btn-dark">+ Nuova</Link>}
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
              {projects.length === 0 && <tr><td colSpan={9} className="text-muted py-4">Nessun record presente.</td></tr>}
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
                      <Link href={`/commesse/${project.id}`} className="btn btn-sm btn-outline-secondary">Visualizza</Link>
                      {access.canUpdate && <Link href={`/commesse/${project.id}/edit`} className="btn btn-sm btn-outline-secondary">Modifica</Link>}
                      {access.canDelete && <form action={async () => {
                        "use server";
                        await deleteProjectAction(project.id);
                      }}>
                        <ConfirmSubmitButton confirmMessage={`Archiviare la commessa ${project.project_code}?`} pendingLabel="Archiviazione…">
                          Archivia
                        </ConfirmSubmitButton>
                      </form>}
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
