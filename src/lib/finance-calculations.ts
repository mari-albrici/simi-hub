export type FinancialState = "to_pay" | "partial" | "paid" | "overdue";
export function deriveFinancialState(total: number, allocated: number, dueDate: string | null, today: string): { allocated: number; residual: number; state: FinancialState } {
  const cents = (value: number) => Math.round(value * 100);
  const totalCents = cents(total);
  const allocatedCents = Math.sign(totalCents || 1) * Math.min(Math.abs(totalCents), Math.abs(cents(allocated)));
  const residualCents = totalCents - allocatedCents;
  const state: FinancialState = residualCents === 0 ? "paid" : allocatedCents > 0 ? "partial" : dueDate && dueDate < today ? "overdue" : "to_pay";
  return { allocated: allocatedCents / 100, residual: residualCents / 100, state };
}
