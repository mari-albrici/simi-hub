import { requirePagePermission } from "@/lib/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getInvoiceById, getAllCompanies, getLegalEntities, getProjects } from "@/lib/data";
import { InvoiceForm } from "../../invoice-form";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("invoice.update");
  const { id } = await params;
  const [invoice, companies, legalEntities, projects] = await Promise.all([
    getInvoiceById(id),
    getAllCompanies(),
    getLegalEntities(),
    getProjects(),
  ]);

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

      <InvoiceForm mode="edit" invoice={invoice} companies={companies} legalEntities={legalEntities} projects={projects} />
    </>
  );
}
