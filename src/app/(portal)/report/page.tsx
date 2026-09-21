import Link from "@/components/ui/app-link";
import { formatMoney } from "@/lib/formatters";
import { requirePagePermission } from "@/lib/permissions";
import { getReportSummary } from "@/lib/data";

export default async function ReportPage() {
  await requirePagePermission("report.read");
  const summary = await getReportSummary();

  return (
    <>
     <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div>
          <h1 className="h3 mb-1">Report</h1>
          <p className="text-muted mb-0">Report amministrativi e indicatori sintetici.</p>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-3">
          <div className="app-card p-3 h-100">
            <h2 className="h6">Commesse attive</h2>
            <div className="fs-3 fw-bold">{summary.activeProjects}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="app-card p-3 h-100">
            <h2 className="h6">Importi nominali fatture</h2>
            {summary.invoiceAmounts.map(row => <div key={`${row.type}-${row.currency}`}><span>{row.type === "purchase" ? "Acquisti" : "Vendite"} · {row.currency}: </span><strong>{formatMoney(row.amount,row.currency)}</strong></div>)}
            {!summary.invoiceAmounts.length && <p className="mb-0">Nessuna fattura.</p>}
            <p className="small text-muted mb-0 mt-2">Documenti non archiviati, incluse rettifiche negative. Importi totali, non residui; nessuna conversione valutaria.</p>
          </div>
        </div>
        <div className="col-md-3">
          <div className="app-card p-3 h-100">
            <h2 className="h6">Documenti</h2>
            <div className="fs-3 fw-bold">{summary.documentsCount}</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="app-card p-3 h-100">
            <h2 className="h6"><Link href="/scadenze?status=open">Scadenze aperte</Link></h2>
            <div className="fs-3 fw-bold">{summary.openDeadlines}</div>
          </div>
        </div>
      </div>
    </>
  );
}
