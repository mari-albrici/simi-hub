"use client";

import type { CashFlowPoint } from "@/types";
import { formatCurrencyEUR } from "@/lib/dashboard-helpers";
import { DashboardEmptyState } from "./dashboard-empty-state";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function CashFlowChart({
  data,
}: {
  data: CashFlowPoint[];
}) {
  const hasValues = data.some(
    (point) =>
      point.inflow !== 0 ||
      point.outflow !== 0
  );

  if (!hasValues) {
    return (
      <DashboardEmptyState message="Nessun incasso o pagamento previsto nei prossimi 90 giorni." />
    );
  }

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 10,
            right: 10,
            left: 0,
            bottom: 0,
          }}
          barGap={6}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            opacity={0.2}
          />

          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            fontSize={12}
          />

          <YAxis
            axisLine={false}
            tickLine={false}
            fontSize={12}
            width={55}
            tickFormatter={(value) =>
              new Intl.NumberFormat("it-IT", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(Number(value))
            }
          />

          <Tooltip
            formatter={(value) =>
              formatCurrencyEUR(Number(value))
            }
          />

          <Legend
            iconType="circle"
            iconSize={8}
          />

          <Bar
            dataKey="inflow"
            name="Entrate previste"
            fill="var(--simi-success)"
            radius={[5, 5, 0, 0]}
            maxBarSize={42}
          />

          <Bar
            dataKey="outflow"
            name="Uscite previste"
            fill="var(--simi-danger)"
            radius={[5, 5, 0, 0]}
            maxBarSize={42}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}