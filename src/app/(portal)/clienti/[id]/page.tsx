import { StatusBadge } from "@/components/ui/status-badge";
import { ContextDocuments } from "@/components/documents/context-documents";
import { getAccessScope, requirePagePermission } from "@/lib/permissions";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/data";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("company.read");
  const access = await getAccessScope("company");
  const { id } = await params;
  const customer = await getCompanyById(id);

  if (!customer || !["customer", "both"].includes(customer.company_type)) {
    notFound();
  }

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href="/clienti">Clienti</Link></li>
          <li className="breadcrumb-item active" aria-current="page">{customer.business_name}</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <div className="text-uppercase small text-muted mb-1">Cliente</div>
          <h1 className="h3 mb-1">{customer.business_name}</h1>
          <div className="d-flex flex-wrap gap-3 text-muted small">
            <span>Paese: {customer.country ?? "-"}</span>
            <span>P. IVA: {customer.vat_number ?? "-"}</span>
            <StatusBadge status={customer.active?"active":"inactive"}/>
          </div>
        </div>
        {access.canUpdate && <Link href={`/clienti/${customer.id}/edit`} className="btn btn-dark">Modifica</Link>}
      </div>

      <div className="row g-3 mb-4">
        <div className="col-12">
          <div className="app-card p-3">
            <h2 className="h5 mb-3">Anagrafica</h2>
            <p><strong>Codice eSolver:</strong> {customer.esolver_code || "—"}</p>
            <div className="row g-3">
              <div className="col-md-6"><strong>Ragione sociale:</strong> {customer.business_name}</div>
              <div className="col-md-6"><strong>Email:</strong> {customer.email ?? "-"}</div>
              <div className="col-md-6"><strong>Telefono:</strong> {customer.phone ?? "-"}</div>
              <div className="col-md-6"><strong>Indirizzo:</strong> {customer.address ?? "-"}{customer.city ? `, ${customer.city}` : ""}</div>
            </div>
          </div>
        </div>


      </div>
    <ContextDocuments company={customer.id}/></>
  );
}
