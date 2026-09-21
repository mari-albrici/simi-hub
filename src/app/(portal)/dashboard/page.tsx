import { formatMoney } from "@/lib/formatters";
import { requirePagePermission } from "@/lib/permissions";
import Link from "@/components/ui/app-link";
import { getDashboardData } from "@/lib/dashboard";
import { formatCurrencyEUR } from "@/lib/dashboard-helpers";

import { DashboardKpiCard } from "@/components/dashboard/kpi-card";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { UpcomingDeadlines } from "@/components/dashboard/upcoming-deadlines";
import { FinancialSummary } from "@/components/dashboard/financial-summary";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { ProjectsStatusChart } from "@/components/dashboard/projects-status-chart";
import { FinancialBalanceChart } from "@/components/dashboard/financial-balance-chart";
import { ProjectsAttentionList } from "@/components/dashboard/projects-attention-list";

import { WorkAttention } from "@/components/work/dashboard-attention";
import { getWorkDashboard } from "@/lib/work/dashboard";

function kpiValue(kpi: {
  amount: number;
  currencies?: Record<string, number>;
}) {
  const values = Object.entries(kpi.currencies ?? {});

  return values.length
    ? values
        .map(([currency, amount]) =>
          formatMoney(amount, currency)
        )
        .join(" · ")
    : formatCurrencyEUR(0);
}

export default async function DashboardPage() {
  await requirePagePermission("dashboard.read");

  const [data, work] = await Promise.all([
    getDashboardData(),
    getWorkDashboard(),
  ]);

  const totalOverdue =
    data.kpis.payableOverdue.count +
    data.kpis.receivableOverdue.count;

  return (
    <>
      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="mb-4">
        <h1 className="h2 mb-1">Dashboard</h1>

        <p className="text-muted mb-0">
          Panoramica amministrativa e operativa
        </p>
      </div>


      {/* =====================================================
          STATO DATI
      ====================================================== */}

      {!data.configured ? (
        <div className="app-card p-4 mb-4">
          <DashboardEmptyState message="Connessione a Supabase non configurata: collega il database per visualizzare i dati amministrativi." />
        </div>
      ) : data.error ? (
        <div className="app-card p-4 mb-4">
          <DashboardEmptyState message="Non è stato possibile caricare alcuni dati della dashboard. Riprova più tardi." />
        </div>
      ) : null}


      {/* =====================================================
          KPI
      ====================================================== */}

      <div className="row g-3 mb-5">

        <div className="col-sm-6 col-xl-3">
          <DashboardKpiCard
            label="Da pagare"
            value={kpiValue(data.kpis.payable)}
            sublabel={`${data.kpis.payable.count} scadenze aperte`}
            tone="primary"
            href="/scadenze?kind=payment&status=open"
          />
        </div>

        <div className="col-sm-6 col-xl-3">
          <DashboardKpiCard
            label="Da incassare"
            value={kpiValue(data.kpis.receivable)}
            sublabel={`${data.kpis.receivable.count} scadenze aperte`}
            tone="primary"
            href="/scadenze?kind=receipt&status=open"
          />
        </div>

        <div className="col-sm-6 col-xl-3">
          <DashboardKpiCard
            label="Scaduto"
            value={String(totalOverdue)}
            sublabel={`${data.kpis.payableOverdue.count} fornitori · ${data.kpis.receivableOverdue.count} clienti`}
            tone={
              totalOverdue > 0
                ? "danger"
                : "secondary"
            }
            href="/scadenze?status=overdue"
          />
        </div>

        <div className="col-sm-6 col-xl-3">
          <DashboardKpiCard
            label="Prossimi 7 giorni"
            value={String(data.kpis.deadlinesNext7)}
            sublabel="scadenze in arrivo"
            tone={
              data.kpis.deadlinesNext7 > 0
                ? "warning"
                : "secondary"
            }
            href="/scadenze?period=7"
          />
        </div>

      </div>


      {/* =====================================================
          PANORAMICA FINANZIARIA
      ====================================================== */}

      <div className="mb-3">
        <h2 className="h4 mb-1">
          Panoramica finanziaria
        </h2>

        <p className="small text-muted mb-0">
          Entrate, uscite e situazione prevista
        </p>
      </div>


      <div className="row g-4 mb-5">

        {/* CASH FLOW */}

        <div className="col-xl-8">
          <div className="app-card p-4 h-100">

            <div className="mb-4">
              <h3 className="h5 mb-1">
                Flusso di cassa previsto
              </h3>

              <div className="small text-muted">
                Entrate e uscite previste nei prossimi 90 giorni
              </div>
            </div>

            <CashFlowChart data={data.cashFlow} />

          </div>
        </div>


        {/* SALDO */}

        <div className="col-xl-4">
          <div className="app-card p-4 h-100">

            <div className="mb-4">
              <h3 className="h5 mb-1">
                Saldo previsto
              </h3>

              <div className="small text-muted">
                Differenza tra entrate e uscite
              </div>
            </div>

            <FinancialBalanceChart
              data={data.financialBalance}
            />

          </div>
        </div>

      </div>


      {/* =====================================================
          SITUAZIONE COMMESSE
      ====================================================== */}

      <div className="mb-3">
        <h2 className="h4 mb-1">
          Situazione commesse
        </h2>

        <p className="small text-muted mb-0">
          Stato e criticità delle commesse
        </p>
      </div>


      <div className="row g-4 mb-5">

        {/* STATO COMMESSE */}

        <div className="col-xl-4">
          <div className="app-card p-4 h-100">

            <div className="d-flex justify-content-between align-items-start gap-3 mb-3">

              <div>
                <h3 className="h5 mb-1">
                  Commesse
                </h3>

                <div className="small text-muted">
                  Attive e bozze
                </div>
              </div>

              <Link
                href="/commesse"
                className="small text-decoration-none"
              >
                Vedi tutte
              </Link>

            </div>

            <ProjectsStatusChart
              data={data.projectStatus}
            />

          </div>
        </div>


        {/* COMMESSE DA CONTROLLARE */}

        <div className="col-xl-8">
          <div className="app-card p-4 h-100">

            <div className="d-flex justify-content-between align-items-start gap-3 mb-3">

              <div>
                <h3 className="h5 mb-1">
                  Commesse da controllare
                </h3>

                <div className="small text-muted">
                  Elementi che richiedono verifica
                </div>
              </div>

              <Link
                href="/commesse"
                className="small text-decoration-none"
              >
                Tutte le commesse
                <i
                  className="bi bi-arrow-right ms-1"
                  aria-hidden="true"
                />
              </Link>

            </div>

            <ProjectsAttentionList
              projects={data.projectsAttention}
            />

          </div>
        </div>

      </div>


      {/* =====================================================
          DA FARE
      ====================================================== */}

      <div className="mb-3">
        <h2 className="h4 mb-1">
          Da gestire
        </h2>

        <p className="small text-muted mb-0">
          Scadenze, attività e anomalie che richiedono attenzione
        </p>
      </div>


      <div className="row g-4 mb-5">

        {/* SCADENZE */}

        <div className="col-xl-5">
          <div className="app-card p-4 h-100">

            <div className="d-flex justify-content-between align-items-center gap-3 mb-3">

              <h3 className="h5 mb-0">
                Prossime scadenze
              </h3>

              <Link
                href="/scadenze"
                className="small text-decoration-none"
              >
                Vedi tutte
                <i
                  className="bi bi-arrow-right ms-1"
                  aria-hidden="true"
                />
              </Link>

            </div>

            <UpcomingDeadlines
              items={data.upcomingDeadlines}
            />

          </div>
        </div>


        {/* ATTIVITÀ */}

        <div className="col-xl-7">
          <div className="app-card p-4 h-100">

            <div className="d-flex justify-content-between align-items-center gap-3 mb-3">

              <div className="d-flex align-items-center gap-2">
                <h3 className="h5 mb-0">
                  Attività e anomalie
                </h3>

                {work.count > 0 && (
                  <span className="badge rounded-pill text-bg-warning">
                    {work.count}
                  </span>
                )}
              </div>

              <Link
                href="/attivita"
                className="small text-decoration-none"
              >
                Vedi tutte
              </Link>

            </div>

            <WorkAttention data={work} />

          </div>
        </div>

      </div>


      {/* =====================================================
          CLIENTI / FORNITORI
      ====================================================== */}

      <div className="mb-3">
        <h2 className="h4 mb-1">
          Situazione contabile
        </h2>

        <p className="small text-muted mb-0">
          Riepilogo delle posizioni aperte
        </p>
      </div>


      <div className="row g-4">

        <div className="col-lg-6">
          <div className="app-card p-4 h-100">
            <FinancialSummary
              title="Fornitori"
              bucket={data.supplierSummary}
            />
          </div>
        </div>

        <div className="col-lg-6">
          <div className="app-card p-4 h-100">
            <FinancialSummary
              title="Clienti"
              bucket={data.customerSummary}
            />
          </div>
        </div>

      </div>
    </>
  );
}