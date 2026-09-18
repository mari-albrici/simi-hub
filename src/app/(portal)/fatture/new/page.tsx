import { requirePagePermission } from "@/lib/permissions";
import Link from "next/link";
import { getAllCompanies, getLegalEntities, getProjects } from "@/lib/data";
import { InvoiceForm } from "../invoice-form";

// L'estrazione PDF può ricorrere a OCR (più lenta di una semplice lettura testo);
// margine esplicito oltre al timeout interno di invoice-pdf-parser.ts (45s).
export const maxDuration = 60;

export default async function NewInvoicePage() {
  await requirePagePermission("invoice.create");
  const [companies, legalEntities, projects] = await Promise.all([
    getAllCompanies(),
    getLegalEntities(),
    getProjects(),
  ]);

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item"><Link href="/fatture">Fatture</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Nuova</li>
        </ol>
      </nav>

      <InvoiceForm mode="create" companies={companies} legalEntities={legalEntities} projects={projects} />
    </>
  );
}
