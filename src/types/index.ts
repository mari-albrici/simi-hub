export type RoleName =
  | "admin"
  | "administration"
  | "management"
  | "project_manager"
  | "technical"
  | "viewer";

export type PermissionName =
  | "project.read"
  | "project.create"
  | "project.update"
  | "project.delete"
  | "document.read"
  | "document.upload"
  | "document.update"
  | "document.delete"
  | "invoice.read"
  | "invoice.create"
  | "invoice.update"
  | "invoice.delete"
  | "company.read"
  | "company.update"
  | "employee.read"
  | "employee.update"
  | "admin.users"
  | "admin.settings";

export type CompanyType = "customer" | "supplier" | "both";
export type InvoiceType = "purchase" | "sale";
export type InvoiceStatus =
  | "received"
  | "to_check"
  | "to_register"
  | "registered"
  | "to_pay"
  | "scheduled"
  | "paid"
  | "anomaly"
  | "archived";

export type ProjectStatus = "draft" | "active" | "suspended" | "completed" | "archived";

export type DeadlineStatus = "open" | "completed" | "cancelled";
export type DeadlinePriority = "low" | "normal" | "high" | "urgent";

export interface Profile {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  role: RoleName;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectSummary {
  id: string;
  project_code: string;
  name: string;
  customer_name?: string;
  country?: string;
  city?: string;
  status: ProjectStatus;
  opening_date?: string;
  project_manager_name?: string;
}

export interface DashboardCard {
  value: number;
  label: string;
  tone?: "primary" | "warning" | "danger" | "success" | "secondary";
}

// --- Dashboard operativa: modello condiviso per priorità/scadenze/eventi ---

export type Priority = "critical" | "high" | "medium" | "low";
export type TimeStatus = "overdue" | "today" | "upcoming" | "future";

export type AttentionItemType =
  | "invoice_purchase_overdue"
  | "invoice_sale_overdue"
  | "invoice_to_check"
  | "invoice_missing_project"
  | "deadline_overdue"
  | "deadline_today"
  | "document_expiring"
  | "document_expired"
  | "ddt_without_invoice";

// Voce del centro notifiche/anomalie: rappresenta un evento che richiede verifica umana.
export interface AttentionItem {
  id: string;
  type: AttentionItemType;
  priority: Priority;
  title: string;
  description?: string;
  projectId?: string;
  projectCode?: string;
  subjectName?: string;
  dueDate?: string;
  amount?: number;
  status?: string;
  href?: string;
}

export interface DeadlineListItem {
  id: string;
  category: string;
  description: string;
  dueDate: string;
  amount?: number;
  projectCode?: string;
  subjectName?: string;
  status: string;
  timeStatus: TimeStatus;
  href?: string;
}

export interface FinancialBucket {
  totalOpen: number;
  countOpen: number;
  dueSoon7: number;
  dueSoon30: number;
  overdue: number;
  countOverdue: number;
}

export interface CashFlowPoint {
  label: string;
  inflow: number;
  outflow: number;
}

export interface ProjectAttention {
  id: string;
  project_code: string;
  name: string;
  customer_name?: string;
  reasons: string[];
}
