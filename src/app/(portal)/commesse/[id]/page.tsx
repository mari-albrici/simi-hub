import { ContextDocuments } from "@/components/documents/context-documents";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission, getAccessScope } from "@/lib/permissions";
import { getProjectById } from "@/lib/data";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("project.read");
  const project = await getProjectById((await params).id); if (!project) notFound();
  const access = await getAccessScope("project");
  return <><div className="d-flex justify-content-between mb-4"><h1 className="h3">{project.project_code} — {project.name}</h1>{access.canUpdate && <Link className="btn btn-dark" href={`/commesse/${project.id}/edit`}>Modifica</Link>}</div>
    <div className="app-card p-3 mb-3"><dl className="row mb-0"><dt className="col-sm-3">Cliente</dt><dd className="col-sm-9">{project.customer_id ? <Link href={`/clienti/${project.customer_id}`}>{project.customer_name ?? "Cliente collegato"}</Link> : "Non assegnato"}</dd>
    <dt className="col-sm-3">Responsabile</dt><dd className="col-sm-9">{project.project_manager_name ?? "Non assegnato"}</dd><dt className="col-sm-3">Stato</dt><dd className="col-sm-9">{project.status}</dd><dt className="col-sm-3">Località</dt><dd className="col-sm-9">{[project.city,project.country].filter(Boolean).join(", ") || "—"}</dd><dt className="col-sm-3">Apertura</dt><dd className="col-sm-9">{project.opening_date ?? "—"}</dd><dt className="col-sm-3">Note</dt><dd className="col-sm-9">{project.notes || "Nessuna nota registrata."}</dd></dl></div>
    <ActivityTimeline items={[]} />
  <ContextDocuments project={project.id} entity={project.legal_entity_id}/></>;
}
