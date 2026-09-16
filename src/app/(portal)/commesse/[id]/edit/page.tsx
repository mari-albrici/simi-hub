import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectById } from "@/lib/data";
import { updateProjectAction } from "@/lib/crud";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
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
          <li className="breadcrumb-item active" aria-current="page">Modifica</li>
        </ol>
      </nav>

      <div className="app-card p-4 mx-auto" style={{ maxWidth: 900 }}>
        <h1 className="h3 mb-3">Modifica commessa</h1>

        <form action={updateProjectAction} className="row g-3">
          <input type="hidden" name="id" value={project.id} />
          <div className="col-md-4">
            <label className="form-label">Codice commessa</label>
            <input name="project_code" className="form-control" defaultValue={project.project_code} required />
          </div>
          <div className="col-md-8">
            <label className="form-label">Nome</label>
            <input name="name" className="form-control" defaultValue={project.name} required />
          </div>
          <div className="col-md-6">
            <label className="form-label">Cliente</label>
            <input name="customer_name" className="form-control" defaultValue={project.customer_name ?? ""} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Responsabile</label>
            <input name="project_manager_name" className="form-control" defaultValue={project.project_manager_name ?? ""} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Paese</label>
            <input name="country" className="form-control" defaultValue={project.country ?? "Italia"} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Città</label>
            <input name="city" className="form-control" defaultValue={project.city ?? "Milano"} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Stato</label>
            <select name="status" className="form-select" defaultValue={project.status}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Data apertura</label>
            <input name="opening_date" type="date" className="form-control" defaultValue={project.opening_date ?? ""} />
          </div>
          <div className="col-md-6 d-flex align-items-end justify-content-end gap-2">
            <Link href={`/commesse/${project.id}`} className="btn btn-outline-secondary">Annulla</Link>
            <button type="submit" className="btn btn-dark">Salva modifiche</button>
          </div>
        </form>
      </div>
    </>
  );
}
