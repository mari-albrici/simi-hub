import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/ui/activity-timeline";
import { getInvoiceById } from "@/lib/data";

const timelineItems = [
  {
    time: "16/09/2026 15:42",
    user: "Mario Rossi",
    title: "Fattura 921",
    description: "Stato modificato: DA REGISTRARE → ANOMALIA",
  },
  {
    time: "15/09/2026 13:00",
    user: "Laura Verdi",
    title: "Ricevuta inviata",
    description: "Documento ricevuto dal fornitore in fase di verifica",
  },
];

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
          <li className="breadcrumb-item active" aria-current="page">{invoice.invoice_number}</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <div className="text-uppercase small text-muted mb-1">Fattura</div>
          <h1 className="h3 mb-1">Fattura {invoice.invoice_number}</h1>
          <div className="d-flex flex-wrap gap-3 text-muted small">
            <span>Società: {invoice.company_name}</span>
            <span>Commessa: {invoice.project_code}</span>
            <span>Totale: € {invoice.amount_total.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
        <button className="btn btn-dark">Aggiorna</button>
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="app-card p-3">
            <h2 className="h5 mb-3">Dati fattura</h2>
            <div className="row g-3">
              <div className="col-md-6"><strong>Numero:</strong> {invoice.invoice_number}</div>
              <div className="col-md-6"><strong>Data:</strong> {invoice.invoice_date ?? "-"}</div>
              <div className="col-md-6"><strong>Cliente/Fornitore:</strong> {invoice.customer_name}</div>
              <div className="col-md-6"><strong>Stato:</strong> <span className="badge text-bg-warning">{invoice.status}</span></div>
              <div className="col-md-6"><strong>Scadenza:</strong> {invoice.due_date ?? "-"}</div>
              <div className="col-md-6"><strong>Totale netto:</strong> € {(invoice.amount_total * 0.82).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="col-md-6"><strong>IVA:</strong> € {(invoice.amount_total * 0.18).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="col-md-6"><strong>Totale:</strong> € {invoice.amount_total.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <ActivityTimeline items={timelineItems} />
        </div>
      </div>
    </>
  );
}
