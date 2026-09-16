import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvoiceById } from "@/lib/data";
import { updateInvoiceAction } from "@/lib/crud";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoiceById(id);

  if (!invoice) {
    notFound();
  }

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href="/fatture">Fatture</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Modifica</li>
        </ol>
      </nav>

      <div className="app-card p-4 mx-auto" style={{ maxWidth: 900 }}>
        <h1 className="h3 mb-3">Modifica fattura</h1>

        <form action={updateInvoiceAction} className="row g-3">
          <input type="hidden" name="id" value={invoice.id} />
          <div className="col-md-4">
            <label className="form-label">Numero</label>
            <input name="invoice_number" className="form-control" defaultValue={invoice.invoice_number} required />
          </div>
          <div className="col-md-4">
            <label className="form-label">Tipo</label>
            <select name="invoice_type" className="form-select" defaultValue={invoice.invoice_type ?? "purchase"}>
              <option value="purchase">Acquisto</option>
              <option value="sale">Vendita</option>
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Stato</label>
            <select name="status" className="form-select" defaultValue={invoice.status ?? "to_register"}>
              <option value="to_register">Da registrare</option>
              <option value="to_pay">Da pagare</option>
              <option value="paid">Pagata</option>
              <option value="anomaly">Anomalia</option>
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Cliente / Fornitore</label>
            <input name="customer_name" className="form-control" defaultValue={invoice.customer_name} />
          </div>
          <div className="col-md-6">
            <label className="form-label">Società</label>
            <input name="company_name" className="form-control" defaultValue={invoice.company_name} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Commessa</label>
            <input name="project_code" className="form-control" defaultValue={invoice.project_code} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Data fattura</label>
            <input name="invoice_date" type="date" className="form-control" defaultValue={invoice.invoice_date ?? ""} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Scadenza</label>
            <input name="due_date" type="date" className="form-control" defaultValue={invoice.due_date ?? ""} />
          </div>
          <div className="col-md-4">
            <label className="form-label">Totale</label>
            <input name="amount_total" type="number" min={0} step="0.01" className="form-control" defaultValue={invoice.amount_total} />
          </div>
          <div className="col-md-8 d-flex align-items-end justify-content-end gap-2">
            <Link href={`/fatture/${invoice.id}`} className="btn btn-outline-secondary">Annulla</Link>
            <button type="submit" className="btn btn-dark">Salva modifiche</button>
          </div>
        </form>
      </div>
    </>
  );
}
