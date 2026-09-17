"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { customers, invoices, projects, suppliers } from "@/lib/mock-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function toNullableDate(value: string | null | undefined): string | null {
  if (!value || value === "") return null;
  return value;
}

function withSuccess(path: string, message: string): string {
  return `${path}?success=${encodeURIComponent(message)}`;
}

async function createProjectInSupabase(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;

  const payload = {
    project_code: String(formData.get("project_code") ?? "PRJ-NEW"),
    name: String(formData.get("name") ?? "Nuova commessa"),
    description: String(formData.get("description") ?? ""),
    country: String(formData.get("country") ?? "Italia"),
    city: String(formData.get("city") ?? "Milano"),
    address: String(formData.get("address") ?? ""),
    customer_id: null,
    status: (String(formData.get("status") ?? "draft") as "draft" | "active" | "suspended" | "completed" | "archived"),
    opening_date: toNullableDate(String(formData.get("opening_date") ?? "")),
    expected_closing_date: null,
    closing_date: null,
    project_manager_id: null,
    notes: String(formData.get("notes") ?? ""),
  };

  const { error } = await supabase.from("projects").insert(payload);
  return !error;
}

async function updateProjectInSupabase(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;

  const id = String(formData.get("id") ?? "");
  if (!id) return false;

  const payload = {
    project_code: String(formData.get("project_code") ?? "PRJ-NEW"),
    name: String(formData.get("name") ?? "Nuova commessa"),
    description: String(formData.get("description") ?? ""),
    country: String(formData.get("country") ?? "Italia"),
    city: String(formData.get("city") ?? "Milano"),
    address: String(formData.get("address") ?? ""),
    status: (String(formData.get("status") ?? "draft") as "draft" | "active" | "suspended" | "completed" | "archived"),
    opening_date: toNullableDate(String(formData.get("opening_date") ?? "")),
    notes: String(formData.get("notes") ?? ""),
  };

  const { error } = await supabase.from("projects").update(payload).eq("id", id);
  return !error;
}

async function deleteProjectInSupabase(id: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from("projects").delete().eq("id", id);
  return !error;
}

async function createInvoiceInSupabase(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;

  const { data: legalEntity } = await supabase.from("legal_entities").select("id").limit(1).maybeSingle();
  const payload = {
    invoice_type: (String(formData.get("invoice_type") ?? "purchase") as "purchase" | "sale"),
    invoice_number: String(formData.get("invoice_number") ?? `INV-${Date.now()}`),
    invoice_date: toNullableDate(String(formData.get("invoice_date") ?? "")),
    received_date: null,
    supplier_id: null,
    customer_id: null,
    legal_entity_id: legalEntity?.id ?? null,
    project_id: null,
    amount_net: Number(formData.get("amount_net") ?? Number(formData.get("amount_total") ?? 0)),
    vat_amount: Number(formData.get("vat_amount") ?? 0),
    amount_total: Number(formData.get("amount_total") ?? 0),
    due_date: toNullableDate(String(formData.get("due_date") ?? "")),
    payment_date: null,
    status: (String(formData.get("status") ?? "to_register") as any),
    document_id: null,
    notes: String(formData.get("notes") ?? ""),
  };

  const { error } = await supabase.from("invoices").insert(payload);
  return !error;
}

async function updateInvoiceInSupabase(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;

  const id = String(formData.get("id") ?? "");
  if (!id) return false;

  const payload = {
    invoice_type: (String(formData.get("invoice_type") ?? "purchase") as "purchase" | "sale"),
    invoice_number: String(formData.get("invoice_number") ?? "INV-NEW"),
    invoice_date: toNullableDate(String(formData.get("invoice_date") ?? "")),
    amount_net: Number(formData.get("amount_net") ?? Number(formData.get("amount_total") ?? 0)),
    vat_amount: Number(formData.get("vat_amount") ?? 0),
    amount_total: Number(formData.get("amount_total") ?? 0),
    due_date: toNullableDate(String(formData.get("due_date") ?? "")),
    status: (String(formData.get("status") ?? "to_register") as any),
    notes: String(formData.get("notes") ?? ""),
  };

  const { error } = await supabase.from("invoices").update(payload).eq("id", id);
  return !error;
}

async function deleteInvoiceInSupabase(id: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from("invoices").delete().eq("id", id);
  return !error;
}

async function createCompanyInSupabase(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;

  const type = String(formData.get("company_type") ?? "customer");
  const payload = {
    company_type: type,
    business_name: String(formData.get("business_name") ?? "Nuova azienda"),
    short_name: String(formData.get("short_name") ?? ""),
    vat_number: String(formData.get("vat_number") ?? ""),
    tax_code: String(formData.get("tax_code") ?? ""),
    country: String(formData.get("country") ?? "Italia"),
    address: String(formData.get("address") ?? ""),
    postal_code: String(formData.get("postal_code") ?? ""),
    city: String(formData.get("city") ?? "Milano"),
    province: String(formData.get("province") ?? ""),
    email: String(formData.get("email") ?? ""),
    pec: String(formData.get("pec") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    website: String(formData.get("website") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    active: true,
  };

  const { error } = await supabase.from("companies").insert(payload);
  return !error;
}

async function updateCompanyInSupabase(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;

  const id = String(formData.get("id") ?? "");
  if (!id) return false;

  const payload = {
    company_type: String(formData.get("company_type") ?? "customer"),
    business_name: String(formData.get("business_name") ?? "Nuova azienda"),
    vat_number: String(formData.get("vat_number") ?? ""),
    country: String(formData.get("country") ?? "Italia"),
    address: String(formData.get("address") ?? ""),
    city: String(formData.get("city") ?? "Milano"),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    active: formData.get("active") === "on" || true,
    notes: String(formData.get("notes") ?? ""),
  };

  const { error } = await supabase.from("companies").update(payload).eq("id", id);
  return !error;
}

async function deleteCompanyInSupabase(id: string, type: "customer" | "supplier") {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from("companies").delete().eq("id", id).eq("company_type", type);
  return !error;
}

export async function createProjectAction(formData: FormData): Promise<void> {
  const ok = await createProjectInSupabase(formData);
  if (!ok) {
    const payload = {
      id: `proj-${Date.now()}`,
      project_code: String(formData.get("project_code") ?? "PRJ-NEW"),
      name: String(formData.get("name") ?? "Nuova commessa"),
      customer_name: String(formData.get("customer_name") ?? "Cliente nuovo"),
      country: String(formData.get("country") ?? "Italia"),
      city: String(formData.get("city") ?? "Milano"),
      status: (String(formData.get("status") ?? "draft") as "draft" | "active" | "suspended" | "completed" | "archived"),
      opening_date: String(formData.get("opening_date") ?? new Date().toISOString().slice(0, 10)),
      project_manager_name: String(formData.get("project_manager_name") ?? "Team SIMI"),
    };

    projects.unshift(payload);
  }

  revalidatePath("/commesse");
  redirect(withSuccess("/commesse", "Commessa creata."));
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const ok = await updateProjectInSupabase(formData);

  if (!ok) {
    const index = projects.findIndex((project) => project.id === id);

    if (index >= 0) {
      projects[index] = {
        ...projects[index],
        project_code: String(formData.get("project_code") ?? projects[index].project_code),
        name: String(formData.get("name") ?? projects[index].name),
        customer_name: String(formData.get("customer_name") ?? projects[index].customer_name ?? "Cliente nuovo"),
        country: String(formData.get("country") ?? projects[index].country ?? "Italia"),
        city: String(formData.get("city") ?? projects[index].city ?? "Milano"),
        status: (String(formData.get("status") ?? projects[index].status) as "draft" | "active" | "suspended" | "completed" | "archived"),
        opening_date: String(formData.get("opening_date") ?? projects[index].opening_date ?? new Date().toISOString().slice(0, 10)),
        project_manager_name: String(formData.get("project_manager_name") ?? projects[index].project_manager_name ?? "Team SIMI"),
      };
    }
  }

  revalidatePath("/commesse");
  redirect(withSuccess("/commesse", "Modifiche salvate."));
}

export async function deleteProjectAction(id: string): Promise<void> {
  const ok = await deleteProjectInSupabase(id);
  if (!ok) {
    const nextProjects = projects.filter((project) => project.id !== id);
    projects.splice(0, projects.length, ...nextProjects);
  }

  revalidatePath("/commesse");
  redirect(withSuccess("/commesse", "Commessa eliminata."));
}

export async function createInvoiceAction(formData: FormData): Promise<void> {
  const ok = await createInvoiceInSupabase(formData);
  if (!ok) {
    const id = `inv-${Date.now()}`;
    const invoice = {
      id,
      invoice_number: String(formData.get("invoice_number") ?? `INV-${Date.now()}`),
      invoice_type: (String(formData.get("invoice_type") ?? "purchase") as "purchase" | "sale"),
      status: (String(formData.get("status") ?? "to_register") as any),
      amount_total: Number(formData.get("amount_total") ?? 0),
      invoice_date: String(formData.get("invoice_date") ?? new Date().toISOString().slice(0, 10)),
      due_date: String(formData.get("due_date") ?? new Date().toISOString().slice(0, 10)),
      customer_name: String(formData.get("customer_name") ?? "Cliente nuovo"),
      project_code: String(formData.get("project_code") ?? "C-NEW"),
      company_name: String(formData.get("company_name") ?? "SIMI Italia"),
    };

    invoices.unshift(invoice);
  }

  revalidatePath("/fatture");
  redirect(withSuccess("/fatture", "Fattura creata."));
}

export async function updateInvoiceAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const ok = await updateInvoiceInSupabase(formData);

  if (!ok) {
    const index = invoices.findIndex((invoice) => invoice.id === id);

    if (index >= 0) {
      invoices[index] = {
        ...invoices[index],
        invoice_number: String(formData.get("invoice_number") ?? invoices[index].invoice_number),
        invoice_type: (String(formData.get("invoice_type") ?? invoices[index].invoice_type) as "purchase" | "sale"),
        status: (String(formData.get("status") ?? invoices[index].status) as any),
        amount_total: Number(formData.get("amount_total") ?? invoices[index].amount_total),
        invoice_date: String(formData.get("invoice_date") ?? invoices[index].invoice_date ?? new Date().toISOString().slice(0, 10)),
        due_date: String(formData.get("due_date") ?? invoices[index].due_date ?? new Date().toISOString().slice(0, 10)),
        customer_name: String(formData.get("customer_name") ?? invoices[index].customer_name),
        project_code: String(formData.get("project_code") ?? invoices[index].project_code),
        company_name: String(formData.get("company_name") ?? invoices[index].company_name),
      };
    }
  }

  revalidatePath("/fatture");
  redirect(withSuccess("/fatture", "Modifiche salvate."));
}

export async function deleteInvoiceAction(id: string): Promise<void> {
  const ok = await deleteInvoiceInSupabase(id);
  if (!ok) {
    const nextInvoices = invoices.filter((invoice) => invoice.id !== id);
    invoices.splice(0, invoices.length, ...nextInvoices);
  }

  revalidatePath("/fatture");
  redirect(withSuccess("/fatture", "Fattura eliminata."));
}

export async function createCompanyAction(formData: FormData): Promise<void> {
  const ok = await createCompanyInSupabase(formData);
  if (!ok) {
    const type = String(formData.get("company_type") ?? "customer");
    const payload = {
      id: `company-${Date.now()}`,
      business_name: String(formData.get("business_name") ?? "Nuova azienda"),
      company_type: type as "customer" | "supplier" | "both",
      vat_number: String(formData.get("vat_number") ?? ""),
      country: String(formData.get("country") ?? "Italia"),
      city: String(formData.get("city") ?? "Milano"),
      address: String(formData.get("address") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      active: true,
      contact_name: String(formData.get("contact_name") ?? ""),
    };

    if (type === "customer") {
      customers.unshift(payload);
      revalidatePath("/clienti");
      redirect(withSuccess("/clienti", "Cliente creato."));
    }

    suppliers.unshift(payload);
    revalidatePath("/fornitori");
    redirect(withSuccess("/fornitori", "Fornitore creato."));
  }

  const createdPath = String(formData.get("company_type") === "supplier" ? "/fornitori" : "/clienti");
  revalidatePath(createdPath);
  redirect(withSuccess(createdPath, formData.get("company_type") === "supplier" ? "Fornitore creato." : "Cliente creato."));
}

export async function updateCompanyAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const type = String(formData.get("company_type") ?? "customer");
  const ok = await updateCompanyInSupabase(formData);

  if (!ok) {
    const list = type === "supplier" ? suppliers : customers;
    const index = list.findIndex((company) => company.id === id);

    if (index >= 0) {
      list[index] = {
        ...list[index],
        business_name: String(formData.get("business_name") ?? list[index].business_name),
        vat_number: String(formData.get("vat_number") ?? list[index].vat_number ?? ""),
        country: String(formData.get("country") ?? list[index].country ?? "Italia"),
        city: String(formData.get("city") ?? list[index].city ?? "Milano"),
        address: String(formData.get("address") ?? list[index].address ?? ""),
        email: String(formData.get("email") ?? list[index].email ?? ""),
        phone: String(formData.get("phone") ?? list[index].phone ?? ""),
        active: formData.get("active") === "on" || list[index].active,
        contact_name: String(formData.get("contact_name") ?? list[index].contact_name ?? ""),
      };
    }
  }

  revalidatePath(type === "supplier" ? "/fornitori" : "/clienti");
  redirect(withSuccess(type === "supplier" ? "/fornitori" : "/clienti", "Modifiche salvate."));
}

export async function deleteCompanyAction(id: string, type: "customer" | "supplier") {
  const ok = await deleteCompanyInSupabase(id, type);
  if (!ok) {
    const list = type === "supplier" ? suppliers : customers;
    const next = list.filter((company) => company.id !== id);
    if (type === "supplier") {
      suppliers.splice(0, suppliers.length, ...next);
      revalidatePath("/fornitori");
      redirect(withSuccess("/fornitori", "Fornitore eliminato."));
    }

    customers.splice(0, customers.length, ...next);
  }

  revalidatePath(type === "supplier" ? "/fornitori" : "/clienti");
  redirect(withSuccess(type === "supplier" ? "/fornitori" : "/clienti", type === "supplier" ? "Fornitore eliminato." : "Cliente eliminato."));
}

export async function makeUniqueSlug(value: string, collection: string[]) {
  const base = slugify(value);
  const used = new Set(collection);
  let candidate = base;
  let counter = 1;

  while (used.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}
