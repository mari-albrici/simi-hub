import type { CompanyRecord } from "./data";
export function filterCompanies(rows: CompanyRecord[], p: Record<string, string | undefined>) {
  const q = p.q?.trim().toLocaleLowerCase("it") || "";
  return rows.filter(c => (!q || [c.business_name, c.vat_number, c.esolver_code].some(v => v?.toLocaleLowerCase("it").includes(q))) && (!p.status || (p.status === "active" ? c.active : !c.active)) && (!p.country || c.country === p.country) && (!p.city || c.city?.toLocaleLowerCase("it").includes(p.city.toLocaleLowerCase("it"))));
}
