import Link from "@/components/ui/app-link";

import {
  getPayrollLegalEntities,
  getPayrollRuns,
  type PayrollRunStatus,
} from "@/lib/payroll";

import { requirePagePermission } from "@/lib/permissions";

type PageProps = {
  searchParams: Promise<{
    legal_entity_id?: string;
    year?: string;
    status?: string;
    success?: string;
    error?: string;
    error_kind?: string;
  }>;
};

const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

const STATUS_LABELS: Record<
  PayrollRunStatus,
  string
> = {
  draft: "Bozza",
  imported: "Importata",
  review: "In revisione",
  reconciled: "Riconciliata",
  closed: "Chiusa",
  reopened: "Riaperta",
};

function statusBadgeClass(
  status: PayrollRunStatus,
) {
  switch (status) {
    case "closed":
      return "text-bg-success";

    case "reconciled":
      return "text-bg-primary";

    case "review":
      return "text-bg-warning";

    case "reopened":
      return "text-bg-danger";

    case "imported":
      return "text-bg-info";

    case "draft":
    default:
      return "text-bg-secondary";
  }
}

function formatCurrency(
  value: number,
  currency = "EUR",
) {
  return new Intl.NumberFormat(
    "it-IT",
    {
      style: "currency",
      currency,
    },
  ).format(value);
}

function validStatus(
  value: string | undefined,
): PayrollRunStatus | undefined {
  if (
    value === "draft" ||
    value === "imported" ||
    value === "review" ||
    value === "reconciled" ||
    value === "closed" ||
    value === "reopened"
  ) {
    return value;
  }

  return undefined;
}

export default async function PayrollPage({
  searchParams,
}: PageProps) {
  await requirePagePermission(
  "payroll.summary.read",
);

  const params = await searchParams;

  const selectedYear =
    params.year &&
    /^\d{4}$/.test(params.year)
      ? Number(params.year)
      : undefined;

  const selectedStatus =
    validStatus(params.status);

  const [
    runs,
    legalEntities,
  ] = await Promise.all([
    getPayrollRuns({
      legal_entity_id:
        params.legal_entity_id ||
        undefined,

      year:
        selectedYear,

      status:
        selectedStatus,
    }),

    getPayrollLegalEntities(),
  ]);

  const now = new Date();
  const currentYear =
    now.getFullYear();

  const availableYears =
    Array.from(
      new Set([
        currentYear + 1,
        currentYear,
        currentYear - 1,
        currentYear - 2,
        ...runs.map(
          (run) => run.year,
        ),
      ]),
    ).sort((a, b) => b - a);

  const totalEmployeeCost =
    runs.reduce(
      (sum, run) =>
        sum +
        run.total_employee_cost,
      0,
    );

  const totalNet =
    runs.reduce(
      (sum, run) =>
        sum + run.total_net,
      0,
    );

  const closedRuns =
    runs.filter(
      (run) =>
        run.status === "closed",
    ).length;

  const attentionRuns =
    runs.filter(
      (run) =>
        run.status === "review" ||
        run.status === "reopened",
    ).length;

  return (
    <div className="container-fluid py-4">
      <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1">
            Paghe
          </h1>

          <p className="text-muted mb-0">
            Elaborazioni mensili,
            costi del personale e
            riconciliazione contabile.
          </p>
        </div>

        <div className="d-flex flex-wrap gap-2">
          <Link
            href="/paghe/tfr"
            className="btn btn-outline-secondary"
          >
            <i
              className="bi bi-wallet2 me-2"
              aria-hidden="true"
            />
            TFR
          </Link>

          <Link
            href="/paghe/prestiti"
            className="btn btn-outline-secondary"
          >
            <i
              className="bi bi-cash-coin me-2"
              aria-hidden="true"
            />
            Prestiti / Cessioni
          </Link>

          <Link
            href="/paghe/new"
            className="btn btn-primary"
          >
            <i
              className="bi bi-plus-lg me-2"
              aria-hidden="true"
            />
            Nuova elaborazione
          </Link>
        </div>
      </div>

      {params.success && (
        <div
          className="alert alert-success"
          role="alert"
        >
          {params.success}
        </div>
      )}

      {params.error && (
        <div
          className="alert alert-danger"
          role="alert"
        >
          {params.error}
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Elaborazioni
              </div>

              <div className="fs-3 fw-semibold">
                {runs.length}
              </div>

              <div className="small text-muted">
                {closedRuns} chiuse
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Costo del personale
              </div>

              <div className="fs-4 fw-semibold">
                {formatCurrency(
                  totalEmployeeCost,
                )}
              </div>

              <div className="small text-muted">
                Elaborazioni visualizzate
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Netto retribuzioni
              </div>

              <div className="fs-4 fw-semibold">
                {formatCurrency(
                  totalNet,
                )}
              </div>

              <div className="small text-muted">
                Elaborazioni visualizzate
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Da controllare
              </div>

              <div className="fs-3 fw-semibold">
                {attentionRuns}
              </div>

              <div className="small text-muted">
                In revisione o riaperte
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-body">
          <form
            method="get"
            className="row g-3 align-items-end"
          >
            <div className="col-12 col-md-4">
              <label
                htmlFor="payroll-entity"
                className="form-label"
              >
                Società
              </label>

              <select
                id="payroll-entity"
                name="legal_entity_id"
                className="form-select"
                defaultValue={
                  params.legal_entity_id ??
                  ""
                }
              >
                <option value="">
                  Tutte le società
                </option>

                {legalEntities.map(
                  (entity) => (
                    <option
                      key={entity.id}
                      value={entity.id}
                    >
                      {entity.code} —{" "}
                      {entity.business_name}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="col-6 col-md-2">
              <label
                htmlFor="payroll-year"
                className="form-label"
              >
                Anno
              </label>

              <select
                id="payroll-year"
                name="year"
                className="form-select"
                defaultValue={
                  params.year ?? ""
                }
              >
                <option value="">
                  Tutti
                </option>

                {availableYears.map(
                  (year) => (
                    <option
                      key={year}
                      value={year}
                    >
                      {year}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="col-6 col-md-3">
              <label
                htmlFor="payroll-status"
                className="form-label"
              >
                Stato
              </label>

              <select
                id="payroll-status"
                name="status"
                className="form-select"
                defaultValue={
                  selectedStatus ?? ""
                }
              >
                <option value="">
                  Tutti gli stati
                </option>

                {Object.entries(
                  STATUS_LABELS,
                ).map(
                  ([value, label]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="col-12 col-md-3">
              <div className="d-flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary flex-grow-1"
                >
                  Filtra
                </button>

                <Link
                  href="/paghe"
                  className="btn btn-outline-secondary"
                >
                  Azzera
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header bg-body d-flex align-items-center justify-content-between">
          <div>
            <h2 className="h5 mb-0">
              Elaborazioni
            </h2>
          </div>

          <span className="text-muted small">
            {runs.length} risultati
          </span>
        </div>

        {runs.length === 0 ? (
          <div className="card-body py-5 text-center">
            <i
              className="bi bi-calculator fs-1 text-muted"
              aria-hidden="true"
            />

            <h3 className="h5 mt-3">
              Nessuna elaborazione
            </h3>

            <p className="text-muted mb-3">
              Non ci sono elaborazioni
              paghe corrispondenti ai
              filtri selezionati.
            </p>

            <Link
              href="/paghe/new"
              className="btn btn-primary"
            >
              Crea la prima elaborazione
            </Link>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Società</th>
                  <th>Paese</th>
                  <th>Stato</th>

                  <th className="text-end">
                    Dipendenti
                  </th>

                  <th className="text-end">
                    Costo
                  </th>

                  <th className="text-end">
                    Netto
                  </th>

                  <th className="text-end">
                    Quadratura
                  </th>

                  <th
                    className="text-end"
                    aria-label="Azioni"
                  />
                </tr>
              </thead>

              <tbody>
                {runs.map((run) => {
                  const accountingBalanced =
                    Math.abs(
                      run.difference,
                    ) <= 0.01;

                  return (
                    <tr key={run.id}>
                      <td>
                        <div className="fw-semibold">
                          {
                            MONTHS[
                              run.month -
                                1
                            ]
                          }{" "}
                          {run.year}
                        </div>
                      </td>

                      <td>
                        <div className="fw-medium">
                          {
                            run.legal_entity_name
                          }
                        </div>

                        <div className="small text-muted">
                          {
                            run.legal_entity_code
                          }
                        </div>
                      </td>

                      <td>
                        <span className="badge text-bg-light border">
                          {run.country}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`badge ${statusBadgeClass(
                            run.status,
                          )}`}
                        >
                          {
                            STATUS_LABELS[
                              run.status
                            ]
                          }
                        </span>
                      </td>

                      <td className="text-end">
                        {run.employee_count}
                      </td>

                      <td className="text-end">
                        {formatCurrency(
                          run.total_employee_cost,
                          run.currency,
                        )}
                      </td>

                      <td className="text-end">
                        {formatCurrency(
                          run.total_net,
                          run.currency,
                        )}
                      </td>

                      <td className="text-end">
                        {run.status ===
                        "closed" ? (
                          accountingBalanced ? (
                            <span className="text-success">
                              <i
                                className="bi bi-check-circle-fill me-1"
                                aria-hidden="true"
                              />
                              Quadrata
                            </span>
                          ) : (
                            <span className="text-danger">
                              <i
                                className="bi bi-exclamation-triangle-fill me-1"
                                aria-hidden="true"
                              />
                              {formatCurrency(
                                run.difference,
                                run.currency,
                              )}
                            </span>
                          )
                        ) : (
                          <span className="text-muted">
                            —
                          </span>
                        )}
                      </td>

                      <td className="text-end">
                        <Link
                          href={`/paghe/${run.id}`}
                          className="btn btn-sm btn-outline-secondary"
                          aria-label={`Apri elaborazione ${MONTHS[run.month - 1]} ${run.year}`}
                        >
                          <i
                            className="bi bi-chevron-right"
                            aria-hidden="true"
                          />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}