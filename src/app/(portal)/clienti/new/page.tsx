import Link from "next/link";
import { createCompanyAction } from "@/lib/crud";
import { SubmitButton } from "@/components/ui/submit-button";

export default function NewCustomerPage() {
  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href="/clienti">Clienti</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Nuovo</li>
        </ol>
      </nav>

      <div className="app-card p-4 mx-auto" style={{ maxWidth: 900 }}>
        <h1 className="h3 mb-3">Nuovo cliente</h1>

        <form action={createCompanyAction} className="row g-3">
          <input type="hidden" name="company_type" value="customer" />
          <div className="col-md-6">
            <label className="form-label">Ragione sociale</label>
            <input name="business_name" className="form-control" required />
          </div>
          <div className="col-md-6">
            <label className="form-label">P. IVA</label>
            <input name="vat_number" className="form-control" />
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
            <label className="form-label">Telefono</label>
            <input name="phone" className="form-control" />
          </div>
          <div className="col-md-6">
            <label className="form-label">Email</label>
            <input name="email" type="email" className="form-control" />
          </div>
          <div className="col-md-6">
            <label className="form-label">Contatto</label>
            <input name="contact_name" className="form-control" />
          </div>
          <div className="col-12">
            <label className="form-label">Indirizzo</label>
            <input name="address" className="form-control" />
          </div>
          <div className="col-md-12 d-flex align-items-end justify-content-end gap-2">
            <Link href="/clienti" className="btn btn-outline-secondary">Annulla</Link>
            <SubmitButton className="btn btn-dark">Salva</SubmitButton>
          </div>
        </form>
      </div>
    </>
  );
}
