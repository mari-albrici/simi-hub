import Link from "@/components/ui/app-link";
import { Suspense } from "react";
import { SectionLoading } from "@/components/ui/loading";
import { ManagementReconciliationSummary } from "@/components/commercial/management-summaries";
import { getCostEntries, getManagementCostCenters } from "@/lib/cost-entries";
import { getManagementCostCategories } from "@/lib/management-allocations";
import { getAllCompanies, getLegalEntities } from "@/lib/data";
import { hasPermission } from "@/lib/auth";
import { requirePagePermission } from "@/lib/permissions";
import { uuidSchema } from "@/lib/validations";
import { CostEntriesTable } from "./cost-entries-table";
import { getManagementCostPools } from "@/lib/management-cost-pools";

export default async function CostEntriesPage({ searchParams }: {
  searchParams: Promise<{ cost_center_id?: string; page?: string }>;
}) {
  const user = await requirePagePermission("management.read");
  const canUpdate = hasPermission(user.role, "management.update");
  const params = await searchParams;
  const center = params.cost_center_id ? uuidSchema.safeParse(params.cost_center_id) : null;
  if (center && !center.success) return <div className="alert alert-danger">Filtro centro di costo non valido. <Link href="/costi-gestionali">Reimposta</Link></div>;
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const [result, centers, categories, companies, entities, pools] = await Promise.all([
    getCostEntries({ cost_center_id: center?.data, offset: (page - 1) * 50, limit: 50 }),
    getManagementCostCenters(),
    canUpdate ? getManagementCostCategories() : Promise.resolve([]),
    canUpdate ? getAllCompanies() : Promise.resolve([]),
    canUpdate ? getLegalEntities() : Promise.resolve([]),
    canUpdate ? getManagementCostPools() : Promise.resolve([]),
  ]);
  const pageUrl = (number: number) => {
    const query = new URLSearchParams({ page: String(number) });
    if (center?.data) query.set("cost_center_id", center.data);
    return `/costi-gestionali?${query}`;
  };
  return <>
    <h1 className="h3 mb-4">Costi gestionali</h1>
    <Suspense fallback={<SectionLoading label="Caricamento riconciliazione…" />}>
      <ManagementReconciliationSummary />
    </Suspense>
    <form className="app-card p-3 mb-3 d-flex align-items-end gap-2 flex-wrap" method="get">
      <div>
        <label className="form-label" htmlFor="cost-center-filter">Centro di costo</label>
        <select id="cost-center-filter" name="cost_center_id" className="form-select" defaultValue={center?.data ?? ""}>
          <option value="">Tutti</option>
          {centers.map(item => <option key={item.id} value={item.id}>{item.name}{item.is_active ? "" : " (disattivato)"}</option>)}
        </select>
      </div>
      <button className="btn btn-outline-dark" type="submit">Filtra</button>
      <Link className="btn btn-link" href="/costi-gestionali">Reimposta</Link>
    </form>
    <CostEntriesTable entries={result.rows} canUpdate={canUpdate} centers={centers} categories={categories} pools={pools}
      suppliers={companies.filter(company => company.company_type !== "customer").map(company => ({ id: company.id, name: company.business_name }))}
      entities={entities.map(entity => ({ id: entity.id, name: entity.business_name }))} />
    <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
      <span className="small text-muted">{result.count} costi · Pagina {page}</span>
      <nav className="d-flex gap-2" aria-label="Paginazione costi gestionali">
        {page > 1 && <Link className="btn btn-sm btn-outline-secondary" href={pageUrl(page - 1)}>Precedente</Link>}
        {page * 50 < result.count && <Link className="btn btn-sm btn-outline-secondary" href={pageUrl(page + 1)}>Successiva</Link>}
      </nav>
    </div>
  </>;
}
