import { getDeadlines, deadlineHref } from "@/lib/deadlines";
import { checkDatabase } from "@/lib/errors";
import { authorizedClient } from "@/lib/permissions";
import { getInvoices, readAll } from "@/lib/data";
import {
  addDaysISO,
  getTimeStatus,
  isInvoiceOpen,
  todayISO,
} from "@/lib/dashboard-helpers";
import type {
  CashFlowPoint,
  DeadlineListItem,
  FinancialBucket,
  ProjectAttention,
} from "@/types";

export type DashboardKpis = {
  payable: { amount: number; count: number; currencies?: Record<string, number> };
  receivable: { amount: number; count: number; currencies?: Record<string, number> };
  payableOverdue: { amount: number; count: number; currencies?: Record<string, number> };
  receivableOverdue: { amount: number; count: number; currencies?: Record<string, number> };
  deadlinesNext7: number;
};

export type DashboardData = {
  // false quando Supabase non è configurato: la UI mostra lo stato vuoto invece dei dati.
  configured: boolean;
  // true quando una o più query hanno fallito: la UI mostra un avviso senza stack trace.
  error: boolean;
  kpis: DashboardKpis;
  upcomingDeadlines: DeadlineListItem[];
  supplierSummary: FinancialBucket;
  customerSummary: FinancialBucket;
  cashFlow: CashFlowPoint[];
  projectsAttention: ProjectAttention[];
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_type: "purchase" | "sale";
  status: string;
  amount_total: number;
  due_date: string | null;
  project_ids: string[];
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
  const supabase = await authorizedClient("dashboard.read");
    const today = todayISO();
    const in7 = addDaysISO(7, today); const in30 = addDaysISO(30, today);
    const in60 = addDaysISO(60, today); const in90 = addDaysISO(90, today);
    const in31 = addDaysISO(31, today); const in61 = addDaysISO(61, today);
    const [invoiceData, deadlineData, documentData, projectData, companyData] = await Promise.all([
      getInvoices(),
      readAll((a,b) => supabase.from("deadlines").select("id,title,description,due_date,status,priority,project_id,company_id,invoice_id").eq("status","open").is("archived_at",null).is("invoice_id",null).order("id").range(a,b)),
      readAll((a,b) => supabase.from("documents").select("id,title,category_id,expiry_date,status,project_id").is("archived_at",null).eq("file_state","ready").order("id").range(a,b)),
      readAll((a,b) => supabase.from("projects").select("id,project_code,name,customer_id").is("archived_at",null).order("id").range(a,b)),
      readAll((a,b) => supabase.from("companies").select("id,business_name").is("archived_at",null).order("id").range(a,b)),
    ]);

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


    const invoices: InvoiceRow[] = (invoiceData ?? []).map((row) => ({
      id: String(row.id),
      invoice_number: String(row.invoice_number ?? "-"),
      invoice_type: (row.invoice_type === "sale" ? "sale" : "purchase"),
      status: String(row.status ?? "to_register"),
      amount_total: Number(row.amount_total ?? 0),
      due_date: row.due_date ? String(row.due_date) : null,
      project_ids: row.project_ids,
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


    // DDT inference removed: category 06 is not a DDT/invoice relation.
    const ddtWithoutInvoice: DocumentRow[] = [];
    const expiringDocuments = documents.filter(
      (doc) => doc.expiry_date && doc.expiry_date <= in30 && doc.status !== "archived",
    );

    const next7 = await getDeadlines({period:"7"});
    const deadlinesNext7 = next7.count;


    // Same source and server filters as the operational register.
    const upcomingRows=(await getDeadlines({period:"30"},true)).rows;
    const upcomingDeadlines: DeadlineListItem[] = upcomingRows.map(row=>({
      id:row.id,category:row.category_name,description:row.title,dueDate:row.due_date!,
      amount:row.residual===null?undefined:Number(row.residual),currency:row.currency??undefined,
      subjectName:row.company_name??undefined,status:row.temporal_status,timeStatus:getTimeStatus(row.due_date,today),
      href:deadlineHref(row as import("@/lib/deadlines").Deadline),
    }));
    const kpiResult=await supabase.rpc("deadline_financial_kpis");checkDatabase(kpiResult.error);
    const financialKpi=(kind:string,overdueOnly=false)=>{
      const rows=(kpiResult.data??[]) as {kind:string;currency:string;overdue:boolean;amount:number;items:number}[];
      const currencies:Record<string,number>={};let count=0;
      for(const row of rows.filter(r=>r.kind===kind&&(!overdueOnly||r.overdue))){currencies[row.currency]=(currencies[row.currency]??0)+Number(row.amount);count+=Number(row.items);}
      return {amount:currencies.EUR??0,count,currencies};
    };

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

    purchaseOverdue.forEach((inv) => inv.project_ids.forEach(id => addReason(id, "Fatture fornitore scadute")));
    saleOverdue.forEach((inv) => inv.project_ids.forEach(id => addReason(id, "Incassi scaduti")));
    toVerifyInvoices.forEach((inv) => inv.project_ids.forEach(id => addReason(id, "Fatture da verificare")));
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
        payable: financialKpi("payment"),
        receivable: financialKpi("receipt"),
        payableOverdue: financialKpi("payment",true),
        receivableOverdue: financialKpi("receipt",true),
        deadlinesNext7,
      },
      upcomingDeadlines,
      supplierSummary: bucketize(purchaseOpen, today, in7, in30),
      customerSummary: bucketize(saleOpen, today, in7, in30),
      cashFlow,
      projectsAttention,
    };
}
