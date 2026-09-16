import Link from "next/link";
import { deleteCompanyAction } from "@/lib/crud";
import { getCompaniesByType } from "@/lib/data";

export default async function CustomersPage() {
  const customers = await getCompaniesByType("customer");

  return (
    <>
      <nav aria-label="breadcrumb" className="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item active" aria-current="page">Clienti</li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Clienti</h1>
          <p className="text-muted mb-0">Anagrafica clienti e relativi contatti.</p>
        </div>
        <Link href="/clienti/new" className="btn btn-dark">+ Nuovo cliente</Link>
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
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link href={`/clienti/${customer.id}`} className="text-decoration-none fw-semibold text-dark">
                      {customer.business_name}
                    </Link>
                  </td>
                  <td>{customer.vat_number ?? "-"}</td>
                  <td>{customer.country ?? "-"}</td>
                  <td>{customer.email ?? "-"}</td>
                  <td>{customer.phone ?? "-"}</td>
                  <td>
                    <span className={`badge ${customer.active ? "text-bg-success" : "text-bg-secondary"}`}>
                      {customer.active ? "Sì" : "No"}
                    </span>
                  </td>
                  <td className="text-end">
                    <div className="d-flex gap-2 justify-content-end">
                      <Link href={`/clienti/${customer.id}/edit`} className="btn btn-sm btn-outline-secondary">Modifica</Link>
                      <form action={async () => {
                        "use server";
                        await deleteCompanyAction(customer.id, "customer");
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
