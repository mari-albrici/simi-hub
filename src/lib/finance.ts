import { authorizedClient } from "@/lib/permissions";
import { checkDatabase } from "@/lib/errors";
import { readAll } from "@/lib/data";
import { deriveFinancialState } from "@/lib/finance-calculations";

export type FinancialSummary = { paid: number; residual: number; financialStatus: "to_pay" | "partial" | "paid" | "overdue" };
export async function getInvoiceFinancialSummaries(invoiceIds: string[]) {
  const result = new Map<string, { paid: number; residual: number; financialStatus: FinancialSummary["financialStatus"] }>();
  if (!invoiceIds.length) return result;
  const db = await authorizedClient("invoice.read");
  const [invoices, allocations] = await Promise.all([
    db.from("invoices").select("id,invoice_type,amount_total,due_date").in("id", invoiceIds),
    readAll((a,b) => db.from("financial_allocations").select("invoice_id,amount,movement:financial_movements!inner(archived_at)").in("invoice_id", invoiceIds).range(a,b)),
  ]);
  checkDatabase(invoices.error, "Lettura saldi fatture");
  const paid = new Map<string, number>();
  for (const row of allocations) { const raw = row.movement as unknown; const movement = Array.isArray(raw) ? raw[0] as { archived_at: string | null } | undefined : raw as { archived_at: string | null } | null; if (!movement?.archived_at) paid.set(String(row.invoice_id), (paid.get(String(row.invoice_id)) ?? 0) + Number(row.amount)); }
  const today = new Date().toISOString().slice(0,10);
  for (const row of invoices.data ?? []) { const state=deriveFinancialState(Number(row.amount_total),paid.get(String(row.id)) ?? 0,row.due_date,today); result.set(String(row.id),{paid:state.allocated,residual:state.residual,financialStatus:state.state}); }
  return result;
}
export async function getFinancialMovements() {
  const db = await authorizedClient("invoice.read");
  const result = await db.from("financial_movements").select("*, entity:legal_entities(business_name), counterparty:companies(business_name), account:financial_accounts(name), allocations:financial_allocations(invoice_id,installment_id,amount)").is("archived_at",null).order("movement_date",{ascending:false});
  checkDatabase(result.error,"Lettura movimenti"); return result.data ?? [];
}

/** Read the same installment balances used by the operational deadline register. */
export async function getInstallmentBalances(invoiceId: string) {
 const db=await authorizedClient("invoice.read");
 const result=await db.from("financial_deadline_balances").select("installment_id,settled_amount,residual").eq("invoice_id",invoiceId);
 checkDatabase(result.error,"Lettura saldi rate");
 return new Map((result.data??[]).filter(r=>r.installment_id).map(r=>[String(r.installment_id),{paid:Number(r.settled_amount),residual:Number(r.residual)}]));
}
