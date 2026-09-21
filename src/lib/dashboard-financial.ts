import { addDaysISO } from "./dashboard-helpers";
import { cents } from "./money";
import type { Deadline } from "./deadlines";
import type { CashFlowPoint, FinancialBucket } from "@/types";

type FinancialDeadline = Pick<Deadline, "source" | "kind" | "currency" | "residual" | "due_date" | "completed" | "archived_at" | "temporal_status">;

/** Aggregate authoritative balances; never derive payments from invoice status or nominal totals. */
export function summarizeDeadlineFinance(rows: FinancialDeadline[], today: string) {
  const open = rows.filter(r => r.source === "financial" && !r.completed && !r.archived_at);
  const total = (items: FinancialDeadline[]) => items.reduce((n, r) => n + cents(Number(r.residual ?? 0)), 0) / 100;
  const within = (r: FinancialDeadline, days: number) => !!r.due_date && r.due_date >= today && r.due_date <= addDaysISO(days, today);
  const kpi = (kind: string, overdue = false) => {
    const selected = open.filter(r => r.kind === kind && (!overdue || r.temporal_status === "overdue"));
    const currencies = Object.fromEntries([...new Set(selected.map(r => r.currency!))].sort().map(currency => [currency, total(selected.filter(r => r.currency === currency))]));
    return { amount: currencies.EUR ?? 0, count: selected.length, currencies };
  };
  const eur = open.filter(r => r.currency === "EUR");
  const bucket = (kind: string): FinancialBucket => {
    const selected = eur.filter(r => r.kind === kind), overdue = selected.filter(r => r.temporal_status === "overdue");
    return { totalOpen: total(selected), countOpen: selected.length, dueSoon7: total(selected.filter(r => within(r, 7))), dueSoon30: total(selected.filter(r => within(r, 30))), overdue: total(overdue), countOverdue: overdue.length };
  };
  const periods = [
    { label: "Scaduto", matches: (r: FinancialDeadline) => r.temporal_status === "overdue" },
    { label: "0-30 gg", matches: (r: FinancialDeadline) => within(r, 30) },
    { label: "31-60 gg", matches: (r: FinancialDeadline) => within(r, 60) && !within(r, 30) },
    { label: "61-90 gg", matches: (r: FinancialDeadline) => within(r, 90) && !within(r, 60) },
  ];
  const cashFlow: CashFlowPoint[] = periods.map(p => ({ label: p.label, inflow: total(eur.filter(r => r.kind === "receipt" && p.matches(r))), outflow: total(eur.filter(r => r.kind === "payment" && p.matches(r))) }));
  return {
    payable: kpi("payment"), receivable: kpi("receipt"), payableOverdue: kpi("payment", true), receivableOverdue: kpi("receipt", true),
    supplierSummary: bucket("payment"), customerSummary: bucket("receipt"), cashFlow,
    otherCurrencies: [...new Set(open.filter(r => r.currency !== "EUR").map(r => r.currency!))].sort(),
    undatedCount: open.filter(r => !r.due_date).length,
  };
}

/** Nominal registered documents, not exposure or cash flow. Keep both direction and currency. */
export function summarizeInvoiceAmounts(rows: {invoice_type: string; currency: string; amount_total: number}[]) {
  return ["purchase", "sale"].flatMap(type => [...new Set(rows.filter(r => r.invoice_type === type).map(r => r.currency))].sort().map(currency => ({
    type, currency, amount: rows.filter(r => r.invoice_type === type && r.currency === currency).reduce((n,r) => n+cents(r.amount_total),0)/100,
  })));
}
