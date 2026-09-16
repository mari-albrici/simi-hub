import Link from "next/link";
import { deleteCompanyAction } from "@/lib/crud";
import { getCompaniesByType } from "@/lib/data";

export default async function SuppliersPage() {
  const suppliers = await getCompaniesByType("supplier");

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item active" aria-current="page">Fornitori</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Fornitori</h1>
          <p className="text-muted mb-0">Gestione principali fornitori e contatti.</p>
        </div>
        <Link href="/fornitori/new" className="btn btn-dark">+ Nuovo fornitore</Link>
      </div>

      <div className="app-card p-3">
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead>
              <tr>
                <th>Ragione sociale</th>
                <th>P. IVA</th>
                <th>Paese</th>
                <th>Email</th>
                <th>Telefono</th>
                <th>Attivo</th>
                <th className="text-end">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>
                    <Link href={`/fornitori/${supplier.id}`} className="text-decoration-none fw-semibold text-dark">
                      {supplier.business_name}
                    </Link>
                  </td>
                  <td>{supplier.vat_number ?? "-"}</td>
                  <td>{supplier.country ?? "-"}</td>
                  <td>{supplier.email ?? "-"}</td>
                  <td>{supplier.phone ?? "-"}</td>
                  <td>
                    <span className={`badge ${supplier.active ? "text-bg-success" : "text-bg-secondary"}`}>
                      {supplier.active ? "Sì" : "No"}
                    </span>
                  </td>
                  <td className="text-end">
                    <div className="d-flex gap-2 justify-content-end">
                      <Link href={`/fornitori/${supplier.id}/edit`} className="btn btn-sm btn-outline-secondary">Modifica</Link>
                      <form action={async () => {
                        "use server";
                        await deleteCompanyAction(supplier.id, "supplier");
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
      </div>
    </>
  );
}
