export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("it-IT").format(date);
}

export function formatMoney(value: number | null | undefined, currency: string | null = "EUR") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  if (!currency || !/^[A-Za-z]{3}$/.test(currency)) return formatNumber(value, 2);
  return new Intl.NumberFormat("it-IT", { style: "currency", currency, useGrouping: "always", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

export function formatNumber(value: number | null | undefined, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("it-IT", {useGrouping: "always", minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(Number(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("it-IT", {dateStyle:"short",timeStyle:"short"}).format(date);
}

export function formatMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("it-IT", {month:"long",year:"numeric",timeZone:"UTC"}).format(date);
}
