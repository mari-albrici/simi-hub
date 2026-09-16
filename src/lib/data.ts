import { createServerSupabaseClient } from "@/lib/supabase/server";
import { customers, projects, recentActivity, suppliers, upcomingDeadlines } from "@/lib/mock-data";

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
      return data.map((item) => ({
        id: String(item.id),
        project_code: String(item.project_code ?? "-"),
        name: String(item.name ?? "-"),
        customer_name: item.customer_id ? "Cliente SIMI" : "Cliente attivo",
        country: String(item.country ?? "Italia"),
        city: String(item.city ?? "Milano"),
        status: (String(item.status ?? "draft") as any),
        opening_date: item.opening_date ? String(item.opening_date) : undefined,
        project_manager_name: item.project_manager_id ? "Team SIMI" : "Marco Bianchi",
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
      return {
        id: String(data.id),
        project_code: String(data.project_code ?? "-"),
        name: String(data.name ?? "-"),
        customer_name: data.customer_id ? "Cliente SIMI" : "Cliente attivo",
        country: String(data.country ?? "Italia"),
        city: String(data.city ?? "Milano"),
        status: (String(data.status ?? "draft") as any),
        opening_date: data.opening_date ? String(data.opening_date) : undefined,
        project_manager_name: data.project_manager_id ? "Team SIMI" : "Marco Bianchi",
      };
    }
  }

  return projects.find((project) => project.id === id) ?? null;
}

export async function getInvoices() {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase.from("invoices").select("*").order("invoice_date", { ascending: false });
    if (!error && data) {
      return data.map((item) => ({
        id: String(item.id),
        invoice_number: String(item.invoice_number ?? "-"),
        invoice_type: (String(item.invoice_type ?? "purchase") as any),
        status: (String(item.status ?? "to_register") as any),
        amount_total: Number(item.amount_total ?? 0),
        invoice_date: item.invoice_date ? String(item.invoice_date) : undefined,
        due_date: item.due_date ? String(item.due_date) : undefined,
        customer_name: "Cliente SIMI",
        project_code: "C1071",
        company_name: "SIMI Italia",
      }));
    }
  }

  return [
    {
      id: "inv-001",
      invoice_number: "921",
      invoice_type: "purchase",
      status: "to_register",
      amount_total: 2450,
      invoice_date: "2026-09-16",
      due_date: "2026-09-25",
      customer_name: "Fornitore Demo S.r.l.",
      project_code: "C1071",
      company_name: "SIMI Italia",
    },
    {
      id: "inv-002",
      invoice_number: "2202",
      invoice_type: "sale",
      status: "to_pay",
      amount_total: 8200,
      invoice_date: "2026-09-15",
      due_date: "2026-09-30",
      customer_name: "Cliente Demo Milano",
      project_code: "C1071",
      company_name: "SIMI Italia",
    },
  ];
}

export async function getInvoiceById(id: string) {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
    if (!error && data) {
      return {
        id: String(data.id),
        invoice_number: String(data.invoice_number ?? "-"),
        invoice_type: (String(data.invoice_type ?? "purchase") as any),
        status: (String(data.status ?? "to_register") as any),
        amount_total: Number(data.amount_total ?? 0),
        invoice_date: data.invoice_date ? String(data.invoice_date) : undefined,
        due_date: data.due_date ? String(data.due_date) : undefined,
        customer_name: "Cliente SIMI",
        project_code: "C1071",
        company_name: "SIMI Italia",
      };
    }
  }

  return (await getInvoices()).find((invoice) => invoice.id === id) ?? null;
}

export async function getDashboardViewModel() {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const [{ data: projectData }, { data: companyData }, { data: invoiceData }, { data: documentData }] = await Promise.all([
      supabase.from("projects").select("id, project_code, name, status"),
      supabase.from("companies").select("id, company_type"),
      supabase.from("invoices").select("id, status"),
      supabase.from("documents").select("id, status"),
    ]);

    const activeProjects = (projectData ?? []).filter((item) => item.status === "active").length;
    const customerCount = (companyData ?? []).filter((item) => item.company_type === "customer").length;
    const supplierCount = (companyData ?? []).filter((item) => item.company_type === "supplier").length;
    const invoiceAnomaly = (invoiceData ?? []).filter((item) => item.status === "anomaly").length;
    const toValidate = (documentData ?? []).filter((item) => item.status === "draft").length;

    return {
      cards: [
        { value: activeProjects, label: "Commesse attive", tone: "primary" },
        { value: customerCount, label: "Clienti attivi", tone: "success" },
        { value: supplierCount, label: "Fornitori attivi", tone: "secondary" },
        { value: invoiceAnomaly + toValidate, label: "Da verificare", tone: "warning" },
      ],
      recentActivity: (recentActivity ?? []).slice(0, 4),
      upcomingDeadlines: (upcomingDeadlines ?? []).slice(0, 3),
      projects: ((projectData ?? []) as Array<{ id: string; project_code: string; name: string; status: string }>).slice(0, 5).map((item) => ({
        id: item.id,
        project_code: item.project_code,
        name: item.name,
        status: item.status,
        customer_name: "Cliente attivo",
        country: "Italia",
        city: "Milano",
        opening_date: new Date().toISOString().slice(0, 10),
        project_manager_name: "Team SIMI",
      })),
    };
  }

  return {
    cards: [
      { value: 12, label: "Fatture da registrare", tone: "warning" },
      { value: 7, label: "Fatture da pagare", tone: "primary" },
      { value: 3, label: "Anomalie", tone: "danger" },
      { value: 8, label: "Scadenze < 30 giorni", tone: "secondary" },
    ],
    recentActivity,
    upcomingDeadlines,
    projects,
  };
}
