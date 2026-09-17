import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/data";
import { updateCompanyAction } from "@/lib/crud";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await getCompanyById(id);

  if (!supplier || supplier.company_type !== "supplier") {
    notFound();
  }

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href="/fornitori">Fornitori</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Modifica</li>
        </ol>
      </nav>

      <div className="app-card p-4 mx-auto" style={{ maxWidth: 900 }}>
        <h1 className="h3 mb-3">Modifica fornitore</h1>

        <form action={updateCompanyAction} className="row g-3">
          <input type="hidden" name="id" value={supplier.id} />
          <input type="hidden" name="company_type" value="supplier" />
          <div className="col-md-6">
            <label className="form-label">Ragione sociale</label>
            <input name="business_name" className="form-control" defaultValue={supplier.business_name} required />
          </div>
          <div className="col-md-6">
            <label className="form-label">P. IVA</label>
            <input name="vat_number" className="form-control" defaultValue={supplier.vat_number ?? ""} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Paese</label>
            <input name="country" className="form-control" defaultValue={supplier.country ?? "Italia"} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Città</label>
            <input name="city" className="form-control" defaultValue={supplier.city ?? "Roma"} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Telefono</label>
            <input name="phone" className="form-control" defaultValue={supplier.phone ?? ""} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Email</label>
            <input name="email" type="email" className="form-control" defaultValue={supplier.email ?? ""} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Contatto</label>
            <input name="contact_name" className="form-control" defaultValue={supplier.contact_name ?? ""} />
          </div>
          <div className="col-12">
            <label className="form-label">Indirizzo</label>
            <input name="address" className="form-control" defaultValue={supplier.address ?? ""} />
          </div>
          <div className="col-md-12 d-flex align-items-end justify-content-end gap-2">
            <Link href={`/fornitori/${supplier.id}`} className="btn btn-outline-secondary">Annulla</Link>
            <SubmitButton className="btn btn-dark" pendingLabel="Salvataggio…">Salva modifiche</SubmitButton>
          </div>
        </form>
      </div>
    </>
  );
}
