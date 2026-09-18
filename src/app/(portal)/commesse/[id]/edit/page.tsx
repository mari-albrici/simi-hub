import { getCompaniesByType, getProfileDirectory, getLegalEntities, getAllCompanyContacts } from "@/lib/data";
import { requirePagePermission } from "@/lib/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectById } from "@/lib/data";
import { updateProjectAction } from "@/lib/crud";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("project.update");
  const [customers, managers, entities, contacts] = await Promise.all([getCompaniesByType("customer"), getProfileDirectory(), getLegalEntities(), getAllCompanyContacts()]);
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
            <select name="customer_id" className="form-select" defaultValue={project.customer_id ?? ""}><option value="">Non assegnato</option>{customers.map(item => <option key={item.id} value={item.id}>{item.business_name}</option>)}</select>
          </div>
          <div className="col-md-6"><label className="form-label">Referente cliente</label><select name="customer_contact_id" className="form-select" defaultValue={project.customer_contact_id ?? ""}><option value="">Non assegnato</option>{contacts.filter(item=>!project.customer_id||item.company_id===project.customer_id).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          <div className="col-md-6">
            <label className="form-label">Responsabile</label>
            <select name="project_manager_id" className="form-select" defaultValue={project.project_manager_id ?? ""}><option value="">Non assegnato</option>{managers.map(item => <option key={item.id} value={item.id}>{[item.first_name,item.last_name].filter(Boolean).join(" ")}</option>)}</select>
          </div>
          <div className="col-md-12"><label className="form-label">Società SIMI</label><select name="legal_entity_id" className="form-select" defaultValue={project.legal_entity_id ?? ""}><option value="">Da assegnare</option>{entities.map(item => <option key={item.id} value={item.id}>{item.business_name}</option>)}</select></div>
          <div className="col-md-4">
            <label className="form-label">Paese</label>
            <input name="country" className="form-control" defaultValue={project.country ?? "Italia"} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Città</label>
            <input name="city" className="form-control" defaultValue={project.city ?? ""} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Stato</label>
            <select name="status" className="form-select" defaultValue={project.status}>
              <option value="draft">Preparazione</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="completed">Completed</option>
              <option value="closed">Chiusa</option>
            </select>
          </div>
          <div className="col-md-4"><label className="form-label">Inizio previsto</label><input name="planned_start_date" type="date" className="form-control" defaultValue={project.planned_start_date ?? ""} /></div>
          <div className="col-md-4"><label className="form-label">Fine prevista</label><input name="expected_closing_date" type="date" className="form-control" defaultValue={project.expected_closing_date ?? ""} /></div>
          <div className="col-md-4"><label className="form-label">Inizio effettivo</label><input name="actual_start_date" type="date" className="form-control" defaultValue={project.actual_start_date ?? ""} /></div>
          <div className="col-md-4"><label className="form-label">Fine effettiva</label><input name="closing_date" type="date" className="form-control" defaultValue={project.closing_date ?? ""} /></div>
          <div className="col-12"><label className="form-label">Descrizione</label><textarea name="description" className="form-control" rows={2} defaultValue={project.description ?? ""}/></div>
          <div className="col-12"><label className="form-label">Note</label><textarea name="notes" className="form-control" rows={2} defaultValue={project.notes ?? ""}/></div>
          <div className="col-md-6">
            <label className="form-label">Data apertura</label>
            <input name="opening_date" type="date" className="form-control" defaultValue={project.opening_date ?? ""} />
          </div>
          <div className="col-md-6 d-flex align-items-end justify-content-end gap-2">
            <Link href={`/commesse/${project.id}`} className="btn btn-outline-secondary">Annulla</Link>
            <SubmitButton className="btn btn-dark" pendingLabel="Salvataggio…">Salva modifiche</SubmitButton>
          </div>
        </form>
      </div>
    </>
  );
}
