import { createServerSupabaseClient } from "@/lib/supabase/server";
import { customers, projects, suppliers } from "@/lib/mock-data";

export type CompanyRecord = {
  id: string;
  business_name: string;
  company_type: "customer" | "supplier" | "both";
  vat_number?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  active?: boolean | null;
  contact_name?: string | null;
};

const toCompanyRecord = (item: Record<string, unknown>): CompanyRecord => ({
  id: String(item.id ?? crypto.randomUUID()),
  business_name: String(item.business_name ?? "Nessuna ragione sociale"),
  company_type: (item.company_type as CompanyRecord["company_type"]) ?? "customer",
  vat_number: typeof item.vat_number === "string" ? item.vat_number : null,
  country: typeof item.country === "string" ? item.country : null,
  city: typeof item.city === "string" ? item.city : null,
  address: typeof item.address === "string" ? item.address : null,
  email: typeof item.email === "string" ? item.email : null,
  phone: typeof item.phone === "string" ? item.phone : null,
  active: typeof item.active === "boolean" ? item.active : true,
  contact_name: typeof item.contact_name === "string" ? item.contact_name : null,
});

// Resolves foreign-key ids to a display name in a single batched lookup.
async function fetchNameMap(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  table: string,
  ids: Array<string | null | undefined>,
  nameColumn: string,
) {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (uniqueIds.length === 0) return new Map<string, string>();

  const client = supabase as unknown as { from: (table: string) => { select: (columns: string) => { in: (col: string, values: string[]) => Promise<{ data: Array<Record<string, unknown>> | null }> } } };
  const { data } = await client.from(table).select("*").in("id", uniqueIds);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.id), String(row[nameColumn] ?? ""));
  }
  return map;
}

export async function getCompaniesByType(type: "customer" | "supplier") {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("company_type", type)
      .order("business_name");

    if (!error && data) {
      return data.map(toCompanyRecord);
    }
  }

  if (type === "customer") {
    return customers.map((item) => ({ ...item, company_type: "customer" as const }));
  }

  return suppliers.map((item) => ({ ...item, company_type: "supplier" as const }));
}

export async function getCompanyById(id: string) {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
    if (!error && data) {
      return toCompanyRecord(data);
    }
  }

  const customer = customers.find((item) => item.id === id);
  if (customer) return { ...customer, company_type: "customer" as const };

  const supplier = suppliers.find((item) => item.id === id);
  if (supplier) return { ...supplier, company_type: "supplier" as const };

  return null;
}

export async function getProjects() {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("opening_date", { ascending: false });

    if (!error && data) {
      const customerMap = await fetchNameMap(
        supabase,
        "companies",
        data.map((item) => item.customer_id),
        "business_name",
      );
      const managerMap = await fetchNameMap(
        supabase,
        "profiles",
        data.map((item) => item.project_manager_id),
        "first_name",
      );

      return data.map((item) => ({
        id: String(item.id),
        project_code: String(item.project_code ?? "-"),
        name: String(item.name ?? "-"),
        customer_name: item.customer_id ? customerMap.get(String(item.customer_id)) : undefined,
        country: item.country ? String(item.country) : undefined,
        city: item.city ? String(item.city) : undefined,
        status: (String(item.status ?? "draft") as any),
        opening_date: item.opening_date ? String(item.opening_date) : undefined,
        project_manager_name: item.project_manager_id ? managerMap.get(String(item.project_manager_id)) : undefined,
      }));
    }
  }

  return projects;
}

export async function getProjectById(id: string) {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
    if (!error && data) {
      const customerMap = await fetchNameMap(supabase, "companies", [data.customer_id], "business_name");
      const managerMap = await fetchNameMap(supabase, "profiles", [data.project_manager_id], "first_name");

      return {
        id: String(data.id),
        project_code: String(data.project_code ?? "-"),
        name: String(data.name ?? "-"),
        customer_name: data.customer_id ? customerMap.get(String(data.customer_id)) : undefined,
        country: data.country ? String(data.country) : undefined,
        city: data.city ? String(data.city) : undefined,
        status: (String(data.status ?? "draft") as any),
        opening_date: data.opening_date ? String(data.opening_date) : undefined,
        project_manager_name: data.project_manager_id ? managerMap.get(String(data.project_manager_id)) : undefined,
      };
    }
  }

  return projects.find((project) => project.id === id) ?? null;
}

export type InvoiceFilter = {
  type?: "purchase" | "sale";
  // "open" = non pagata/archiviata, "overdue" = aperta e scaduta, altrimenti valore esatto di InvoiceStatus.
  status?: "open" | "overdue" | string;
};

const OPEN_INVOICE_STATUSES = ["received", "to_check", "to_register", "registered", "to_pay", "scheduled", "anomaly"];

export async function getInvoices(filter?: InvoiceFilter) {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    let query = supabase.from("invoices").select("*").order("invoice_date", { ascending: false });

    if (filter?.type) {
      query = query.eq("invoice_type", filter.type);
    }

    if (filter?.status === "open" || filter?.status === "overdue") {
      query = query.in("status", OPEN_INVOICE_STATUSES);
      if (filter.status === "overdue") {
        query = query.lt("due_date", new Date().toISOString().slice(0, 10));
      }
    } else if (filter?.status) {
      query = query.eq("status", filter.status);
    }

    const { data, error } = await query;
    if (!error && data) {
      const companyIds = data.flatMap((item) => [item.customer_id, item.supplier_id]);
      const [companyMap, projectMap, legalEntityMap] = await Promise.all([
        fetchNameMap(supabase, "companies", companyIds, "business_name"),
        fetchNameMap(supabase, "projects", data.map((item) => item.project_id), "project_code"),
        fetchNameMap(supabase, "legal_entities", data.map((item) => item.legal_entity_id), "business_name"),
      ]);

      return data.map((item) => ({
        id: String(item.id),
        invoice_number: String(item.invoice_number ?? "-"),
        invoice_type: (String(item.invoice_type ?? "purchase") as any),
        status: (String(item.status ?? "to_register") as any),
        amount_total: Number(item.amount_total ?? 0),
        invoice_date: item.invoice_date ? String(item.invoice_date) : undefined,
        due_date: item.due_date ? String(item.due_date) : undefined,
        customer_name:
          (item.customer_id && companyMap.get(String(item.customer_id))) ||
          (item.supplier_id && companyMap.get(String(item.supplier_id))) ||
          undefined,
        project_code: item.project_id ? projectMap.get(String(item.project_id)) : undefined,
        company_name: item.legal_entity_id ? legalEntityMap.get(String(item.legal_entity_id)) : undefined,
      }));
    }
  }

  return [];
}

export async function getInvoiceById(id: string) {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
    if (!error && data) {
      const [companyMap, projectMap, legalEntityMap] = await Promise.all([
        fetchNameMap(supabase, "companies", [data.customer_id, data.supplier_id], "business_name"),
        fetchNameMap(supabase, "projects", [data.project_id], "project_code"),
        fetchNameMap(supabase, "legal_entities", [data.legal_entity_id], "business_name"),
      ]);

      return {
        id: String(data.id),
        invoice_number: String(data.invoice_number ?? "-"),
        invoice_type: (String(data.invoice_type ?? "purchase") as any),
        status: (String(data.status ?? "to_register") as any),
        amount_total: Number(data.amount_total ?? 0),
        invoice_date: data.invoice_date ? String(data.invoice_date) : undefined,
        due_date: data.due_date ? String(data.due_date) : undefined,
        customer_name:
          (data.customer_id && companyMap.get(String(data.customer_id))) ||
          (data.supplier_id && companyMap.get(String(data.supplier_id))) ||
          undefined,
        project_code: data.project_id ? projectMap.get(String(data.project_id)) : undefined,
        company_name: data.legal_entity_id ? legalEntityMap.get(String(data.legal_entity_id)) : undefined,
      };
    }
  }

  return (await getInvoices()).find((invoice) => invoice.id === id) ?? null;
}

export type LegalEntityRecord = {
  id: string;
  code: string;
  business_name: string;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  active: boolean;
};

export async function getLegalEntities(): Promise<LegalEntityRecord[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase.from("legal_entities").select("*").order("business_name");
  if (error || !data) return [];

  return data.map((item) => ({
    id: String(item.id),
    code: String(item.code ?? "-"),
    business_name: String(item.business_name ?? "-"),
    country: item.country ? String(item.country) : null,
    email: item.email ? String(item.email) : null,
    phone: item.phone ? String(item.phone) : null,
    active: Boolean(item.active),
  }));
}

export type DocumentRecord = {
  id: string;
  original_filename: string;
  title: string | null;
  file_size: number | null;
  mime_type: string | null;
  status: string;
  created_at: string;
  expiry_date: string | null;
  downloadUrl: string | null;
};

const DOCUMENT_SIGNED_URL_TTL_SECONDS = 3600;

export async function getDocuments(): Promise<DocumentRecord[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
  if (error || !data) return [];

  return Promise.all(
    data.map(async (item) => {
      const storagePath = item.storage_path ? String(item.storage_path) : null;
      let downloadUrl: string | null = null;

      if (storagePath) {
        const { data: signed } = await supabase.storage
          .from("simi-documents")
          .createSignedUrl(storagePath, DOCUMENT_SIGNED_URL_TTL_SECONDS);
        downloadUrl = signed?.signedUrl ?? null;
      }

      return {
        id: String(item.id),
        original_filename: String(item.original_filename ?? "-"),
        title: item.title ? String(item.title) : null,
        file_size: item.file_size != null ? Number(item.file_size) : null,
        mime_type: item.mime_type ? String(item.mime_type) : null,
        status: String(item.status ?? "draft"),
        created_at: String(item.created_at ?? ""),
        expiry_date: item.expiry_date ? String(item.expiry_date) : null,
        downloadUrl,
      };
    }),
  );
}

export type EmployeeRecord = {
  id: string;
  full_name: string;
  employee_code?: string | null;
  role_title?: string | null;
  email?: string | null;
  legal_entity_name?: string | null;
  status: string;
};

export async function getEmployees(): Promise<EmployeeRecord[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase.from("employees").select("*").order("last_name");
  if (error || !data) return [];

  const legalEntityMap = await fetchNameMap(supabase, "legal_entities", data.map((item) => item.legal_entity_id), "business_name");

  return data.map((item) => ({
    id: String(item.id),
    full_name: `${item.first_name ?? ""} ${item.last_name ?? ""}`.trim() || "-",
    employee_code: item.employee_code ? String(item.employee_code) : null,
    role_title: item.role_title ? String(item.role_title) : null,
    email: item.email ? String(item.email) : null,
    legal_entity_name: item.legal_entity_id ? legalEntityMap.get(String(item.legal_entity_id)) : undefined,
    status: String(item.status ?? "active"),
  }));
}

export async function getDeadlinesSummary() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { overdue: 0, dueToday: 0, dueNext30Days: 0 };

  const { data, error } = await supabase.from("deadlines").select("due_date, status").eq("status", "open");
  if (error || !data) return { overdue: 0, dueToday: 0, dueNext30Days: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    overdue: data.filter((item) => item.due_date && item.due_date < today).length,
    dueToday: data.filter((item) => item.due_date === today).length,
    dueNext30Days: data.filter((item) => item.due_date && item.due_date >= today && item.due_date <= in30Days).length,
  };
}

export async function getReportSummary() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { activeProjects: 0, totalInvoicesAmount: 0, documentsCount: 0, openDeadlines: 0 };
  }

  const [{ data: projectData }, { data: invoiceData }, { count: documentsCount }, { count: openDeadlines }] = await Promise.all([
    supabase.from("projects").select("id, status"),
    supabase.from("invoices").select("amount_total"),
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase.from("deadlines").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  return {
    activeProjects: (projectData ?? []).filter((item) => item.status === "active").length,
    totalInvoicesAmount: (invoiceData ?? []).reduce((sum, item) => sum + Number(item.amount_total ?? 0), 0),
    documentsCount: documentsCount ?? 0,
    openDeadlines: openDeadlines ?? 0,
  };
}

