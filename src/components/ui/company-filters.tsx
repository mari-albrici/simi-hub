import { FilterForm } from "./filter-form";
import { FilterToolbar } from "./filter-toolbar";
export function CompanyFilters({ params: p, countries }: { params: Record<string, string | undefined>; countries: string[] }) {
  return <FilterForm><FilterToolbar activeCount={p.city ? 1 : 0} advanced={<div className="col-md-4"><label htmlFor="city" className="form-label">Città</label><input id="city" name="city" className="form-control" defaultValue={p.city} /></div>}>
    <div><label htmlFor="q" className="form-label">Ricerca</label><input id="q" name="q" className="form-control" placeholder="Nome, P.IVA, codice eSolver" defaultValue={p.q}/></div>
    <div><label htmlFor="status" className="form-label">Stato</label><select id="status" name="status" className="form-select" defaultValue={p.status || ""}><option value="">Tutti</option><option value="active">Attivi</option><option value="inactive">Inattivi</option></select></div>
    <div><label htmlFor="country" className="form-label">Paese</label><select id="country" name="country" className="form-select" defaultValue={p.country || ""}><option value="">Tutti</option>{countries.sort().map(c=><option key={c}>{c}</option>)}</select></div>
  </FilterToolbar></FilterForm>;
}
