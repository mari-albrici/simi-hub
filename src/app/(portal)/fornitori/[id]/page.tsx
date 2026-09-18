import { ContextDocuments } from "@/components/documents/context-documents";
import { getAccessScope, requirePagePermission } from "@/lib/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/data";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("company.read");
  const access = await getAccessScope("company");
  const { id } = await params;
  const supplier = await getCompanyById(id);

  if (!supplier || !["supplier", "both"].includes(supplier.company_type)) {
    notFound();
  }

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href="/fornitori">Fornitori</Link></li>
          <li className="breadcrumb-item active" aria-current="page">{supplier.business_name}</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <div className="text-uppercase small text-muted mb-1">Fornitore</div>
          <h1 className="h3 mb-1">{supplier.business_name}</h1>
          <div className="d-flex flex-wrap gap-3 text-muted small">
            <span>Paese: {supplier.country ?? "-"}</span>
            <span>P. IVA: {supplier.vat_number ?? "-"}</span>
            <span>Attivo: {supplier.active ? "Sì" : "No"}</span>
          </div>
        </div>
        {access.canUpdate && <Link href={`/fornitori/${supplier.id}/edit`} className="btn btn-dark">Modifica</Link>}
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="app-card p-3">
            <h2 className="h5 mb-3">Anagrafica</h2>
            <div className="row g-3">
              <div className="col-md-6"><strong>Ragione sociale:</strong> {supplier.business_name}</div>
              <div className="col-md-6"><strong>Email:</strong> {supplier.email ?? "-"}</div>
              <div className="col-md-6"><strong>Telefono:</strong> {supplier.phone ?? "-"}</div>
              <div className="col-md-6"><strong>Indirizzo:</strong> {supplier.address ?? "-"}{supplier.city ? `, ${supplier.city}` : ""}</div>

              <div className="col-md-6"><strong>Paese:</strong> {supplier.country ?? "-"}</div>
            </div>
          </div>
        </div>


      </div>
    <ContextDocuments company={supplier.id}/></>
  );
}
