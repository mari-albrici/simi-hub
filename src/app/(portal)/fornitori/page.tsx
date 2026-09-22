import { CompanyFilters } from "@/components/ui/company-filters";
import { filterCompanies } from "@/lib/company-filters";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAccessScope, requirePagePermission } from "@/lib/permissions";
import Link from "@/components/ui/app-link";
import { deleteCompanyAction } from "@/lib/crud";
import { getCompaniesByType, getAllCompanyContacts } from "@/lib/data";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

export default async function SuppliersPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  await requirePagePermission("company.read");
  const access = await getAccessScope("company");
  const [allCompanies, contacts] = await Promise.all([getCompaniesByType("supplier"), getAllCompanyContacts()]);

  const p = await searchParams;
  const suppliers = filterCompanies(allCompanies, p);
  return (
    <>
     <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Fornitori</h1>
          <p className="text-muted mb-0">Gestione principali fornitori e contatti.</p>
        </div>
        {access.canCreate && <Link href="/fornitori/new" className="btn btn-dark">+ Nuovo fornitore</Link>}
      </div>

      <CompanyFilters params={p} countries={[...new Set(allCompanies.map(c=>c.country).filter((c):c is string=>!!c))]} />
      <div className="app-card">
        <div className="table-responsive">
          <table className="table table-admin align-middle mb-0">
            <thead>
              <tr>
                <th>Nome</th><th>Paese</th><th>P.IVA / identificativo</th><th>Referente</th><th>Stato</th><th className="col-actions"><span className="visually-hidden">Azioni</span></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 && <tr><td colSpan={6} className="text-muted py-4">Nessun record presente.</td></tr>}
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td className="col-description" title={supplier.business_name}>
  <div className="d-flex align-items-center gap-2">
    {supplier.esolver_code && (
      <>
        <span className="badge text-bg-secondary flex-shrink-0">
          {supplier.esolver_code}
        </span>
        <span className="text-muted">-</span>
      </>
    )}

    <Link
      href={`/fornitori/${supplier.id}`}
      className="text-decoration-none fw-semibold text-dark text-truncate"
    >
      {supplier.business_name}
    </Link>
  </div>
</td>
                  <td className="text-nowrap">{supplier.country ?? "—"}</td>
                  <td className="col-description">{supplier.vat_number ?? "—"}</td>
                  <td className="col-description">{contacts.filter(c=>c.company_id===supplier.id).map(c=>c.label).join(", ") || "—"}</td>
                  <td className="col-status"><StatusBadge status={supplier.active ? "active" : "inactive"}/></td>
                  <td className="col-actions">
                    <RowActionsMenu label={`Azioni per ${supplier.business_name}`}>
                      <Link href={`/fornitori/${supplier.id}`} className="dropdown-item">Visualizza</Link>
                      {access.canUpdate && <Link href={`/fornitori/${supplier.id}/edit`} className="dropdown-item">Modifica</Link>}
                      {access.canDelete && <form action={async () => {
                        "use server";
                        await deleteCompanyAction(supplier.id, "supplier");
                      }}>
                        <ConfirmSubmitButton confirmMessage={`Archiviare il fornitore "${supplier.business_name}"?`} pendingLabel="Archiviazione…">
                          Archivia
                        </ConfirmSubmitButton>
                      </form>}
                    </RowActionsMenu>
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
