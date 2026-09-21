import { requirePagePermission } from "@/lib/permissions";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/data";
import { updateCompanyAction } from "@/lib/crud";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("company.update");
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
          <li className="breadcrumb-item active" aria-current="page">Modifica</li>
        </ol>
      </nav>

      <div className="app-card p-4 mx-auto" style={{ maxWidth: 900 }}>
        <h1 className="h3 mb-3">Modifica cliente</h1>

        <form action={updateCompanyAction} className="row g-3">
          <input type="hidden" name="id" value={customer.id} />
          <input type="hidden" name="company_type" value={customer.company_type} />
<div className="col-md-6"><label className="form-label" htmlFor="esolver_code">Codice eSolver</label><input id="esolver_code" name="esolver_code" className="form-control" maxLength={120} defaultValue={customer.esolver_code ?? ""}/></div>
          <div className="col-md-6">
            <label className="form-label">Ragione sociale</label>
            <input name="business_name" className="form-control" defaultValue={customer.business_name} required />
          </div>
          <div className="col-md-6">
            <label className="form-label">P. IVA</label>
            <input name="vat_number" className="form-control" defaultValue={customer.vat_number ?? ""} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Paese</label>
            <input name="country" className="form-control" defaultValue={customer.country ?? "Italia"} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Città</label>
            <input name="city" className="form-control" defaultValue={customer.city ?? "Milano"} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Telefono</label>
            <input name="phone" className="form-control" defaultValue={customer.phone ?? ""} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Email</label>
            <input name="email" type="email" className="form-control" defaultValue={customer.email ?? ""} />
          </div>

          <div className="col-12">
            <label className="form-label">Indirizzo</label>
            <input name="address" className="form-control" defaultValue={customer.address ?? ""} />
          </div>
          <div className="col-12">
            <label className="form-label">IBAN</label>
            <input name="iban" className="form-control" defaultValue={customer.iban ?? ""} />
          </div>
          <div className="col-md-12 d-flex align-items-end justify-content-end gap-2">
            <Link href={`/clienti/${customer.id}`} className="btn btn-outline-secondary">Annulla</Link>
            <SubmitButton className="btn btn-dark" pendingLabel="Salvataggio…">Salva modifiche</SubmitButton>
          </div>
        </form>
      </div>
    </>
  );
}
