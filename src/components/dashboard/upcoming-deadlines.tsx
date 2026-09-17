"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DeadlineListItem } from "@/types";
import { TIME_STATUS_LABEL, formatCurrencyEUR, formatDateIT } from "@/lib/dashboard-helpers";
import { DashboardEmptyState } from "./dashboard-empty-state";

type FilterKey = "today" | "7" | "30";

const FILTERS: { key: FilterKey; label: string; days: number }[] = [
  { key: "today", label: "Oggi", days: 0 },
  { key: "7", label: "7 giorni", days: 7 },
  { key: "30", label: "30 giorni", days: 30 },
];

function boundaryDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

export function UpcomingDeadlines({ items }: { items: DeadlineListItem[] }) {
  const [filter, setFilter] = useState<FilterKey>("30");

  const filtered = useMemo(() => {
    const activeFilter = FILTERS.find((item) => item.key === filter) ?? FILTERS[2];
    const limit = boundaryDate(activeFilter.days);
    return items.filter((item) => item.dueDate <= limit);
  }, [filter, items]);

  return (
    <div>
      <div className="btn-group btn-group-sm mb-3" role="group" aria-label="Filtro rapido scadenze">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`btn btn-outline-secondary ${filter === option.key ? "active" : ""}`}
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <DashboardEmptyState message="Nessuna scadenza nel periodo selezionato." />
      ) : (
        <div className="list-group list-group-flush">
          {filtered.slice(0, 12).map((item) => (
            <div key={item.id} className="list-group-item px-0 py-2">
              <div className="d-flex justify-content-between gap-3">
                <div>
                  <div className="small text-muted">{item.category}</div>
                  {item.href ? (
                    <Link href={item.href} className="text-decoration-none fw-semibold">
                      {item.description}
                    </Link>
                  ) : (
                    <span className="fw-semibold">{item.description}</span>
                  )}
                  {item.projectCode || item.subjectName ? (
                    <div className="small text-muted">
                      {[item.projectCode, item.subjectName].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                </div>
                <div className="text-end">
                  <div className="small">{formatDateIT(item.dueDate)}</div>
                  {item.amount ? <div className="small text-muted">{formatCurrencyEUR(item.amount)}</div> : null}
                  <span
                    className={`badge text-bg-${
                      item.timeStatus === "overdue" ? "danger" : item.timeStatus === "today" ? "warning" : "secondary"
                    }`}
                  >
                    {TIME_STATUS_LABEL[item.timeStatus]}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
