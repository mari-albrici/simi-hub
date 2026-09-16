import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/data";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCompanyById(id);

  if (!customer || customer.company_type !== "customer") {
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
            <span>Attivo: {customer.active ? "Sì" : "No"}</span>
          </div>
        </div>
        <button className="btn btn-dark">Modifica</button>
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="app-card p-3">
            <h2 className="h5 mb-3">Anagrafica</h2>
            <div className="row g-3">
              <div className="col-md-6"><strong>Ragione sociale:</strong> {customer.business_name}</div>
              <div className="col-md-6"><strong>Email:</strong> {customer.email ?? "-"}</div>
              <div className="col-md-6"><strong>Telefono:</strong> {customer.phone ?? "-"}</div>
              <div className="col-md-6"><strong>Indirizzo:</strong> {customer.address ?? "-"}{customer.city ? `, ${customer.city}` : ""}</div>
              <div className="col-md-6"><strong>Contatto:</strong> {customer.contact_name ?? "-"}</div>
              <div className="col-md-6"><strong>Paese:</strong> {customer.country ?? "-"}</div>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="app-card p-3">
            <h2 className="h5 mb-3">Quick actions</h2>
            <div className="d-grid gap-2">
              <button className="btn btn-outline-dark btn-sm" type="button">Apri documenti</button>
              <button className="btn btn-outline-dark btn-sm" type="button">Visualizza fatture</button>
              <button className="btn btn-outline-dark btn-sm" type="button">Contatta cliente</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
