import { getDeadlines, deadlineHref } from "@/lib/deadlines";
import { authorizedClient } from "@/lib/permissions";
import { getInvoices, readAll } from "@/lib/data";
import { addDaysISO, getTimeStatus, todayISO } from "@/lib/dashboard-helpers";
import { summarizeDeadlineFinance } from "@/lib/dashboard-financial";
import { cents } from "@/lib/money";
import type { CashFlowPoint, DeadlineListItem, FinancialBucket, ProjectAttention } from "@/types";

export type DashboardKpis = {
  payable: { amount: number; count: number; currencies?: Record<string, number> };
  receivable: { amount: number; count: number; currencies?: Record<string, number> };
  payableOverdue: { amount: number; count: number; currencies?: Record<string, number> };
  receivableOverdue: { amount: number; count: number; currencies?: Record<string, number> };
  deadlinesNext7: number;
  deadlinesOverdue: number;
};
export type ProjectStatusPoint = { status: "active" | "draft"; label: string; count: number };
export type FinancialBalancePoint = { label: string; balance: number };
export type DashboardData = {
  configured: boolean; error: boolean; kpis: DashboardKpis; upcomingDeadlines: DeadlineListItem[];
  supplierSummary: FinancialBucket; customerSummary: FinancialBucket; cashFlow: CashFlowPoint[];
  financialBalance: FinancialBalancePoint[]; projectStatus: ProjectStatusPoint[]; projectsAttention: ProjectAttention[];
  otherCurrencies: string[]; undatedCount: number; paidEUR: number; receivedEUR: number;
};

export async function getDashboardData(): Promise<DashboardData> {
  const db = await authorizedClient("dashboard.read"), today = todayISO();
  const [invoiceData, register, next7, overdue, projectData, companyData, movements] = await Promise.all([
    getInvoices(),
    getDeadlines({ status: "open" }, true),
    getDeadlines({ period: "7" }),
    getDeadlines({ period: "overdue" }),
    readAll((a,b) => db.from("projects").select("id,project_code,name,customer_id,status").is("archived_at",null).order("id").range(a,b)),
    readAll((a,b) => db.from("companies").select("id,business_name").is("archived_at",null).order("id").range(a,b)),
    readAll((a,b) => db.from("financial_movements").select("id,direction,amount,currency").is("archived_at",null).order("id").range(a,b)),
  ]);
  const finance = summarizeDeadlineFinance(register.rows, today);
  const companyMap = new Map(companyData.map(c => [String(c.id), String(c.business_name)]));
  const projectMap = new Map(projectData.map(p => [String(p.id), p]));
  const upcomingDeadlines: DeadlineListItem[] = register.rows.filter(r => r.due_date && r.due_date >= today && r.due_date <= addDaysISO(30, today)).map(row => ({
    id:row.id, category:row.category_name, description:row.title, dueDate:row.due_date!,
    amount:row.residual === null ? undefined : Number(row.residual), currency:row.currency ?? undefined,
    subjectName:row.company_name ?? undefined, status:row.temporal_status, timeStatus:getTimeStatus(row.due_date,today), href:deadlineHref(row),
  }));
  const reasons = new Map<string, Set<string>>();
  const addReason = (id: string, reason: string) => { if (!projectMap.has(id)) return; if (!reasons.has(id)) reasons.set(id,new Set()); reasons.get(id)!.add(reason); };
  for (const row of register.rows) {
    const reason = row.temporal_status === "overdue"
      ? row.kind === "payment" ? "Pagamenti scaduti" : row.kind === "receipt" ? "Incassi scaduti" : "Scadenze scadute"
      : ["today","soon"].includes(row.temporal_status) ? "Scadenze entro 7 giorni" : null;
    if (reason) row.project_ids.forEach(id => addReason(id,reason));
  }
  invoiceData.filter(inv => ["to_check","anomaly"].includes(inv.status)).forEach(inv => inv.project_ids.forEach(id => addReason(id,"Fatture da verificare")));
  const projectsAttention: ProjectAttention[] = [...reasons].map(([id, reason]) => {
    const p = projectMap.get(id)!;
    return { id, project_code:String(p.project_code), name:String(p.name), customer_name:p.customer_id ? companyMap.get(String(p.customer_id)) : undefined, reasons:[...reason] };
  }).sort((a,b) => b.reasons.length-a.reasons.length);
  const movementTotal = (direction: string) => movements.filter(m => m.currency === "EUR" && m.direction === direction).reduce((n,m) => n+cents(Number(m.amount)),0)/100;
  return {
    configured:true, error:false,
    kpis:{payable:finance.payable,receivable:finance.receivable,payableOverdue:finance.payableOverdue,receivableOverdue:finance.receivableOverdue,deadlinesNext7:next7.count,deadlinesOverdue:overdue.count},
    upcomingDeadlines, supplierSummary:finance.supplierSummary, customerSummary:finance.customerSummary, cashFlow:finance.cashFlow,
    financialBalance:finance.cashFlow.map(p => ({label:p.label,balance:p.inflow-p.outflow})),
    projectStatus:[{status:"active",label:"Attive",count:projectData.filter(p=>p.status==="active").length},{status:"draft",label:"Bozze",count:projectData.filter(p=>p.status==="draft").length}],
    projectsAttention, otherCurrencies:[...new Set([...finance.otherCurrencies,...movements.filter(m=>m.currency!=="EUR").map(m=>String(m.currency))])].sort(),
    undatedCount:finance.undatedCount, paidEUR:movementTotal("payment"), receivedEUR:movementTotal("receipt"),
  };
}
