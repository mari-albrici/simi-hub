import Link from "next/link";
import { NewInvoiceForm } from "./new-invoice-form";

export default function NewInvoicePage() {
  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href="/fatture">Fatture</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Nuova</li>
        </ol>
      </nav>

      <NewInvoiceForm />
    </>
  );
}
