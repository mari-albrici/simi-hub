import type { Priority, TimeStatus } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(days: number, from: string = todayISO()): string {
  return new Date(new Date(from).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function getTimeStatus(dueDate: string | null | undefined, today: string = todayISO()): TimeStatus {
  if (!dueDate) return "future";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  if (dueDate <= addDaysISO(7, today)) return "upcoming";
  return "future";
}

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function sortByPriorityThenDate<T extends { priority: Priority; dueDate?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rankDiff !== 0) return rankDiff;
    return (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31");
  });
}

// Statuses fattura considerati "chiusi" (non più aperti/da incassare o pagare).
const CLOSED_INVOICE_STATUSES = new Set(["paid", "archived"]);

export function isInvoiceOpen(status: string): boolean {
  return !CLOSED_INVOICE_STATUSES.has(status);
}

// Mappa priorità delle scadenze (deadlines.priority) sulla scala condivisa della dashboard.
export function mapDeadlinePriority(priority: string): Priority {
  switch (priority) {
    case "urgent":
      return "critical";
    case "high":
      return "high";
    case "low":
      return "low";
    default:
      return "medium";
  }
}

export function formatCurrencyEUR(value: number): string {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export function formatDateIT(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("it-IT");
}

export const TIME_STATUS_LABEL: Record<TimeStatus, string> = {
  overdue: "Scaduto",
  today: "Oggi",
  upcoming: "Imminente",
  future: "Futuro",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Critico",
  high: "Alto",
  medium: "Medio",
  low: "Basso",
};

export const PRIORITY_BADGE_VARIANT: Record<Priority, "danger" | "warning" | "info" | "secondary"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "secondary",
};
