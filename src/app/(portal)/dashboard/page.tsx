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
        .map(([currency, amount]) => formatMoney(amount, currency))
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

  const totalInflow = data.cashFlow.slice(1).reduce(
    (sum, point) => sum + point.inflow,
    0
  );

  const totalOutflow = data.cashFlow.slice(1).reduce(
    (sum, point) => sum + point.outflow,
    0
  );

  const expectedBalance = totalInflow - totalOutflow;


  return (
    <>
      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="dashboard-header mb-4">
        <div>
          <div className="dashboard-eyebrow mb-1">
            PANORAMICA GENERALE
          </div>

          <h1 className="dashboard-title mb-1">
            Dashboard
          </h1>

          <p className="text-muted mb-0">
            Situazione amministrativa, finanziaria e operativa
          </p>
        </div>
      </div>

      {!data.configured ? (
        <div className="app-card p-4 mb-4">
          <DashboardEmptyState message="Connessione a Supabase non configurata: collega il database per visualizzare i dati amministrativi." />
        </div>
      ) : data.error ? (
        <div className="app-card p-4 mb-4">
          <DashboardEmptyState message="Non è stato possibile caricare alcuni dati della dashboard." />
        </div>
      ) : null}


      {/* =====================================================
          KPI
      ====================================================== */}

      <section className="mb-5">
        <div className="row g-3">

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
              label="Scadenze scadute"
              value={String(data.kpis.deadlinesOverdue)}
              sublabel="Non completate, incluse quelle finanziarie"
              tone={data.kpis.deadlinesOverdue > 0 ? "danger" : "secondary"}
              href="/scadenze?period=overdue"
            />
          </div>

          <div className="col-sm-6 col-xl-3">
            <div className="app-card p-3 h-100">
              <h2 className="h6">Richiede attenzione</h2>
              <dl className="mb-0">
                <div className="d-flex justify-content-between gap-2"><dt className="fw-normal"><Link href="/attivita?view=mine">Le mie attività aperte</Link></dt><dd>{work.taskCount}</dd></div>
                <div className="d-flex justify-content-between gap-2"><dt className="fw-normal"><Link href="/anomalie?view=open">Anomalie aperte</Link></dt><dd>{work.anomalyCount}</dd></div>
                <div className="d-flex justify-content-between gap-2"><dt className="fw-normal"><Link href="/scadenze?period=7">Scadenze oggi / entro 7 giorni</Link></dt><dd>{data.kpis.deadlinesNext7}</dd></div>
              </dl>
            </div>
          </div>

        </div>
      </section>


      {/* =====================================================
          FINANZE
      ====================================================== */}

      <section className="mb-5">
        <p className="small text-muted">Grafico e riepiloghi finanziari: solo EUR, senza conversioni. I KPI Da pagare / Da incassare distinguono le valute.</p>
        {data.otherCurrencies.length > 0 && <p className="alert alert-info py-2">Importi in {data.otherCurrencies.join(", ")} esclusi dal grafico e dai riepiloghi EUR.</p>}
        {data.undatedCount > 0 && <p className="small text-muted">{data.undatedCount} posizioni finanziarie aperte senza data: incluse nei KPI, escluse dal cash flow temporale.</p>}

        <div className="dashboard-section-heading">
          <div>
            <h2 className="dashboard-section-title">
              Panoramica finanziaria
            </h2>

            <p className="dashboard-section-subtitle">
              Flussi previsti e posizioni che richiedono attenzione
            </p>
          </div>

          <Link
            href="/scadenze"
            className="dashboard-section-link"
          >
            Gestisci scadenze
            <i className="bi bi-arrow-right ms-2" />
          </Link>
        </div>


        <div className="row g-4">

          {/* CASH FLOW */}

          <div className="col-xl-9">

            <div className="app-card dashboard-feature-card h-100">

              <div className="dashboard-card-header">
                <div>
                  <div className="dashboard-card-eyebrow">
                    CASH FLOW
                  </div>

                  <h3 className="dashboard-card-title">
                    Flusso di cassa previsto
                  </h3>
                </div>

                <span className="dashboard-period-badge">
                  EUR · Scaduto e prossimi 90 giorni
                </span>
              </div>


              {/* TOTALI */}

              <div className="dashboard-financial-metrics">

                <div className="dashboard-financial-metric">
                  <span className="dashboard-metric-dot dashboard-dot-success" />

                  <div>
                    <div className="dashboard-metric-label">
                      Entrate nei prossimi 90 giorni
                    </div>

                    <div className="dashboard-metric-value">
                      {formatCurrencyEUR(totalInflow)}
                    </div>
                  </div>
                </div>


                <div className="dashboard-financial-metric">
                  <span className="dashboard-metric-dot dashboard-dot-danger" />

                  <div>
                    <div className="dashboard-metric-label">
                      Uscite nei prossimi 90 giorni
                    </div>

                    <div className="dashboard-metric-value">
                      {formatCurrencyEUR(totalOutflow)}
                    </div>
                  </div>
                </div>


                <div className="dashboard-financial-metric">
                  <div>
                    <div className="dashboard-metric-label">
                      Saldo nei prossimi 90 giorni
                    </div>

                    <div
                      className={`dashboard-metric-value ${
                        expectedBalance >= 0
                          ? "text-success"
                          : "text-danger"
                      }`}
                    >
                      {expectedBalance > 0 ? "+" : ""}
                      {formatCurrencyEUR(expectedBalance)}
                    </div>
                  </div>
                </div>

              </div>


              <div className="dashboard-chart-area">
                <CashFlowChart data={data.cashFlow} />
              </div>

            </div>

          </div>


          {/* SCADUTO */}

          <div className="col-xl-3">

            <div
              className={`app-card dashboard-overdue-card h-100 ${
                totalOverdue > 0
                  ? "dashboard-overdue-card-active"
                  : ""
              }`}
            >

              <div className="dashboard-overdue-icon">
                <i className="bi bi-exclamation-lg" />
              </div>

              <div className="dashboard-card-eyebrow">
                DA CONTROLLARE
              </div>

              <h3 className="dashboard-card-title mb-4">
                Scaduto
              </h3>


              <div className="dashboard-overdue-block">

                <div className="dashboard-overdue-label">
                  Da pagare
                </div>

                <div className="dashboard-overdue-value">
                  {kpiValue(data.kpis.payableOverdue)}
                </div>

                <div className="dashboard-overdue-meta">
                  {data.kpis.payableOverdue.count} posizioni
                </div>

              </div>


              <div className="dashboard-overdue-divider" />


              <div className="dashboard-overdue-block">

                <div className="dashboard-overdue-label">
                  Da incassare
                </div>

                <div className="dashboard-overdue-value">
                  {kpiValue(data.kpis.receivableOverdue)}
                </div>

                <div className="dashboard-overdue-meta">
                  {data.kpis.receivableOverdue.count} posizioni
                </div>

              </div>


              <div className="mt-auto d-flex flex-column gap-2">
                <Link href="/scadenze?kind=payment&status=overdue" className="dashboard-card-action">Pagamenti scaduti</Link>
                <Link href="/scadenze?kind=receipt&status=overdue" className="dashboard-card-action">Incassi scaduti</Link>
              </div>

            </div>

          </div>

        </div>

      </section>


      {/* =====================================================
          COMMESSE
      ====================================================== */}

      <section className="mb-5">

        <div className="dashboard-section-heading">

          <div>
            <h2 className="dashboard-section-title">
              Commesse
            </h2>

            <p className="dashboard-section-subtitle">
              Stato generale e situazioni da verificare
            </p>
          </div>

          <Link
            href="/commesse"
            className="dashboard-section-link"
          >
            Tutte le commesse
            <i className="bi bi-arrow-right ms-2" />
          </Link>

        </div>


        <div className="row g-4">

          <div className="col-xl-4">

            <div className="app-card dashboard-standard-card h-100">

              <div className="dashboard-card-header">

                <div>
                  <div className="dashboard-card-eyebrow">
                    PORTAFOGLIO
                  </div>

                  <h3 className="dashboard-card-title">
                    Stato commesse
                  </h3>
                </div>

              </div>

              <ProjectsStatusChart
                data={data.projectStatus}
              />

            </div>

          </div>


          <div className="col-xl-8">

            <div className="app-card dashboard-standard-card h-100">

              <div className="dashboard-card-header">

                <div>
                  <div className="dashboard-card-eyebrow">
                    ATTENZIONE
                  </div>

                  <h3 className="dashboard-card-title">
                    Commesse da controllare
                  </h3>

                  <p className="dashboard-card-description">
                    Fatture, documenti e scadenze che richiedono verifica
                  </p>
                </div>

              </div>

              <ProjectsAttentionList
                projects={data.projectsAttention}
              />

            </div>

          </div>

        </div>

      </section>


      {/* =====================================================
          DA GESTIRE
      ====================================================== */}

      <section className="mb-5">

        <div className="dashboard-section-heading">

          <div>
            <div className="d-flex align-items-center gap-2">

              <h2 className="dashboard-section-title mb-0">
                Richiede attenzione
              </h2>



            </div>

            <p className="dashboard-section-subtitle">
              Priorità operative e prossime scadenze
            </p>
          </div>

        </div>


        <div className="row g-4">

          {/* SCADENZE */}

          <div className="col-xl-5">

            <div className="app-card dashboard-standard-card h-100">

              <div className="dashboard-card-header">

                <div>
                  <div className="dashboard-card-eyebrow">
                    CALENDARIO
                  </div>

                  <h3 className="dashboard-card-title">
                    Scadenze oggi / entro 30 giorni
                  </h3>
                </div>

                <Link
                  href="/scadenze?period=30"
                  className="dashboard-card-link"
                >
                  Vedi tutte
                </Link>

              </div>

              <UpcomingDeadlines
                items={data.upcomingDeadlines}
              />

            </div>

          </div>


          {/* ATTIVITÀ */}

          <div className="col-xl-7">

            <div className="app-card dashboard-standard-card h-100">

              <div className="dashboard-card-header">

                <div>

                  <div className="dashboard-card-eyebrow">
                    PRIORITÀ
                  </div>

                  <div className="d-flex align-items-center gap-2">

                    <h3 className="dashboard-card-title mb-0">
                      Richiede attenzione
                    </h3>



                  </div>

                </div>

                <Link
                  href="/attivita?view=mine"
                  className="dashboard-card-link"
                >
                  Le mie attività
                </Link>

              </div>

              <WorkAttention data={work} />

            </div>

          </div>

        </div>

      </section>


      {/* =====================================================
          SITUAZIONE CONTABILE
      ====================================================== */}

      <section>

        <div className="dashboard-section-heading">

          <div>
            <h2 className="dashboard-section-title">
              Situazione contabile
            </h2>

            <p className="dashboard-section-subtitle">
              Posizioni aperte clienti e fornitori
            </p>
          </div>

        </div>


        <div className="row g-4">

          <div className="col-lg-6">

            <div className="app-card dashboard-accounting-card h-100">

              <div className="dashboard-card-eyebrow mb-3">
                FORNITORI · EUR
              </div>

              <FinancialSummary
                title=""
                bucket={data.supplierSummary}
                settled={data.paidEUR}
              />

            </div>

          </div>


          <div className="col-lg-6">

            <div className="app-card dashboard-accounting-card h-100">

              <div className="dashboard-card-eyebrow mb-3">
                CLIENTI · EUR
              </div>

              <FinancialSummary
                title=""
                bucket={data.customerSummary}
                settled={data.receivedEUR}
              />

            </div>

          </div>

        </div>

      </section>
    </>
  );
}