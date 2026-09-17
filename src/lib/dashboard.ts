import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  addDaysISO,
  getTimeStatus,
  isInvoiceOpen,
  mapDeadlinePriority,
  sortByPriorityThenDate,
  todayISO,
} from "@/lib/dashboard-helpers";
import type {
  AttentionItem,
  CashFlowPoint,
  DeadlineListItem,
  FinancialBucket,
  ProjectAttention,
} from "@/types";

export type DashboardKpis = {
  payable: { amount: number; count: number };
  receivable: { amount: number; count: number };
  payableOverdue: { amount: number; count: number };
  receivableOverdue: { amount: number; count: number };
  deadlinesNext7: number;
  anomalies: number;
};

export type DashboardData = {
  // false quando Supabase non è configurato: la UI mostra lo stato vuoto invece dei dati.
  configured: boolean;
  // true quando una o più query hanno fallito: la UI mostra un avviso senza stack trace.
  error: boolean;
  kpis: DashboardKpis;
  attentionItems: AttentionItem[];
  upcomingDeadlines: DeadlineListItem[];
  supplierSummary: FinancialBucket;
  customerSummary: FinancialBucket;
  cashFlow: CashFlowPoint[];
  projectsAttention: ProjectAttention[];
};

function emptyBucket(): FinancialBucket {
  return { totalOpen: 0, countOpen: 0, dueSoon7: 0, dueSoon30: 0, overdue: 0, countOverdue: 0 };
}

function emptyDashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    configured: false,
    error: false,
    kpis: {
      payable: { amount: 0, count: 0 },
      receivable: { amount: 0, count: 0 },
      payableOverdue: { amount: 0, count: 0 },
      receivableOverdue: { amount: 0, count: 0 },
      deadlinesNext7: 0,
      anomalies: 0,
    },
    attentionItems: [],
    upcomingDeadlines: [],
    supplierSummary: emptyBucket(),
    customerSummary: emptyBucket(),
    cashFlow: [],
    projectsAttention: [],
    ...overrides,
  };
}

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_type: "purchase" | "sale";
  status: string;
  amount_total: number;
  due_date: string | null;
  project_id: string | null;
  supplier_id: string | null;
  customer_id: string | null;
  document_id: string | null;
};

type DeadlineRow = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  project_id: string | null;
  company_id: string | null;
  invoice_id: string | null;
};

type DocumentRow = {
  id: string;
  title: string;
  category_id: string | null;
  expiry_date: string | null;
  status: string;
  project_id: string | null;
};

const sum = (rows: InvoiceRow[]) => rows.reduce((acc, row) => acc + row.amount_total, 0);

function bucketize(rows: InvoiceRow[], today: string, in7: string, in30: string): FinancialBucket {
  const overdue = rows.filter((row) => row.due_date && row.due_date < today);
  const dueSoon7 = rows.filter((row) => row.due_date && row.due_date >= today && row.due_date <= in7);
  const dueSoon30 = rows.filter((row) => row.due_date && row.due_date >= today && row.due_date <= in30);

  return {
    totalOpen: sum(rows),
    countOpen: rows.length,
    dueSoon7: sum(dueSoon7),
    dueSoon30: sum(dueSoon30),
    overdue: sum(overdue),
    countOverdue: overdue.length,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return emptyDashboardData();

  try {
    const today = todayISO();
    const in7 = addDaysISO(7, today);
    const in30 = addDaysISO(30, today);
    const in60 = addDaysISO(60, today);
    const in90 = addDaysISO(90, today);
    const in31 = addDaysISO(31, today);
    const in61 = addDaysISO(61, today);

    const [
      { data: invoiceData, error: invoiceError },
      { data: deadlineData, error: deadlineError },
      { data: documentData, error: documentError },
      { data: categoryData },
      { data: projectData },
      { data: companyData },
    ] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_type, status, amount_total, due_date, project_id, supplier_id, customer_id, document_id"),
      supabase
        .from("deadlines")
        .select("id, title, description, due_date, status, priority, project_id, company_id, invoice_id")
        .eq("status", "open"),
      supabase.from("documents").select("id, title, category_id, expiry_date, status, project_id"),
      supabase.from("document_categories").select("id, code"),
      supabase.from("projects").select("id, project_code, name, customer_id"),
      supabase.from("companies").select("id, business_name"),
    ]);

    if (invoiceError || deadlineError || documentError) {
      return emptyDashboardData({ configured: true, error: true });
    }

    const companyMap = new Map((companyData ?? []).map((c) => [String(c.id), String(c.business_name ?? "-")]));
    const projectMap = new Map(
      (projectData ?? []).map((p) => [
        String(p.id),
        {
          project_code: String(p.project_code ?? "-"),
          name: String(p.name ?? "-"),
          customer_name: p.customer_id ? companyMap.get(String(p.customer_id)) : undefined,
        },
      ]),
    );
    const ddtCategoryIds = new Set((categoryData ?? []).filter((c) => c.code === "06").map((c) => String(c.id)));

    const invoices: InvoiceRow[] = (invoiceData ?? []).map((row) => ({
      id: String(row.id),
      invoice_number: String(row.invoice_number ?? "-"),
      invoice_type: (row.invoice_type === "sale" ? "sale" : "purchase"),
      status: String(row.status ?? "to_register"),
      amount_total: Number(row.amount_total ?? 0),
      due_date: row.due_date ? String(row.due_date) : null,
      project_id: row.project_id ? String(row.project_id) : null,
      supplier_id: row.supplier_id ? String(row.supplier_id) : null,
      customer_id: row.customer_id ? String(row.customer_id) : null,
      document_id: row.document_id ? String(row.document_id) : null,
    }));

    const deadlines: DeadlineRow[] = (deadlineData ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? "Scadenza"),
      description: row.description ? String(row.description) : null,
      due_date: row.due_date ? String(row.due_date) : null,
      status: String(row.status ?? "open"),
      priority: String(row.priority ?? "normal"),
      project_id: row.project_id ? String(row.project_id) : null,
      company_id: row.company_id ? String(row.company_id) : null,
      invoice_id: row.invoice_id ? String(row.invoice_id) : null,
    }));

    const documents: DocumentRow[] = (documentData ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? "Documento"),
      category_id: row.category_id ? String(row.category_id) : null,
      expiry_date: row.expiry_date ? String(row.expiry_date) : null,
      status: String(row.status ?? "draft"),
      project_id: row.project_id ? String(row.project_id) : null,
    }));

    const openInvoices = invoices.filter((row) => isInvoiceOpen(row.status));
    const purchaseOpen = openInvoices.filter((row) => row.invoice_type === "purchase");
    const saleOpen = openInvoices.filter((row) => row.invoice_type === "sale");
    const purchaseOverdue = purchaseOpen.filter((row) => row.due_date && row.due_date < today);
    const saleOverdue = saleOpen.filter((row) => row.due_date && row.due_date < today);

    const toVerifyInvoices = openInvoices.filter(
      (row) => (row.status === "anomaly" || row.status === "to_check") && !(row.due_date && row.due_date < today),
    );
    const missingProjectInvoices = openInvoices.filter((row) => !row.project_id);

    const invoiceDocumentIds = new Set(invoices.map((row) => row.document_id).filter((id): id is string => Boolean(id)));
    const ddtWithoutInvoice = documents.filter(
      (doc) => doc.category_id && ddtCategoryIds.has(doc.category_id) && !invoiceDocumentIds.has(doc.id),
    );
    const expiringDocuments = documents.filter(
      (doc) => doc.expiry_date && doc.expiry_date <= in30 && doc.status !== "archived",
    );

    const deadlinesNext7 = deadlines.filter((d) => d.due_date && d.due_date >= today && d.due_date <= in7).length;
    const anomalies = toVerifyInvoices.length + missingProjectInvoices.length + ddtWithoutInvoice.length;

    // --- Attività che richiedono attenzione ---
    const attentionItems: AttentionItem[] = [];

    for (const inv of purchaseOverdue) {
      attentionItems.push({
        id: `inv-p-${inv.id}`,
        type: "invoice_purchase_overdue",
        priority: "critical",
        title: `Pagamento fattura ${inv.invoice_number}`,
        projectId: inv.project_id ?? undefined,
        projectCode: inv.project_id ? projectMap.get(inv.project_id)?.project_code : undefined,
        subjectName: inv.supplier_id ? companyMap.get(inv.supplier_id) : undefined,
        dueDate: inv.due_date ?? undefined,
        amount: inv.amount_total,
        status: inv.status,
        href: `/fatture/${inv.id}`,
      });
    }

    for (const inv of saleOverdue) {
      attentionItems.push({
        id: `inv-s-${inv.id}`,
        type: "invoice_sale_overdue",
        priority: "critical",
        title: `Incasso fattura ${inv.invoice_number}`,
        projectId: inv.project_id ?? undefined,
        projectCode: inv.project_id ? projectMap.get(inv.project_id)?.project_code : undefined,
        subjectName: inv.customer_id ? companyMap.get(inv.customer_id) : undefined,
        dueDate: inv.due_date ?? undefined,
        amount: inv.amount_total,
        status: inv.status,
        href: `/fatture/${inv.id}`,
      });
    }

    for (const d of deadlines) {
      const timeStatus = getTimeStatus(d.due_date, today);
      if (timeStatus !== "overdue" && timeStatus !== "today") continue;
      attentionItems.push({
        id: `dl-${d.id}`,
        type: timeStatus === "overdue" ? "deadline_overdue" : "deadline_today",
        priority: timeStatus === "overdue" ? "critical" : mapDeadlinePriority(d.priority),
        title: d.title,
        description: d.description ?? undefined,
        projectId: d.project_id ?? undefined,
        projectCode: d.project_id ? projectMap.get(d.project_id)?.project_code : undefined,
        subjectName: d.company_id ? companyMap.get(d.company_id) : undefined,
        dueDate: d.due_date ?? undefined,
        status: d.status,
        href: d.invoice_id ? `/fatture/${d.invoice_id}` : d.project_id ? `/commesse/${d.project_id}` : "/scadenze",
      });
    }

    for (const inv of toVerifyInvoices) {
      attentionItems.push({
        id: `inv-check-${inv.id}`,
        type: "invoice_to_check",
        priority: inv.status === "anomaly" ? "high" : "medium",
        title: `Fattura ${inv.invoice_type === "purchase" ? "fornitore" : "cliente"} da verificare`,
        description: inv.invoice_number,
        projectId: inv.project_id ?? undefined,
        projectCode: inv.project_id ? projectMap.get(inv.project_id)?.project_code : undefined,
        subjectName:
          (inv.supplier_id && companyMap.get(inv.supplier_id)) || (inv.customer_id && companyMap.get(inv.customer_id)) || undefined,
        dueDate: inv.due_date ?? undefined,
        amount: inv.amount_total,
        status: inv.status,
        href: `/fatture/${inv.id}`,
      });
    }

    for (const inv of missingProjectInvoices) {
      attentionItems.push({
        id: `inv-noproj-${inv.id}`,
        type: "invoice_missing_project",
        priority: "low",
        title: "Fattura senza commessa",
        description: inv.invoice_number,
        subjectName:
          (inv.supplier_id && companyMap.get(inv.supplier_id)) || (inv.customer_id && companyMap.get(inv.customer_id)) || undefined,
        dueDate: inv.due_date ?? undefined,
        amount: inv.amount_total,
        status: inv.status,
        href: `/fatture/${inv.id}`,
      });
    }

    for (const doc of ddtWithoutInvoice) {
      attentionItems.push({
        id: `doc-ddt-${doc.id}`,
        type: "ddt_without_invoice",
        priority: "low",
        title: "DDT senza fattura collegata",
        description: doc.title,
        projectId: doc.project_id ?? undefined,
        projectCode: doc.project_id ? projectMap.get(doc.project_id)?.project_code : undefined,
        href: `/documenti/${doc.id}`,
      });
    }

    for (const doc of expiringDocuments) {
      const timeStatus = getTimeStatus(doc.expiry_date, today);
      attentionItems.push({
        id: `doc-exp-${doc.id}`,
        type: timeStatus === "overdue" ? "document_expired" : "document_expiring",
        priority: timeStatus === "overdue" || timeStatus === "today" ? "high" : "medium",
        title: timeStatus === "overdue" ? "Documento scaduto" : "Documento in scadenza",
        description: doc.title,
        projectId: doc.project_id ?? undefined,
        projectCode: doc.project_id ? projectMap.get(doc.project_id)?.project_code : undefined,
        dueDate: doc.expiry_date ?? undefined,
        href: `/documenti/${doc.id}`,
      });
    }

    const sortedAttentionItems = sortByPriorityThenDate(attentionItems);

    // --- Prossime scadenze (30 giorni, inclusi scaduti) ---
    const upcomingDeadlines: DeadlineListItem[] = [];

    for (const inv of openInvoices) {
      if (!inv.due_date || inv.due_date > in30) continue;
      upcomingDeadlines.push({
        id: `inv-${inv.id}`,
        category: inv.invoice_type === "purchase" ? "Fattura fornitore" : "Fattura cliente",
        description: inv.invoice_number,
        dueDate: inv.due_date,
        amount: inv.amount_total,
        projectCode: inv.project_id ? projectMap.get(inv.project_id)?.project_code : undefined,
        subjectName:
          (inv.supplier_id && companyMap.get(inv.supplier_id)) || (inv.customer_id && companyMap.get(inv.customer_id)) || undefined,
        status: inv.status,
        timeStatus: getTimeStatus(inv.due_date, today),
        href: `/fatture/${inv.id}`,
      });
    }

    for (const d of deadlines) {
      if (!d.due_date || d.due_date > in30) continue;
      upcomingDeadlines.push({
        id: `dl-${d.id}`,
        category: "Scadenza",
        description: d.title,
        dueDate: d.due_date,
        projectCode: d.project_id ? projectMap.get(d.project_id)?.project_code : undefined,
        subjectName: d.company_id ? companyMap.get(d.company_id) : undefined,
        status: d.status,
        timeStatus: getTimeStatus(d.due_date, today),
        href: d.invoice_id ? `/fatture/${d.invoice_id}` : d.project_id ? `/commesse/${d.project_id}` : "/scadenze",
      });
    }

    for (const doc of documents) {
      if (!doc.expiry_date || doc.expiry_date > in30 || doc.status === "archived") continue;
      upcomingDeadlines.push({
        id: `doc-${doc.id}`,
        category: "Documento",
        description: doc.title,
        dueDate: doc.expiry_date,
        projectCode: doc.project_id ? projectMap.get(doc.project_id)?.project_code : undefined,
        status: doc.status,
        timeStatus: getTimeStatus(doc.expiry_date, today),
        href: `/documenti/${doc.id}`,
      });
    }

    upcomingDeadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    // --- Flusso di cassa previsto (90 giorni) ---
    const bucketRange = (fromInclusive: string, toInclusive: string) => {
      const predicate = (row: InvoiceRow) => Boolean(row.due_date && row.due_date >= fromInclusive && row.due_date <= toInclusive);
      return { inflow: sum(saleOpen.filter(predicate)), outflow: sum(purchaseOpen.filter(predicate)) };
    };

    const cashFlow: CashFlowPoint[] = [
      { label: "Scaduto", inflow: sum(saleOverdue), outflow: sum(purchaseOverdue) },
      { label: "0-30 gg", ...bucketRange(today, in30) },
      { label: "31-60 gg", ...bucketRange(in31, in60) },
      { label: "61-90 gg", ...bucketRange(in61, in90) },
    ];

    // --- Commesse che richiedono attenzione ---
    const projectReasons = new Map<string, Set<string>>();
    const addReason = (projectId: string | null, reason: string) => {
      if (!projectId) return;
      if (!projectReasons.has(projectId)) projectReasons.set(projectId, new Set());
      projectReasons.get(projectId)!.add(reason);
    };

    purchaseOverdue.forEach((inv) => addReason(inv.project_id, "Fatture fornitore scadute"));
    saleOverdue.forEach((inv) => addReason(inv.project_id, "Incassi scaduti"));
    toVerifyInvoices.forEach((inv) => addReason(inv.project_id, "Fatture da verificare"));
    deadlines.forEach((d) => {
      const ts = getTimeStatus(d.due_date, today);
      if (ts === "overdue" || ts === "today") addReason(d.project_id, "Scadenze imminenti");
    });
    expiringDocuments.forEach((doc) => addReason(doc.project_id, "Documentazione in scadenza"));
    ddtWithoutInvoice.forEach((doc) => addReason(doc.project_id, "DDT senza fattura"));

    const projectsAttention: ProjectAttention[] = Array.from(projectReasons.entries())
      .map(([projectId, reasons]) => {
        const project = projectMap.get(projectId);
        return {
          id: projectId,
          project_code: project?.project_code ?? "-",
          name: project?.name ?? "-",
          customer_name: project?.customer_name,
          reasons: Array.from(reasons),
        };
      })
      .sort((a, b) => b.reasons.length - a.reasons.length);

    return {
      configured: true,
      error: false,
      kpis: {
        payable: { amount: sum(purchaseOpen), count: purchaseOpen.length },
        receivable: { amount: sum(saleOpen), count: saleOpen.length },
        payableOverdue: { amount: sum(purchaseOverdue), count: purchaseOverdue.length },
        receivableOverdue: { amount: sum(saleOverdue), count: saleOverdue.length },
        deadlinesNext7,
        anomalies,
      },
      attentionItems: sortedAttentionItems,
      upcomingDeadlines,
      supplierSummary: bucketize(purchaseOpen, today, in7, in30),
      customerSummary: bucketize(saleOpen, today, in7, in30),
      cashFlow,
      projectsAttention,
    };
  } catch {
    return emptyDashboardData({ configured: true, error: true });
  }
}
