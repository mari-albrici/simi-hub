"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { ProjectStatusPoint } from "@/lib/dashboard";
import { DashboardEmptyState } from "./dashboard-empty-state";

export function ProjectsStatusChart({
  data,
}: {
  data: ProjectStatusPoint[];
}) {
  const total = data.reduce(
    (sum, item) => sum + item.count,
    0
  );

  const active =
    data.find((item) => item.status === "ACTIVE")?.count ?? 0;

  const colors: Record<string, string> = {
    ACTIVE: "var(--simi-success)",
    DRAFT: "var(--bs-secondary)",
  };

  if (total === 0) {
    return (
      <DashboardEmptyState message="Nessuna commessa disponibile." />
    );
  }

  return (
    <div>
      <div
        className="position-relative"
        style={{ height: 240 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius="68%"
              outerRadius="90%"
              paddingAngle={3}
              stroke="none"
            >
              {data.map((item) => (
                <Cell
                  key={item.status}
                  fill={colors[item.status]}
                />
              ))}
            </Pie>

            <Tooltip
              formatter={(value, _name, item) => [
                `${Number(value)} commesse`,
                item.payload.label,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div
          className="position-absolute top-50 start-50 translate-middle text-center"
          style={{ pointerEvents: "none" }}
        >
          <div className="h2 fw-semibold mb-0">
            {active}
          </div>

          <div className="small text-muted">
            attive
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-center flex-wrap gap-4 mt-2">
        {data.map((item) => (
          <div
            key={item.status}
            className="d-flex align-items-center gap-2"
          >
            <span
              className="rounded-circle d-inline-block flex-shrink-0"
              style={{
                width: 9,
                height: 9,
                backgroundColor: colors[item.status],
              }}
            />

            <span className="small text-muted">
              {item.label}
            </span>

            <span className="small fw-semibold">
              {item.count}
            </span>
          </div>
        ))}
      </div>

      <div className="text-center small text-muted mt-3">
        {total} commesse complessive
      </div>
    </div>
  );
}