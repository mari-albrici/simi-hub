import Link from "next/link";
import { getDashboardData } from "@/lib/dashboard";
import { getSessionUser } from "@/lib/session";
import { formatCurrencyEUR } from "@/lib/dashboard-helpers";
import { DashboardKpiCard } from "@/components/dashboard/kpi-card";
import { AttentionList } from "@/components/dashboard/attention-list";
import { UpcomingDeadlines } from "@/components/dashboard/upcoming-deadlines";
import { FinancialSummary } from "@/components/dashboard/financial-summary";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { ProjectsAttentionList } from "@/components/dashboard/projects-attention-list";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";

export default async function DashboardPage() {
  const [data, sessionUser] = await Promise.all([getDashboardData(), getSessionUser()]);
  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const firstName = sessionUser?.name?.split(" ")[0];

  return (
    <>
      <div className="d-flex justify-content-between align-items-start gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="h1 mb-1">Dashboard</h1>         
        </div>
        <div className="text-muted small text-capitalize">{today}</div>
      </div>

      {!data.configured ? (
        <div className="app-card p-4 mb-4">
          <DashboardEmptyState message="Connessione a Supabase non configurata: collega il database per visualizzare i dati amministrativi." />
        </div>
      ) : data.error ? (
        <div className="app-card p-4 mb-4">
          <DashboardEmptyState message="Non è stato possibile caricare alcuni dati della dashboard. Riprova più tardi." />
        </div>
      ) : null}

      <div className="row g-3 mb-4">
        <div className="col-md-6 col-xl-4 col-xxl-2">
          <DashboardKpiCard
            label="Da pagare"
            value={formatCurrencyEUR(data.kpis.payable.amount)}
            sublabel={`${data.kpis.payable.count} fatture`}
            tone="primary"
            href="/fatture?type=purchase&status=open"
          />
        </div>
        <div className="col-md-6 col-xl-4 col-xxl-2">
          <DashboardKpiCard
            label="Da incassare"
            value={formatCurrencyEUR(data.kpis.receivable.amount)}
            sublabel={`${data.kpis.receivable.count} fatture`}
            tone="primary"
            href="/fatture?type=sale&status=open"
          />
        </div>
        <div className="col-md-6 col-xl-4 col-xxl-2">
          <DashboardKpiCard
            label="Scaduto fornitori"
            value={formatCurrencyEUR(data.kpis.payableOverdue.amount)}
            sublabel={`${data.kpis.payableOverdue.count} fatture`}
            tone={data.kpis.payableOverdue.count > 0 ? "danger" : "secondary"}
            href="/fatture?type=purchase&status=overdue"
          />
        </div>
        <div className="col-md-6 col-xl-4 col-xxl-2">
          <DashboardKpiCard
            label="Scaduto clienti"
            value={formatCurrencyEUR(data.kpis.receivableOverdue.amount)}
            sublabel={`${data.kpis.receivableOverdue.count} fatture`}
            tone={data.kpis.receivableOverdue.count > 0 ? "danger" : "secondary"}
            href="/fatture?type=sale&status=overdue"
          />
        </div>
        <div className="col-md-6 col-xl-4 col-xxl-2">
          <DashboardKpiCard
            label="Scadenze prossimi 7 giorni"
            value={String(data.kpis.deadlinesNext7)}
            tone={data.kpis.deadlinesNext7 > 0 ? "warning" : "secondary"}
            href="/scadenze"
          />
        </div>
        <div className="col-md-6 col-xl-4 col-xxl-2">
          <DashboardKpiCard
            label="Anomalie"
            value={String(data.kpis.anomalies)}
            tone={data.kpis.anomalies > 0 ? "warning" : "secondary"}
            href="/fatture?status=anomaly"
          />
        </div>
      </div>

      <div className="app-card p-3 mb-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="h5 mb-0">Attività che richiedono attenzione</h2>
          <Link href="/scadenze" className="btn btn-sm btn-outline-secondary">
            Mostra tutte →
          </Link>
        </div>
        <AttentionList items={data.attentionItems} />
      </div>

      <div className="row g-4 mb-4">
        <div className="col-xl-7">
          <div className="app-card p-3 h-100">
            <h2 className="h5 mb-3">Prossime scadenze</h2>
            <UpcomingDeadlines items={data.upcomingDeadlines} />
          </div>
        </div>
        <div className="col-xl-5">
          <div className="app-card p-3 h-100">
            <h2 className="h5 mb-3">Flusso di cassa previsto — 90 giorni</h2>
            <CashFlowChart data={data.cashFlow} />
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <div className="app-card p-3 h-100">
            <FinancialSummary title="Fornitori" bucket={data.supplierSummary} />
          </div>
        </div>
        <div className="col-lg-6">
          <div className="app-card p-3 h-100">
            <FinancialSummary title="Clienti" bucket={data.customerSummary} />
          </div>
        </div>
      </div>

      <div className="app-card p-3">
        <h2 className="h5 mb-3">Commesse che richiedono attenzione</h2>
        <ProjectsAttentionList projects={data.projectsAttention} />
      </div>
    </>
  );
}
