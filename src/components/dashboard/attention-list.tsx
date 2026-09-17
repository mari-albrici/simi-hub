import Link from "next/link";
import type { AttentionItem } from "@/types";
import { PRIORITY_BADGE_VARIANT, PRIORITY_LABEL, formatCurrencyEUR, formatDateIT } from "@/lib/dashboard-helpers";
import { DashboardEmptyState } from "./dashboard-empty-state";

const PRIORITY_ICON: Record<AttentionItem["priority"], string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "⚪",
};

export function AttentionList({ items, limit = 8 }: { items: AttentionItem[]; limit?: number }) {
  if (items.length === 0) {
    return <DashboardEmptyState message="Nessuna attività richiede attenzione al momento." />;
  }

  const visible = items.slice(0, limit);

  return (
    <div className="table-responsive">
      <table className="table align-middle mb-0">
        <thead>
          <tr>
            <th aria-label="Priorità"></th>
            <th>Descrizione</th>
            <th>Commessa</th>
            <th>Soggetto</th>
            <th>Scadenza</th>
            <th className="text-end">Importo</th>
            <th>Priorità</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((item) => (
            <tr key={item.id}>
              <td>{PRIORITY_ICON[item.priority]}</td>
              <td>
                {item.href ? (
                  <Link href={item.href} className="text-decoration-none fw-semibold">
                    {item.title}
                  </Link>
                ) : (
                  <span className="fw-semibold">{item.title}</span>
                )}
                {item.description ? <div className="small text-muted">{item.description}</div> : null}
              </td>
              <td>{item.projectCode ?? "-"}</td>
              <td>{item.subjectName ?? "-"}</td>
              <td>{formatDateIT(item.dueDate)}</td>
              <td className="text-end">{item.amount ? formatCurrencyEUR(item.amount) : "-"}</td>
              <td>
                <span className={`badge text-bg-${PRIORITY_BADGE_VARIANT[item.priority]}`}>{PRIORITY_LABEL[item.priority]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
