"use client";

import { useRef, useState, useTransition, Fragment } from "react";

import type {
  PayrollImportRecord,
  PayrollPdfImportResult,
} from "@/lib/payroll-import";

type Props = {
  payrollRunId: string;
  currency: string;
  imports: PayrollImportRecord[];
  disabled: boolean;
  importAction: (formData: FormData) => Promise<PayrollPdfImportResult>;
  validateAction: (formData: FormData) => Promise<void>;
  applyAction: (formData: FormData) => Promise<void>;
  cancelAction: (formData: FormData) => Promise<void>;
};

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function statusLabel(status: PayrollImportRecord["status"]) {
  switch (status) {
    case "draft":
      return "Da verificare";
    case "validated":
      return "Verificato";
    case "invalid":
      return "Con anomalie";
    case "applied":
      return "Applicato";
    case "cancelled":
      return "Annullato";
    default:
      return status;
  }
}

function statusClass(status: PayrollImportRecord["status"]) {
  switch (status) {
    case "validated":
    case "applied":
      return "text-bg-success";
    case "invalid":
      return "text-bg-danger";
    case "cancelled":
      return "text-bg-secondary";
    case "draft":
    default:
      return "text-bg-warning";
  }
}

export default function PayrollImportManager({
  payrollRunId,
  currency,
  imports,
  disabled,
  importAction,
  validateAction,
  applyAction,
  cancelAction,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<PayrollPdfImportResult | null>(null);

  function handleUpload(formData: FormData) {
    setResult(null);

    startTransition(async () => {
      const response = await importAction(formData);
      setResult(response);

      if (response.success) {
        formRef.current?.reset();
      }
    });
  }

  const preview = result?.success ? result.data : null;

  return (
    <div className="card mb-4" id="payroll-import">
      <div className="card-header bg-body">
        <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
          <div>
            <h2 className="h5 mb-1">Import cedolini</h2>

            <div className="small text-muted">
              Carica il PDF ufficiale del consulente. I dati vengono estratti e
              salvati in staging prima di essere applicati all&apos;elaborazione.
            </div>
          </div>

          <span className="badge text-bg-light border">
            {imports.length} import
          </span>
        </div>
      </div>

      {!disabled && (
        <div className="card-body border-bottom">
          <form
            ref={formRef}
            action={handleUpload}
            className="row g-3 align-items-end"
          >
            <input
              type="hidden"
              name="payroll_run_id"
              value={payrollRunId}
            />

            <div className="col-12 col-lg-8">
              <label
                className="form-label"
                htmlFor="payroll-import-file"
              >
                Cedolini PDF
              </label>

              <input
                id="payroll-import-file"
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                className="form-control"
                required
                disabled={isPending}
              />

              <div className="form-text">
                PDF massimo 10 MB. Sono supportati i layout ITA, FRA e LUX.
                Le pagine di periodi diversi dall&apos;elaborazione corrente
                vengono escluse.
              </div>
            </div>

            <div className="col-12 col-lg-4">
              <button
                type="submit"
                className="btn btn-primary w-100"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      aria-hidden="true"
                    />
                    Lettura cedolini…
                  </>
                ) : (
                  <>
                    <i
                      className="bi bi-file-earmark-arrow-up me-2"
                      aria-hidden="true"
                    />
                    Carica e analizza
                  </>
                )}
              </button>
            </div>
          </form>

          {isPending && (
            <div className="alert alert-light border mt-3 mb-0 small">
              <div className="d-flex align-items-center gap-2">
                <span
                  className="spinner-border spinner-border-sm"
                  aria-hidden="true"
                />

                <span>
                  Estrazione del testo e OCR delle pagine necessarie. Non
                  chiudere questa pagina.
                </span>
              </div>
            </div>
          )}

          {result && !result.success && (
            <div
              className="alert alert-danger mt-3 mb-0"
              role="alert"
            >
              <i
                className="bi bi-exclamation-triangle-fill me-2"
                aria-hidden="true"
              />
              {result.error}
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="card-body border-bottom">
          <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 mb-3">
            <div>
              <h3 className="h6 mb-1">Anteprima estrazione</h3>

              <div className="small text-muted">
                {preview.source_filename}
              </div>
            </div>

            <div className="d-flex flex-wrap gap-2">
              {preview.detected_countries.map((country) => (
                <span
                  key={country}
                  className="badge text-bg-light border"
                >
                  {country}
                </span>
              ))}
            </div>
          </div>

          <div className="row g-3 mb-3">
            <div className="col-6 col-lg-3">
              <div className="border rounded p-3 h-100">
                <div className="small text-muted">Pagine PDF</div>

                <div className="fs-5 fw-semibold">
                  {preview.pages_total}
                </div>
              </div>
            </div>

            <div className="col-6 col-lg-3">
              <div className="border rounded p-3 h-100">
                <div className="small text-muted">Importate</div>

                <div className="fs-5 fw-semibold text-success">
                  {preview.pages_imported}
                </div>
              </div>
            </div>

            <div className="col-6 col-lg-3">
              <div className="border rounded p-3 h-100">
                <div className="small text-muted">Escluse</div>

                <div className="fs-5 fw-semibold">
                  {preview.pages_skipped}
                </div>
              </div>
            </div>

            <div className="col-6 col-lg-3">
              <div className="border rounded p-3 h-100">
                <div className="small text-muted">Da verificare</div>

                <div className="fs-5 fw-semibold">
                  {
                    preview.rows.filter(
                      (row) =>
                        row.warnings.length > 0 ||
                        row.employee_id === null,
                    ).length
                  }
                </div>
              </div>
            </div>
          </div>

          <div className="table-responsive border rounded">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Pag.</th>
                  <th>Dipendente</th>
                  <th>Paese</th>
                  <th className="text-end">Lordo</th>
                  <th className="text-end">Netto</th>
                  <th className="text-end">Ore</th>
                  <th>Verifica</th>
                </tr>
              </thead>

              <tbody>
                {preview.rows.map((row) => {
                  const hasWarnings =
                    row.warnings.length > 0 ||
                    row.employee_id === null;

                  return (
  
  <Fragment key={`${row.page_number}-${row.employee_id ?? row.employee_code ?? row.employee_name ?? "unknown"}`}>
    
                      <tr
                        key={`${row.page_number}-${row.employee_name ?? "unknown"}`}
                      >
                        <td>{row.page_number}</td>

                        <td>
                          <div className="fw-semibold">
                            {row.employee_name ?? "Non rilevato"}
                          </div>

                          {row.employee_code && (
                            <div className="small text-muted">
                              {row.employee_code}
                            </div>
                          )}

                          <div
                            className={
                              row.employee_id
                                ? "small text-success"
                                : "small text-danger"
                            }
                          >
                            <i
                              className={`bi ${
                                row.employee_id
                                  ? "bi-check-circle-fill"
                                  : "bi-exclamation-triangle-fill"
                              } me-1`}
                              aria-hidden="true"
                            />

                            {row.employee_id
                              ? "Associato all'anagrafica"
                              : "Associazione da verificare"}
                          </div>
                        </td>

                        <td>
                          <span className="badge text-bg-light border">
                            {row.country}
                          </span>
                        </td>

                        <td className="text-end text-nowrap">
                          {formatCurrency(row.gross_salary, currency)}
                        </td>

                        <td className="text-end text-nowrap">
                          {formatCurrency(row.net_salary, currency)}
                        </td>

                        <td className="text-end">
                          {new Intl.NumberFormat("it-IT", {
                            maximumFractionDigits: 2,
                          }).format(row.worked_hours)}
                        </td>

                        <td style={{ minWidth: "260px" }}>
                          {hasWarnings ? (
                            <div className="d-flex flex-column gap-1">
                              {row.warnings.map((warning, index) => (
                                <div
                                  key={`${warning.code}-${index}`}
                                  className="small text-warning-emphasis"
                                >
                                  <i
                                    className="bi bi-exclamation-triangle me-1"
                                    aria-hidden="true"
                                  />
                                  {warning.message}
                                </div>
                              ))}

                              {row.employee_id === null &&
                                !row.warnings.some(
                                  (warning) =>
                                    warning.code ===
                                      "EMPLOYEE_NOT_MATCHED" ||
                                    warning.code ===
                                      "EMPLOYEE_MATCH_AMBIGUOUS",
                                ) && (
                                  <div className="small text-danger">
                                    Dipendente non associato.
                                  </div>
                                )}
                            </div>
                          ) : (
                            <span className="small text-success">
                              <i
                                className="bi bi-check-circle-fill me-1"
                                aria-hidden="true"
                              />
                              Nessuna anomalia rilevata
                            </span>
                          )}
                        </td>
                      </tr>

                      <tr
                        key={`${row.page_number}-${row.employee_name ?? "unknown"}-details`}
                        className="table-light"
                      >
                        <td />

                        <td colSpan={6}>
                          <div className="py-2">
                            <div className="small fw-semibold mb-2">
                              Dati estratti dal cedolino
                            </div>

                            <div className="row g-3">
                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  Imponibile contributivo
                                </div>
                                <div className="fw-medium">
                                  {formatCurrency(
                                    row.social_security_base,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  Contributi dipendente
                                </div>
                                <div className="fw-medium">
                                  {formatCurrency(
                                    row.employee_contributions,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  TFR mese
                                </div>
                                <div className="fw-medium">
                                  {formatCurrency(
                                    row.tfr_accrual,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  IRPEF
                                </div>
                                <div className="fw-medium">
                                  {formatCurrency(
                                    row.income_tax,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  Trasferte / rimborsi
                                </div>
                                <div className="fw-medium">
                                  {formatCurrency(
                                    row.reimbursements,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  Ferie
                                </div>
                                <div className="fw-medium">
                                  {formatCurrency(
                                    row.holidays,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  Malattia
                                </div>
                                <div className="fw-medium">
                                  {formatCurrency(
                                    row.sickness,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  Infortunio
                                </div>
                                <div className="fw-medium">
                                  {formatCurrency(
                                    row.accident,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  Altre competenze
                                </div>
                                <div className="fw-medium">
                                  {formatCurrency(
                                    row.other_earnings,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  Altre trattenute
                                </div>
                                <div className="fw-medium">
                                  {formatCurrency(
                                    row.other_deductions,
                                    currency,
                                  )}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  Ore lavorate
                                </div>
                                <div className="fw-medium">
                                  {formatNumber(row.worked_hours)}
                                </div>
                              </div>

                              <div className="col-6 col-md-4 col-xl-3">
                                <div className="small text-muted">
                                  Identificativo
                                </div>
                                <div className="fw-medium">
                                  {row.employee_identifier ?? "—"}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="alert alert-info small mt-3 mb-0">
            <i
              className="bi bi-info-circle me-2"
              aria-hidden="true"
            />
            L&apos;anteprima non modifica ancora le righe payroll definitive.
            Usa <strong>Verifica import</strong> qui sotto prima di applicare i
            dati.
          </div>
        </div>
      )}

      <div className="card-body">
        <h3 className="h6 mb-3">Import registrati</h3>

        {imports.length === 0 && !preview ? (
          <div className="text-muted small">
            Nessun import registrato per questa elaborazione.
          </div>
        ) : imports.length === 0 ? (
          <div className="text-muted small">
            L&apos;import appena caricato è stato salvato. Ricarica la pagina
            per visualizzarlo nell&apos;elenco delle sessioni registrate.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Stato</th>
                  <th className="text-end">Righe</th>
                  <th className="text-end">Valide</th>
                  <th className="text-end">Anomalie</th>

                  {!disabled && (
                    <th className="text-end">Azioni</th>
                  )}
                </tr>
              </thead>

              <tbody>
                {imports.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="fw-semibold">
                        {item.source_filename ?? "Import paghe"}
                      </div>

                      <div className="small text-muted">
                        {item.source_format?.toUpperCase() ?? "—"}
                      </div>
                    </td>

                    <td>
                      <span
                        className={`badge ${statusClass(item.status)}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </td>

                    <td className="text-end">
                      {item.total_rows}
                    </td>

                    <td className="text-end">
                      {item.valid_rows}
                    </td>

                    <td className="text-end">
                      <span
                        className={
                          item.invalid_rows > 0
                            ? "text-danger fw-semibold"
                            : undefined
                        }
                      >
                        {item.invalid_rows}
                      </span>
                    </td>

                    {!disabled && (
                      <td>
                        <div className="d-flex justify-content-end flex-wrap gap-2">
                          {(item.status === "draft" ||
                            item.status === "invalid") && (
                            <form action={validateAction}>
                              <input
                                type="hidden"
                                name="payroll_run_id"
                                value={payrollRunId}
                              />

                              <input
                                type="hidden"
                                name="payroll_import_id"
                                value={item.id}
                              />

                              <button
                                type="submit"
                                className="btn btn-sm btn-outline-primary"
                              >
                                Verifica import
                              </button>
                            </form>
                          )}

                          {item.status === "validated" && (
                            <form action={applyAction}>
                              <input
                                type="hidden"
                                name="payroll_run_id"
                                value={payrollRunId}
                              />

                              <input
                                type="hidden"
                                name="payroll_import_id"
                                value={item.id}
                              />

                              <button
                                type="submit"
                                className="btn btn-sm btn-success"
                              >
                                Applica import
                              </button>
                            </form>
                          )}

                          {item.status !== "applied" &&
                            item.status !== "cancelled" && (
                              <form action={cancelAction}>
                                <input
                                  type="hidden"
                                  name="payroll_run_id"
                                  value={payrollRunId}
                                />

                                <input
                                  type="hidden"
                                  name="payroll_import_id"
                                  value={item.id}
                                />

                                <button
                                  type="submit"
                                  className="btn btn-sm btn-outline-danger"
                                >
                                  Annulla
                                </button>
                              </form>
                            )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}