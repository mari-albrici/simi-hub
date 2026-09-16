import Link from "next/link";
import { createProjectAction } from "@/lib/crud";

export default function NewProjectPage() {
  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href="/commesse">Commesse</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Nuova</li>
        </ol>
      </nav>

      <div className="app-card p-4 mx-auto" style={{ maxWidth: 900 }}>
        <h1 className="h3 mb-3">Nuova commessa</h1>

        <form action={createProjectAction} className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Codice commessa</label>
            <input name="project_code" className="form-control" defaultValue="C-NEW" required />
          </div>
          <div className="col-md-8">
            <label className="form-label">Nome</label>
            <input name="name" className="form-control" placeholder="Es. Nuova commessa Milano" required />
          </div>
          <div className="col-md-6">
            <label className="form-label">Cliente</label>
            <input name="customer_name" className="form-control" placeholder="Nome cliente" />
          </div>
          <div className="col-md-6">
            <label className="form-label">Responsabile</label>
            <input name="project_manager_name" className="form-control" placeholder="Nome responsabile" />
          </div>
          <div className="col-md-4">
            <label className="form-label">Paese</label>
            <input name="country" className="form-control" defaultValue="Italia" />
          </div>
          <div className="col-md-4">
            <label className="form-label">Città</label>
            <input name="city" className="form-control" defaultValue="Milano" />
          </div>
          <div className="col-md-4">
            <label className="form-label">Stato</label>
            <select name="status" className="form-select">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Data apertura</label>
            <input name="opening_date" type="date" className="form-control" />
          </div>
          <div className="col-md-6 d-flex align-items-end justify-content-end gap-2">
            <Link href="/commesse" className="btn btn-outline-secondary">Annulla</Link>
            <button type="submit" className="btn btn-dark">Salva</button>
          </div>
        </form>
      </div>
    </>
  );
}
