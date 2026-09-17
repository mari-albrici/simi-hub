import type { ProjectSummary } from "@/types";

// In-memory fallback store used only when Supabase env vars are not configured.
export let customers: Array<{
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
}> = [];

export let suppliers: Array<{
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
}> = [];

export let projects: ProjectSummary[] = [];

export const recentActivity: string[] = [];

export const upcomingDeadlines: { title: string; dueDate: string; status: string }[] = [];

export let invoices: Array<{
  id: string;
  invoice_number: string;
  invoice_type: string;
  status: string;
  amount_total: number;
  invoice_date: string;
  due_date: string;
  customer_name: string;
  project_code: string;
  company_name: string;
}> = [];
