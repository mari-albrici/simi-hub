import type { ReactNode } from "react";

export function LoadingSpinner({ label = "Caricamento…", size = "sm" }: { label?: string; size?: "sm" | "md" }) {
  return <span className="d-inline-flex align-items-center gap-2" role="status" aria-live="polite">
    <span className={`spinner-border${size === "sm" ? " spinner-border-sm" : ""}`} aria-hidden="true" />
    <span>{label}</span>
  </span>;
}

export function SectionLoading({ label = "Caricamento sezione…" }: { label?: string }) {
  return <div className="section-loading py-4 text-center" role="status" aria-live="polite"><LoadingSpinner label={label} /></div>;
}

export function TableLoading({ rows = 4, columns = 4 }: { rows?: number; columns?: number }) {
  return <div className="table-responsive" aria-busy="true" aria-label="Caricamento tabella"><table className="table table-sm mb-0"><tbody>{Array.from({ length: rows }, (_, row) => <tr key={row}>{Array.from({ length: columns }, (_, column) => <td key={column}><span className="skeleton-line" /></td>)}</tr>)}</tbody></table></div>;
}

export function PageLoading({ children }: { children?: ReactNode }) {
  return <main className="page-loading" aria-busy="true"><SectionLoading label={children ? String(children) : "Caricamento pagina…"} /></main>;
}
