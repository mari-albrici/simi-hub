"use client";

import { useState } from "react";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
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
    data.find((item) => item.label === "Attive")?.count ?? 0;

  const colors: Record<string, string> = {
    active: "#198754",
    draft: "#adb5bd",
  };

  const [hoveredItem, setHoveredItem] =
    useState<ProjectStatusPoint | null>(null);

  if (total === 0) {
    return (
      <DashboardEmptyState message="Nessuna commessa disponibile." />
    );
  }

  return (
    <div className="position-relative">

      {/* TOOLTIP ESTERNO */}

      <div
        className={`project-chart-tooltip ${
          hoveredItem ? "project-chart-tooltip-visible" : ""
        }`}
      >
        {hoveredItem && (
          <>
            <div className="project-chart-tooltip-label">
              {hoveredItem.label}
            </div>

            <div className="project-chart-tooltip-value">
              {hoveredItem.count}{" "}
              {hoveredItem.count === 1
                ? "commessa"
                : "commesse"}
            </div>
          </>
        )}
      </div>


      {/* DONUT */}

      <div
        className="position-relative"
        style={{ height: 220 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius="66%"
              outerRadius="90%"
              paddingAngle={3}
              stroke="none"
              onMouseEnter={(_, index) => {
                setHoveredItem(data[index]);
              }}
              onMouseLeave={() => {
                setHoveredItem(null);
              }}
            >
              {data.map((item) => (
                <Cell
                  key={item.status}
                  fill={colors[item.status]}
                  style={{
                    cursor: "pointer",
                  }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>


        {/* CENTRO */}

        <div
          className="position-absolute top-50 start-50 translate-middle text-center"
          style={{
            pointerEvents: "none",
          }}
        >
          <div
            className="fw-bold lh-1"
            style={{
              fontSize: "2rem",
              letterSpacing: "-0.04em",
            }}
          >
            {active}
          </div>

          <div
            className="text-muted text-uppercase mt-1"
            style={{
              fontSize: "0.65rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
            }}
          >
            attive
          </div>
        </div>
      </div>


      {/* LEGENDA */}

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

    </div>
  );
}