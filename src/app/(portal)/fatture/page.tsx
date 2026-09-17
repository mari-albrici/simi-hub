import Link from "next/link";
import { deleteInvoiceAction } from "@/lib/crud";
import { getInvoices } from "@/lib/data";

type FattureSearchParams = { type?: string; status?: string };

const STATUS_LABEL: Record<string, string> = {
  open: "aperte",
  overdue: "scadute",
  anomaly: "in anomalia",
  to_check: "da verificare",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<FattureSearchParams>;
}) {
  const params = await searchParams;
  const type = params.type === "purchase" || params.type === "sale" ? params.type : undefined;
  const status = params.status;
  const invoices = await getInvoices({ type, status });
  const hasFilter = Boolean(type || status);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Fatture</h1>
          <p className="text-muted mb-0">Gestione fatture di acquisto e di vendita.</p>
        </div>
        <Link href="/fatture/new" className="btn btn-dark">+ Nuova fattura</Link>
      </div>

      {hasFilter ? (
        <div className="alert alert-light border d-flex justify-content-between align-items-center mb-3">
          <span>
            Filtro attivo: {type === "purchase" ? "Fornitori" : type === "sale" ? "Clienti" : "Tutte"}
            {status ? ` · ${STATUS_LABEL[status] ?? status}` : ""}
          </span>
          <Link href="/fatture" className="btn btn-sm btn-outline-secondary">Rimuovi filtro</Link>
        </div>
      ) : null}

      <div className="content-panel p-3 mb-4">
        <div className="row g-2">
          <div className="col-md-3"><input className="form-control" placeholder="Numero fattura" /></div>
          <div className="col-md-2"><select className="form-select"><option>Fornitore/Cliente</option></select></div>
          <div className="col-md-2"><select className="form-select"><option>Commessa</option></select></div>
          <div className="col-md-2"><select className="form-select"><option>Società</option></select></div>
          <div className="col-md-2"><select className="form-select"><option>Stato</option></select></div>
          <div className="col-md-1"><button className="btn btn-outline-secondary w-100">Filtra</button></div>
        </div>
      </div>

      <div className="app-card p-3">
        <table className="table align-middle mb-0">
          <thead>
            <tr>
              <th>Numero</th>
              <th>Data</th>
              <th>Fornitore / Cliente</th>
              <th>Commessa</th>
              <th>Società</th>
              <th>Totale</th>
              <th>Scadenza</th>
              <th>Stato</th>
              <th className="text-end">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td><Link href={`/fatture/${invoice.id}`} className="text-decoration-none fw-semibold">{invoice.invoice_number}</Link></td>
                <td>{invoice.invoice_date ?? "-"}</td>
                <td>{invoice.customer_name}</td>
                <td>{invoice.project_code}</td>
                <td>{invoice.company_name}</td>
                <td>€ {invoice.amount_total.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>{invoice.due_date ?? "-"}</td>
                <td><span className="badge text-bg-warning">{invoice.status}</span></td>
                <td className="text-end">
                  <div className="d-flex gap-2 justify-content-end">
                    <Link href={`/fatture/${invoice.id}/edit`} className="btn btn-sm btn-outline-secondary">Modifica</Link>
                    <form action={async () => {
                      "use server";
                      await deleteInvoiceAction(invoice.id);
                    }}>
                      <button type="submit" className="btn btn-sm btn-outline-danger">Elimina</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
