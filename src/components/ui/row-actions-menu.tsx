import type { ReactNode } from "react";

export function RowActionsMenu({ label = "Azioni", children }: { label?: string; children: ReactNode }) {
  return <details className="row-actions">
    <summary className="btn btn-sm btn-outline-secondary" aria-label={label} title={label}><i className="bi bi-three-dots-vertical" aria-hidden="true" /></summary>
    <div className="row-actions-menu">{children}</div>
  </details>;
}
