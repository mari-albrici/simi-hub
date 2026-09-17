import type { FinancialBucket } from "@/types";
import { formatCurrencyEUR } from "@/lib/dashboard-helpers";

type FinancialSummaryProps = {
  title: string;
  bucket: FinancialBucket;
};

export function FinancialSummary({ title, bucket }: FinancialSummaryProps) {
  return (
    <div>
      <h3 className="h6 text-uppercase text-muted mb-3">{title}</h3>
      <dl className="row mb-0">
        <dt className="col-7">Totale aperto</dt>
        <dd className="col-5 text-end fw-semibold">{formatCurrencyEUR(bucket.totalOpen)}</dd>

        <dt className="col-7 text-muted small">Entro 7 giorni</dt>
        <dd className="col-5 text-end small">{formatCurrencyEUR(bucket.dueSoon7)}</dd>

        <dt className="col-7 text-muted small">Entro 30 giorni</dt>
        <dd className="col-5 text-end small">{formatCurrencyEUR(bucket.dueSoon30)}</dd>

        <dt className="col-7 text-danger">Scaduto</dt>
        <dd className="col-5 text-end text-danger fw-semibold">{formatCurrencyEUR(bucket.overdue)}</dd>
      </dl>
    </div>
  );
}
