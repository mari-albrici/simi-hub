"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { FinancialBalancePoint } from "@/lib/dashboard";
import { formatCurrencyEUR } from "@/lib/dashboard-helpers";
import { DashboardEmptyState } from "./dashboard-empty-state";

export function FinancialBalanceChart({
  data,
}: {
  data: FinancialBalancePoint[];
}) {
  const hasValues = data.some(
    (point) => point.balance !== 0
  );

  if (!hasValues) {
    return (
      <DashboardEmptyState message="Nessun saldo finanziario previsto nei prossimi 90 giorni." />
    );
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 10,
            right: 10,
            left: 0,
            bottom: 0,
          }}
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

          <ReferenceLine
            y={0}
            stroke="var(--bs-border-color)"
          />

          <Tooltip
            formatter={(value) => [
              formatCurrencyEUR(Number(value)),
              "Saldo previsto",
            ]}
          />

          <Bar
            dataKey="balance"
            name="Saldo previsto"
            radius={[5, 5, 0, 0]}
            maxBarSize={52}
          >
            {data.map((entry) => (
              <Cell
                key={entry.label}
                fill={
                  entry.balance >= 0
                    ? "var(--simi-success)"
                    : "var(--simi-danger)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}