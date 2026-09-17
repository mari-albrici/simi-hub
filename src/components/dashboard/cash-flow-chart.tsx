import type { CashFlowPoint } from "@/types";
import { formatCurrencyEUR } from "@/lib/dashboard-helpers";
import { DashboardEmptyState } from "./dashboard-empty-state";

const CHART_HEIGHT = 160;
const BAR_AREA_HEIGHT = CHART_HEIGHT - 24;

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const hasValues = data.some((point) => point.inflow !== 0 || point.outflow !== 0);

  if (!hasValues) {
    return <DashboardEmptyState message="Nessun incasso o pagamento previsto nei prossimi 90 giorni." />;
  }

  const max = Math.max(1, ...data.flatMap((point) => [point.inflow, point.outflow]));

  return (
    <div>
      <div className="d-flex gap-4 mb-3 small text-muted">
        <span>
          <span className="d-inline-block rounded-1 me-1" style={{ width: 10, height: 10, background: "var(--simi-success)" }} />
          Entrate previste
        </span>
        <span>
          <span className="d-inline-block rounded-1 me-1" style={{ width: 10, height: 10, background: "var(--simi-danger)" }} />
          Uscite previste
        </span>
      </div>
      <div className="d-flex align-items-end gap-2" style={{ height: CHART_HEIGHT }}>
        {data.map((point) => (
          <div key={point.label} className="d-flex flex-column align-items-center flex-fill">
            <div className="d-flex align-items-end gap-1" style={{ height: BAR_AREA_HEIGHT }}>
              <div
                title={`Entrate: ${formatCurrencyEUR(point.inflow)}`}
                style={{
                  width: 18,
                  height: Math.max(2, (point.inflow / max) * BAR_AREA_HEIGHT),
                  background: "var(--simi-success)",
                  borderRadius: 3,
                }}
              />
              <div
                title={`Uscite: ${formatCurrencyEUR(point.outflow)}`}
                style={{
                  width: 18,
                  height: Math.max(2, (point.outflow / max) * BAR_AREA_HEIGHT),
                  background: "var(--simi-danger)",
                  borderRadius: 3,
                }}
              />
            </div>
            <div className="small text-muted mt-2 text-center">{point.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
