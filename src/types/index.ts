export type RoleName =
  | "admin"
  | "administration"
  | "management"
  | "project_manager"
  | "technical"
  | "viewer"
  | "hr";

export type PermissionName =
  | "task.read" | "task.create" | "task.update" | "task.assign" | "task.archive"
  | "anomaly.read" | "anomaly.update" | "anomaly.assign" | "anomaly.ignore"
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
  | "employee.create"
  | "employee.update"
  | "employee.archive"
  | "employee.hr.read"
  | "admin.users"
  | "admin.settings"
  | "company.create"
  | "company.delete"
  | "legal_entity.read"
  | "legal_entity.create"
  | "deadline.read"
  | "deadline.write"
  | "dashboard.read"
  | "report.read"
  | "profile.directory"
  | "order.read" | "order.create" | "order.update" | "order.delete"
  | "delivery_note.read" | "delivery_note.create" | "delivery_note.update" | "delivery_note.delete"
  | "offer.read" | "offer.create" | "offer.update" | "offer.archive"
  | "contract.read" | "contract.create" | "contract.update" | "contract.archive";

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

export type ProjectStatus = "draft" | "active" | "suspended" | "completed" | "closed" | "archived";

export type PaymentMethod = "bank_transfer" | "sepa_direct_debit" | "credit_card" | "check" | "cash" | "other";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "Bonifico bancario",
  sepa_direct_debit: "RID / SEPA Direct Debit",
  credit_card: "Carta di credito",
  check: "Assegno",
  cash: "Contanti",
  other: "Altro",
};

export interface InvoiceLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number | null;
  vat_exempt_reason: string | null;
  amount_net: number;
  amount_vat: number;
  amount_total: number;
}

export interface InvoiceInstallment {
  id?: string;
  due_date: string;
  amount: number;
  paid: boolean;
}

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
  currency?: string;
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
