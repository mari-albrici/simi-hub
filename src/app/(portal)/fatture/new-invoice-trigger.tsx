import Link from "@/components/ui/app-link";
/** Dedicated route reuses InvoiceForm and works without modal hydration. */
export function NewInvoiceTrigger() {
  return <Link href="/fatture/new" className="btn btn-primary flex-shrink-0"><i className="bi bi-plus-lg me-2" aria-hidden="true"/>Nuova fattura</Link>;
}
