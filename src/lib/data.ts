import { authorizedClient } from "@/lib/permissions";
import { AppError, checkDatabase } from "@/lib/errors";
import { uuidSchema } from "@/lib/validations";
import type { CompanyType, InvoiceType, InvoiceStatus, ProjectStatus } from "@/types";

/** Fetch every page explicitly; totals must never silently stop at the API row limit. */
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const rows: T[] = []; const size = 500;
  for (let offset = 0; ; offset += size) {
    const result = await page(offset, offset + size - 1); checkDatabase(result.error, "Lettura dati");
    if (!result.data) throw new AppError("database", "Risposta database incompleta.");
    rows.push(...result.data); if (result.data.length < size) return rows;
  }
}
const stringOrNull = (v: unknown) => typeof v === "string" ? v : null;
export type CompanyRecord = {
  id: string; business_name: string; company_type: CompanyType; vat_number: string | null; country: string | null;
  city: string | null; address: string | null; email: string | null; phone: string | null; iban: string | null; active: boolean;
};
function company(row: Record<string, unknown>): CompanyRecord {
  return { id: String(row.id), business_name: String(row.business_name), company_type: row.company_type as CompanyType,
    vat_number: stringOrNull(row.vat_number), country: stringOrNull(row.country), city: stringOrNull(row.city), address: stringOrNull(row.address),
    email: stringOrNull(row.email), phone: stringOrNull(row.phone), iban: stringOrNull(row.iban), active: Boolean(row.active) };
}
export async function getCompaniesByType(type: "customer" | "supplier") {
  const db = await authorizedClient("company.read");
  return (await readAll((a,b) => db.from("companies").select("*").is("archived_at",null).in("company_type",[type,"both"]).order("id").range(a,b))).map(company);
}
export async function getAllCompanies() {
  const db = await authorizedClient("company.read");
  return (await readAll((a,b) => db.from("companies").select("*").is("archived_at",null).order("id").range(a,b))).map(company);
}
export async function getCompanyById(id: string) {
  const db = await authorizedClient("company.read");
  const result = await db.from("companies").select("*").eq("id",uuidSchema.parse(id)).is("archived_at",null).maybeSingle();
  checkDatabase(result.error); return result.data ? company(result.data) : null;
}
export async function getProfileDirectory(): Promise<Array<{ id: string; first_name: string | null; last_name: string | null }>> {
  const db = await authorizedClient("profile.directory"); const result = await db.rpc("profile_directory");
  checkDatabase(result.error); return result.data ?? [];
}
export async function getProjects() {
  const db = await authorizedClient("project.read");
  const [rows, profiles] = await Promise.all([
    readAll((a,b) => db.from("projects").select("*, customer:companies!projects_customer_fk(business_name)").is("archived_at",null).order("id").range(a,b)),
    getProfileDirectory(),
  ]);
  const names = new Map(profiles.map(p => [p.id,[p.first_name,p.last_name].filter(Boolean).join(" ")]));
  return rows.map(row => ({ id: String(row.id), project_code: String(row.project_code), name: String(row.name),
    customer_id: stringOrNull(row.customer_id), project_manager_id: stringOrNull(row.project_manager_id), legal_entity_id: stringOrNull(row.legal_entity_id),
    customer_name: (row.customer as { business_name?: string } | null)?.business_name,
    project_manager_name: names.get(String(row.project_manager_id)), country: stringOrNull(row.country) ?? undefined,
    city: stringOrNull(row.city) ?? undefined, status: row.status as ProjectStatus, opening_date: stringOrNull(row.opening_date) ?? undefined,
    description: stringOrNull(row.description), notes: stringOrNull(row.notes),
  }));
}
export async function getProjectById(id: string) {
  uuidSchema.parse(id); return (await getProjects()).find(p => p.id === id) ?? null;
}
export type InvoiceFilter = { type?: "purchase" | "sale"; status?: string; search?: string; legal_entity_id?: string; company_id?: string; project_id?: string; date_from?: string; date_to?: string; due_from?: string; due_to?: string };
type ProjectLink = { project_id: string; project: { project_code: string } | null };
const invoiceSelect = "*, supplier:companies!invoices_supplier_id_fkey(business_name), customer:companies!invoices_customer_id_fkey(business_name), entity:legal_entities(business_name), invoice_projects(project_id,project:projects(project_code))";
function invoice(row: Record<string, unknown>) {
  const links = (row.invoice_projects ?? []) as ProjectLink[];
  return { id: String(row.id), updated_at: String(row.updated_at), invoice_number: String(row.invoice_number), invoice_type: row.invoice_type as InvoiceType,
    status: row.status as InvoiceStatus, amount_net: Number(row.amount_net), vat_amount: Number(row.vat_amount), amount_total: Number(row.amount_total), currency: String(row.currency ?? "EUR"), received_date: stringOrNull(row.received_date), registration_date: stringOrNull(row.registration_date), vat_treatment: stringOrNull(row.vat_treatment),
    vat_rate: row.vat_rate == null ? null : Number(row.vat_rate), vat_exempt_reason: stringOrNull(row.vat_exempt_reason), payment_method: stringOrNull(row.payment_method),
    invoice_date: stringOrNull(row.invoice_date) ?? undefined, due_date: stringOrNull(row.due_date) ?? undefined, notes: stringOrNull(row.notes) ?? "",
    supplier_id: stringOrNull(row.supplier_id), customer_id: stringOrNull(row.customer_id), legal_entity_id: stringOrNull(row.legal_entity_id),
    customer_name: ((row.customer ?? row.supplier) as { business_name?: string } | null)?.business_name,
    company_name: (row.entity as { business_name?: string } | null)?.business_name,
    project_ids: links.map(l => l.project_id), linked_projects: links.map(l => ({ id: l.project_id, project_code: l.project?.project_code ?? "-" })),
    project_code: links.map(l => l.project?.project_code ?? "-").join(", "), document_id: stringOrNull(row.document_id),
  };
}
export async function getInvoices(filter?: InvoiceFilter) {
  const db = await authorizedClient("invoice.read");
  let projectInvoiceIds: string[] | null = null;
  if (filter?.project_id) {
    const links = await db.from("invoice_projects").select("invoice_id").eq("project_id", uuidSchema.parse(filter.project_id));
    checkDatabase(links.error, "Filtro commessa fatture");
    projectInvoiceIds = (links.data ?? []).map(row => String(row.invoice_id));
  }
  return (await readAll((a,b) => {
    let query = db.from("invoices").select(invoiceSelect).is("archived_at",null).order("id").range(a,b);
    if (filter?.type) query = query.eq("invoice_type",filter.type);
    if (filter?.legal_entity_id) query = query.eq("legal_entity_id", uuidSchema.parse(filter.legal_entity_id));
    if (filter?.company_id) query = filter.type === "sale" ? query.eq("customer_id", uuidSchema.parse(filter.company_id)) : filter.type === "purchase" ? query.eq("supplier_id", uuidSchema.parse(filter.company_id)) : query.or(`supplier_id.eq.${filter.company_id},customer_id.eq.${filter.company_id}`);
    if (projectInvoiceIds) query = query.in("id", projectInvoiceIds);
    if (filter?.search) query = query.ilike("invoice_number", `%${filter.search.replace(/[%_]/g, "\\$&")}%`);
    if (filter?.date_from) query = query.gte("invoice_date", filter.date_from);
    if (filter?.date_to) query = query.lte("invoice_date", filter.date_to);
    if (filter?.due_from) query = query.gte("due_date", filter.due_from);
    if (filter?.due_to) query = query.lte("due_date", filter.due_to);
    if (filter?.status === "open" || filter?.status === "overdue") {
      query = query.not("status","in","(paid,archived)");
      if (filter.status === "overdue") query = query.lt("due_date",new Date().toISOString().slice(0,10));
    } else if (filter?.status) query = query.eq("status",filter.status);
    return query;
  })).map(invoice);
}
export async function getInvoiceById(id: string) {
  const db = await authorizedClient("invoice.read"); uuidSchema.parse(id);
  const result = await db.from("invoices").select(invoiceSelect).eq("id",id).is("archived_at",null).maybeSingle();
  checkDatabase(result.error); if (!result.data) return null;
  const [lines, installments] = await Promise.all([
    readAll((a,b) => db.from("invoice_lines").select("*").eq("invoice_id",id).order("position").order("id").range(a,b)),
    readAll((a,b) => db.from("invoice_installments").select("*").eq("invoice_id",id).order("position").order("id").range(a,b)),
  ]);
  return { ...invoice(result.data), lines: lines.map(l => ({ id: String(l.id), project_id: stringOrNull(l.project_id), unit: stringOrNull(l.unit), discount: Number(l.discount ?? 0), notes: stringOrNull(l.notes), description: String(l.description),
    quantity: Number(l.quantity), unit_price: Number(l.unit_price), vat_rate: l.vat_rate == null ? null : Number(l.vat_rate), vat_exempt_reason: stringOrNull(l.vat_exempt_reason), amount_net: Number(l.amount_net), amount_vat: Number(l.amount_vat), amount_total: Number(l.amount_total) })),
    installments: installments.map(i => ({ id: String(i.id), due_date: String(i.due_date), amount: Number(i.amount), paid: Boolean(i.paid) })),
  };
}
export type LegalEntityRecord = { id: string; code: string; business_name: string; country: string | null; email: string | null; phone: string | null; active: boolean };
export async function getLegalEntities(): Promise<LegalEntityRecord[]> {
  const db = await authorizedClient("legal_entity.read");
  return (await readAll((a,b) => db.from("legal_entities").select("*").order("id").range(a,b))).map(r => ({ id: String(r.id), code: String(r.code), business_name: String(r.business_name), country: stringOrNull(r.country), email: stringOrNull(r.email), phone: stringOrNull(r.phone), active: Boolean(r.active) }));
}
export async function getEmployees() {
  const db = await authorizedClient("employee.read");
  return (await readAll((a,b) => db.from("employees").select("*, entity:legal_entities(business_name)").order("id").range(a,b))).map(r => ({ id: String(r.id),full_name: `${r.first_name} ${r.last_name}`,employee_code: stringOrNull(r.employee_code),role_title: stringOrNull(r.role_title),email: stringOrNull(r.email),legal_entity_name: (r.entity as { business_name: string } | null)?.business_name,status: String(r.status) }));
}
export async function getDeadlinesSummary() {
  const db = await authorizedClient("deadline.read");
  const rows = await readAll((a,b) => db.from("operational_deadlines").select("id,due_date").eq("completed",false).is("archived_at",null).order("id").range(a,b));
  const today = new Date().toISOString().slice(0,10); const later = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  return { overdue: rows.filter(r => r.due_date<today).length,dueToday: rows.filter(r => r.due_date===today).length,dueNext30Days: rows.filter(r => r.due_date>=today && r.due_date<=later).length };
}
export async function getReportSummary() {
  const db = await authorizedClient("report.read");
  const [invoices, projects, documents, deadlines] = await Promise.all([
    getInvoices(),
    db.from("projects").select("id",{count:"exact",head:true}).eq("status","active").is("archived_at",null),
    db.from("documents").select("id",{count:"exact",head:true}).is("archived_at",null),
    db.from("deadlines").select("id",{count:"exact",head:true}).eq("status","open"),
  ]);
  [projects,documents,deadlines].forEach(r => checkDatabase(r.error));
  return { activeProjects: projects.count ?? 0,totalInvoicesAmount: invoices.reduce((sum,i)=>sum+i.amount_total,0),documentsCount: documents.count ?? 0,openDeadlines: deadlines.count ?? 0 };
}
