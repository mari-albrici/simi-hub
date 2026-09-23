import Link from "@/components/ui/app-link";

import {
  deletePayrollLoanAction,
  deletePayrollLoanInstallmentAction,
  getPayrollLegalEntities,
  getPayrollLoanById,
  getPayrollLoanEmployees,
  getPayrollLoanInstallments,
  getPayrollLoans,
  getPayrollRuns,
  preparePayrollLoanInstallmentAction,
  reconcilePayrollLoanInstallmentAction,
  savePayrollLoanAction,
  savePayrollLoanInstallmentAction,
  setPayrollLoanStatusAction,
  type PayrollLoanStatus,
  type PayrollLoanType,
} from "@/lib/payroll";

import { requirePagePermission } from "@/lib/permissions";

type PageProps = {
  searchParams: Promise<{
    legal_entity_id?: string;
    employee_id?: string;
    status?: string;
    loan_id?: string;
    success?: string;
    error?: string;
    error_kind?: string;
  }>;
};

const LOAN_TYPE_LABELS: Record<PayrollLoanType, string> = {
  loan: "Prestito",
  fifth_assignment: "Cessione del quinto",
  delegation: "Delegazione di pagamento",
  garnishment: "Pignoramento",
  other: "Altro",
};

const LOAN_STATUS_LABELS: Record<PayrollLoanStatus, string> = {
  active: "Attivo",
  suspended: "Sospeso",
  completed: "Completato",
  cancelled: "Annullato",
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

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value ?? 0);
}

function validStatus(
  value: string | undefined,
): PayrollLoanStatus | undefined {
  if (
    value === "active" ||
    value === "suspended" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }

  return undefined;
}

function loanStatusBadge(status: PayrollLoanStatus) {
  switch (status) {
    case "active":
      return "text-bg-success";
    case "suspended":
      return "text-bg-warning";
    case "completed":
      return "text-bg-secondary";
    case "cancelled":
      return "text-bg-danger";
  }
}

function reconciliationBadge(status: string) {
  switch (status) {
    case "matched":
      return "text-bg-success";
    case "different":
      return "text-bg-warning";
    case "missing":
      return "text-bg-danger";
    case "suspended":
      return "text-bg-secondary";
    default:
      return "text-bg-light border";
  }
}

function reconciliationLabel(status: string) {
  switch (status) {
    case "matched":
      return "Quadrata";
    case "different":
      return "Differente";
    case "missing":
      return "Mancante";
    case "suspended":
      return "Sospesa";
    default:
      return status;
  }
}

export default async function PayrollLoansPage({
  searchParams,
}: PageProps) {
  await requirePagePermission("payroll.loans.read");

  const params = await searchParams;
  const selectedStatus = validStatus(params.status);

  const [legalEntities, employees, loans, runs] = await Promise.all([
    getPayrollLegalEntities(),
    getPayrollLoanEmployees(params.legal_entity_id || undefined),
    getPayrollLoans({
      legal_entity_id: params.legal_entity_id || undefined,
      employee_id: params.employee_id || undefined,
      status: selectedStatus,
    }),
    getPayrollRuns({
      legal_entity_id: params.legal_entity_id || undefined,
    }),
  ]);

  const selectedLoan = params.loan_id
    ? await getPayrollLoanById(params.loan_id)
    : null;

  const installments = selectedLoan
    ? await getPayrollLoanInstallments({
        loan_id: selectedLoan.id,
      })
    : [];

  const activeLoans = loans.filter(
    (loan) => loan.status === "active",
  ).length;

  const totalWithheld = loans.reduce(
    (sum, loan) => sum + loan.total_withheld,
    0,
  );

  const allVisibleInstallments = await getPayrollLoanInstallments({
    employee_id: params.employee_id || undefined,
  });

  const filteredVisibleInstallments = params.legal_entity_id
    ? allVisibleInstallments.filter((installment) => {
        const loan = loans.find(
          (item) => item.id === installment.loan_id,
        );
        return Boolean(loan);
      })
    : allVisibleInstallments;

  const toReconcile = filteredVisibleInstallments.filter(
    (installment) =>
      installment.reconciliation_status === "missing" ||
      installment.reconciliation_status === "different",
  ).length;

  const anomalies = filteredVisibleInstallments.filter(
    (installment) =>
      installment.reconciliation_status === "different",
  ).length;

  const selectedEmployee =
    selectedLoan?.employee_id ?? params.employee_id ?? "";

  const selectedEntity =
    selectedLoan?.legal_entity_id ?? params.legal_entity_id ?? "";

  const selectedLoanRuns = selectedLoan
    ? runs.filter(
        (run) =>
          run.legal_entity_id === selectedLoan.legal_entity_id &&
          run.status !== "closed",
      )
    : [];

  return (
    <div className="container-fluid py-4">
      <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4">
        <div>
          <div className="mb-2">
            <Link
              href="/paghe"
              className="text-decoration-none small"
            >
              <i
                className="bi bi-arrow-left me-1"
                aria-hidden="true"
              />
              Torna alle paghe
            </Link>
          </div>

          <h1 className="h3 mb-1">Prestiti / Cessioni</h1>

          <p className="text-muted mb-0">
            Prestiti, cessioni del quinto, rate e riconciliazione
            con le trattenute delle elaborazioni paghe.
          </p>
        </div>

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
      </div>

      {params.success && (
        <div className="alert alert-success" role="alert">
          {params.success}
        </div>
      )}

      {params.error && (
        <div className="alert alert-danger" role="alert">
          {params.error}
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Finanziamenti attivi
              </div>
              <div className="fs-3 fw-semibold">{activeLoans}</div>
              <div className="small text-muted">
                Nei risultati visualizzati
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Trattenuto totale
              </div>
              <div className="fs-4 fw-semibold">
                {formatCurrency(totalWithheld)}
              </div>
              <div className="small text-muted">
                Storico finanziamenti visualizzati
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Da riconciliare
              </div>
              <div className="fs-3 fw-semibold">{toReconcile}</div>
              <div className="small text-muted">
                Rate mancanti o differenti
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Anomalie importo
              </div>
              <div className="fs-3 fw-semibold">{anomalies}</div>
              <div className="small text-muted">
                Atteso diverso dal trattenuto
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
            <div className="col-12 col-lg-4">
              <label
                htmlFor="loan-filter-entity"
                className="form-label"
              >
                Società
              </label>
              <select
                id="loan-filter-entity"
                name="legal_entity_id"
                className="form-select"
                defaultValue={params.legal_entity_id ?? ""}
              >
                <option value="">Tutte le società</option>
                {legalEntities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.code} — {entity.business_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12 col-lg-3">
              <label
                htmlFor="loan-filter-employee"
                className="form-label"
              >
                Dipendente
              </label>
              <select
                id="loan-filter-employee"
                name="employee_id"
                className="form-select"
                defaultValue={params.employee_id ?? ""}
              >
                <option value="">Tutti i dipendenti</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.last_name} {employee.first_name}
                    {employee.employee_code
                      ? ` — ${employee.employee_code}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12 col-md-6 col-lg-2">
              <label
                htmlFor="loan-filter-status"
                className="form-label"
              >
                Stato
              </label>
              <select
                id="loan-filter-status"
                name="status"
                className="form-select"
                defaultValue={selectedStatus ?? ""}
              >
                <option value="">Tutti</option>
                {Object.entries(LOAN_STATUS_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="col-12 col-md-6 col-lg-3">
              <div className="d-flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary flex-grow-1"
                >
                  Filtra
                </button>
                <Link
                  href="/paghe/prestiti"
                  className="btn btn-outline-secondary"
                >
                  Azzera
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-xxl-8">
          <div className="card h-100">
            <div className="card-header bg-body d-flex align-items-center justify-content-between">
              <h2 className="h5 mb-0">Prestiti e cessioni</h2>
              <span className="text-muted small">
                {loans.length} risultati
              </span>
            </div>

            {loans.length === 0 ? (
              <div className="card-body py-5 text-center">
                <i
                  className="bi bi-cash-coin fs-1 text-muted"
                  aria-hidden="true"
                />
                <h3 className="h5 mt-3">
                  Nessun finanziamento
                </h3>
                <p className="text-muted mb-0">
                  Registra il primo prestito o la prima cessione
                  usando il modulo a destra.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Dipendente</th>
                      <th>Tipo</th>
                      <th>Finanziaria</th>
                      <th className="text-end">Rata</th>
                      <th className="text-end">Progressivo</th>
                      <th className="text-end">Trattenuto</th>
                      <th className="text-end">Residue</th>
                      <th>Stato</th>
                      <th aria-label="Azioni" />
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((loan) => (
                      <tr key={loan.id}>
                        <td>
                          <div className="fw-semibold">
                            {loan.last_name} {loan.first_name}
                          </div>
                          {loan.employee_code && (
                            <div className="small text-muted">
                              {loan.employee_code}
                            </div>
                          )}
                        </td>
                        <td>{LOAN_TYPE_LABELS[loan.loan_type]}</td>
                        <td>{loan.lender || "—"}</td>
                        <td className="text-end">
                          {formatCurrency(loan.installment_amount)}
                        </td>
                        <td className="text-end">
                          {loan.last_processed_installment}
                          {loan.total_installments != null
                            ? ` / ${loan.total_installments}`
                            : ""}
                        </td>
                        <td className="text-end">
                          {formatCurrency(loan.total_withheld)}
                        </td>
                        <td className="text-end">
                          {loan.remaining_installments ?? "—"}
                        </td>
                        <td>
                          <span
                            className={`badge ${loanStatusBadge(
                              loan.status,
                            )}`}
                          >
                            {LOAN_STATUS_LABELS[loan.status]}
                          </span>
                        </td>
                        <td className="text-end">
                          <Link
                            href={`/paghe/prestiti?loan_id=${loan.id}${
                              params.legal_entity_id
                                ? `&legal_entity_id=${params.legal_entity_id}`
                                : ""
                            }`}
                            className="btn btn-sm btn-outline-secondary"
                          >
                            Gestisci
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="col-12 col-xxl-4">
          <div className="card">
            <div className="card-header bg-body">
              <h2 className="h5 mb-0">
                {selectedLoan
                  ? "Modifica finanziamento"
                  : "Nuovo prestito / cessione"}
              </h2>
            </div>

            <div className="card-body">
              <form action={savePayrollLoanAction}>
                <input
                  type="hidden"
                  name="loan_id"
                  value={selectedLoan?.id ?? ""}
                />

                <div className="mb-3">
                  <label
                    htmlFor="loan-employee"
                    className="form-label"
                  >
                    Dipendente
                  </label>
                  <select
                    id="loan-employee"
                    name="employee_id"
                    className="form-select"
                    defaultValue={selectedEmployee}
                    required
                  >
                    <option value="">Seleziona…</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.last_name} {employee.first_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3">
                  <label
                    htmlFor="loan-entity"
                    className="form-label"
                  >
                    Società
                  </label>
                  <select
                    id="loan-entity"
                    name="legal_entity_id"
                    className="form-select"
                    defaultValue={selectedEntity}
                    required
                  >
                    <option value="">Seleziona…</option>
                    {legalEntities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.code} — {entity.business_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3">
                  <label
                    htmlFor="loan-type"
                    className="form-label"
                  >
                    Tipo
                  </label>
                  <select
                    id="loan-type"
                    name="loan_type"
                    className="form-select"
                    defaultValue={selectedLoan?.loan_type ?? "loan"}
                    required
                  >
                    {Object.entries(LOAN_TYPE_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="row g-3">
                  <div className="col-12">
                    <label
                      htmlFor="loan-lender"
                      className="form-label"
                    >
                      Finanziaria / creditore
                    </label>
                    <input
                      id="loan-lender"
                      name="lender"
                      className="form-control"
                      defaultValue={selectedLoan?.lender ?? ""}
                    />
                  </div>

                  <div className="col-12">
                    <label
                      htmlFor="loan-reference"
                      className="form-label"
                    >
                      Riferimento contratto
                    </label>
                    <input
                      id="loan-reference"
                      name="contract_reference"
                      className="form-control"
                      defaultValue={
                        selectedLoan?.contract_reference ?? ""
                      }
                    />
                  </div>

                  <div className="col-6">
                    <label
                      htmlFor="loan-original"
                      className="form-label"
                    >
                      Importo originario
                    </label>
                    <input
                      id="loan-original"
                      name="original_amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="form-control"
                      defaultValue={
                        selectedLoan?.original_amount ?? ""
                      }
                    />
                  </div>

                  <div className="col-6">
                    <label
                      htmlFor="loan-installment"
                      className="form-label"
                    >
                      Rata
                    </label>
                    <input
                      id="loan-installment"
                      name="installment_amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="form-control"
                      defaultValue={
                        selectedLoan?.installment_amount ?? ""
                      }
                      required
                    />
                  </div>

                  <div className="col-6">
                    <label
                      htmlFor="loan-total-installments"
                      className="form-label"
                    >
                      Rate totali
                    </label>
                    <input
                      id="loan-total-installments"
                      name="total_installments"
                      type="number"
                      min="1"
                      step="1"
                      className="form-control"
                      defaultValue={
                        selectedLoan?.total_installments ?? ""
                      }
                    />
                  </div>

                  <div className="col-6">
                    <label
                      htmlFor="loan-first-installment"
                      className="form-label"
                    >
                      Prima rata
                    </label>
                    <input
                      id="loan-first-installment"
                      name="first_installment_date"
                      type="date"
                      className="form-control"
                      defaultValue={
                        selectedLoan?.first_installment_date ?? ""
                      }
                    />
                  </div>

                  <div className="col-6">
                    <label
                      htmlFor="loan-start"
                      className="form-label"
                    >
                      Data inizio
                    </label>
                    <input
                      id="loan-start"
                      name="start_date"
                      type="date"
                      className="form-control"
                      defaultValue={selectedLoan?.start_date ?? ""}
                      required
                    />
                  </div>

                  <div className="col-6">
                    <label
                      htmlFor="loan-expected-end"
                      className="form-label"
                    >
                      Fine prevista
                    </label>
                    <input
                      id="loan-expected-end"
                      name="expected_end_date"
                      type="date"
                      className="form-control"
                      defaultValue={
                        selectedLoan?.expected_end_date ?? ""
                      }
                    />
                  </div>

                  <div className="col-12">
                    <label
                      htmlFor="loan-status"
                      className="form-label"
                    >
                      Stato
                    </label>
                    <select
                      id="loan-status"
                      name="status"
                      className="form-select"
                      defaultValue={selectedLoan?.status ?? "active"}
                    >
                      {Object.entries(LOAN_STATUS_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div className="col-12">
                    <label
                      htmlFor="loan-notes"
                      className="form-label"
                    >
                      Note
                    </label>
                    <textarea
                      id="loan-notes"
                      name="notes"
                      className="form-control"
                      rows={3}
                      defaultValue={selectedLoan?.notes ?? ""}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-100 mt-3"
                >
                  {selectedLoan
                    ? "Salva modifiche"
                    : "Registra finanziamento"}
                </button>
              </form>

              {selectedLoan && (
                <>
                  <hr />

                  <form action={setPayrollLoanStatusAction}>
                    <input
                      type="hidden"
                      name="loan_id"
                      value={selectedLoan.id}
                    />

                    <label
                      htmlFor="quick-loan-status"
                      className="form-label"
                    >
                      Cambio stato rapido
                    </label>

                    <div className="input-group">
                      <select
                        id="quick-loan-status"
                        name="status"
                        className="form-select"
                        defaultValue={selectedLoan.status}
                      >
                        {Object.entries(LOAN_STATUS_LABELS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>

                      <button
                        type="submit"
                        className="btn btn-outline-secondary"
                      >
                        Aggiorna
                      </button>
                    </div>

                    <div className="mt-2">
                      <label
                        htmlFor="loan-actual-end"
                        className="form-label small"
                      >
                        Fine effettiva, necessaria per completato
                      </label>
                      <input
                        id="loan-actual-end"
                        name="actual_end_date"
                        type="date"
                        className="form-control"
                        defaultValue={
                          selectedLoan.actual_end_date ?? ""
                        }
                      />
                    </div>
                  </form>

                  {installments.length === 0 && (
                    <form
                      action={deletePayrollLoanAction}
                      className="mt-3"
                    >
                      <input
                        type="hidden"
                        name="loan_id"
                        value={selectedLoan.id}
                      />
                      <button
                        type="submit"
                        className="btn btn-outline-danger w-100"
                      >
                        Elimina finanziamento
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedLoan && (
        <>
          <div className="card mb-4">
            <div className="card-header bg-body">
              <h2 className="h5 mb-0">
                Genera rata da elaborazione
              </h2>
            </div>

            <div className="card-body">
              <form
                action={preparePayrollLoanInstallmentAction}
                className="row g-3 align-items-end"
              >
                <input
                  type="hidden"
                  name="loan_id"
                  value={selectedLoan.id}
                />

                <div className="col-12 col-lg-8">
                  <label
                    htmlFor="loan-run"
                    className="form-label"
                  >
                    Elaborazione paghe
                  </label>
                  <select
                    id="loan-run"
                    name="payroll_run_id"
                    className="form-select"
                    required
                  >
                    <option value="">Seleziona…</option>
                    {selectedLoanRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {MONTHS[run.month - 1]} {run.year} —{" "}
                        {run.legal_entity_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12 col-lg-4">
                  <button
                    type="submit"
                    className="btn btn-primary w-100"
                    disabled={selectedLoanRuns.length === 0}
                  >
                    Genera rata attesa
                  </button>
                </div>
              </form>

              {selectedLoanRuns.length === 0 && (
                <div className="small text-muted mt-2">
                  Nessuna elaborazione modificabile disponibile
                  per la società del finanziamento.
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header bg-body d-flex align-items-center justify-content-between">
              <div>
                <h2 className="h5 mb-0">
                  Storico rate — {selectedLoan.last_name}{" "}
                  {selectedLoan.first_name}
                </h2>
                <div className="small text-muted mt-1">
                  Rata contrattuale{" "}
                  {formatCurrency(selectedLoan.installment_amount)}
                  {selectedLoan.total_installments != null
                    ? ` · ${selectedLoan.total_installments} rate previste`
                    : ""}
                </div>
              </div>

              <span className="text-muted small">
                {installments.length} rate
              </span>
            </div>

            {installments.length === 0 ? (
              <div className="card-body py-5 text-center text-muted">
                Nessuna rata registrata.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Periodo</th>
                      <th className="text-end">Rata</th>
                      <th className="text-end">Atteso</th>
                      <th className="text-end">Trattenuto</th>
                      <th className="text-end">Differenza</th>
                      <th>Esito</th>
                      <th className="text-end">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installments.map((installment) => (
                      <tr key={installment.id}>
                        <td>
                          {installment.payroll_month &&
                          installment.payroll_year
                            ? `${
                                MONTHS[
                                  installment.payroll_month - 1
                                ]
                              } ${installment.payroll_year}`
                            : "—"}
                        </td>
                        <td className="text-end">
                          {installment.installment_number}
                          {selectedLoan.total_installments != null
                            ? ` / ${selectedLoan.total_installments}`
                            : ""}
                        </td>
                        <td className="text-end">
                          {formatCurrency(
                            installment.expected_amount,
                          )}
                        </td>
                        <td className="text-end">
                          {installment.actual_amount == null
                            ? "—"
                            : formatCurrency(
                                installment.actual_amount,
                              )}
                        </td>
                        <td className="text-end">
                          {formatCurrency(installment.difference)}
                        </td>
                        <td>
                          <span
                            className={`badge ${reconciliationBadge(
                              installment.reconciliation_status,
                            )}`}
                          >
                            {reconciliationLabel(
                              installment.reconciliation_status,
                            )}
                          </span>
                        </td>
                        <td className="text-end">
                          <div className="d-flex justify-content-end gap-2">
                            <form
                              action={
                                reconcilePayrollLoanInstallmentAction
                              }
                            >
                              <input
                                type="hidden"
                                name="loan_id"
                                value={selectedLoan.id}
                              />
                              <input
                                type="hidden"
                                name="installment_id"
                                value={installment.id}
                              />
                              <button
                                type="submit"
                                className="btn btn-sm btn-outline-primary"
                              >
                                Riconcilia
                              </button>
                            </form>

                            <form
                              action={
                                deletePayrollLoanInstallmentAction
                              }
                            >
                              <input
                                type="hidden"
                                name="loan_id"
                                value={selectedLoan.id}
                              />
                              <input
                                type="hidden"
                                name="installment_id"
                                value={installment.id}
                              />
                              <button
                                type="submit"
                                className="btn btn-sm btn-outline-danger"
                                aria-label={`Elimina rata ${installment.installment_number}`}
                              >
                                <i
                                  className="bi bi-trash"
                                  aria-hidden="true"
                                />
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card mt-4">
            <div className="card-header bg-body">
              <h2 className="h5 mb-0">
                Inserimento / rettifica manuale rata
              </h2>
            </div>

            <div className="card-body">
              <form
                action={savePayrollLoanInstallmentAction}
                className="row g-3"
              >
                <input
                  type="hidden"
                  name="installment_id"
                  value=""
                />
                <input
                  type="hidden"
                  name="loan_id"
                  value={selectedLoan.id}
                />

                <div className="col-12 col-lg-4">
                  <label
                    htmlFor="manual-run"
                    className="form-label"
                  >
                    Elaborazione
                  </label>
                  <select
                    id="manual-run"
                    name="payroll_run_id"
                    className="form-select"
                    required
                  >
                    <option value="">Seleziona…</option>
                    {selectedLoanRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {MONTHS[run.month - 1]} {run.year}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-6 col-lg-2">
                  <label
                    htmlFor="manual-number"
                    className="form-label"
                  >
                    N. rata
                  </label>
                  <input
                    id="manual-number"
                    name="installment_number"
                    type="number"
                    min="1"
                    step="1"
                    className="form-control"
                    defaultValue={selectedLoan.next_installment_number}
                    required
                  />
                </div>

                <div className="col-6 col-lg-2">
                  <label
                    htmlFor="manual-expected"
                    className="form-label"
                  >
                    Atteso
                  </label>
                  <input
                    id="manual-expected"
                    name="expected_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                    defaultValue={selectedLoan.installment_amount}
                    required
                  />
                </div>

                <div className="col-6 col-lg-2">
                  <label
                    htmlFor="manual-actual"
                    className="form-label"
                  >
                    Effettivo
                  </label>
                  <input
                    id="manual-actual"
                    name="actual_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                  />
                </div>

                <div className="col-6 col-lg-2">
                  <label
                    htmlFor="manual-status"
                    className="form-label"
                  >
                    Stato
                  </label>
                  <select
                    id="manual-status"
                    name="status"
                    className="form-select"
                    defaultValue="expected"
                  >
                    <option value="expected">Attesa</option>
                    <option value="matched">Quadrata</option>
                    <option value="different">Differente</option>
                    <option value="missing">Mancante</option>
                    <option value="suspended">Sospesa</option>
                    <option value="settled">Regolata</option>
                  </select>
                </div>

                <div className="col-12 col-md-4">
                  <label
                    htmlFor="manual-payment-date"
                    className="form-label"
                  >
                    Data pagamento
                  </label>
                  <input
                    id="manual-payment-date"
                    name="payment_date"
                    type="date"
                    className="form-control"
                  />
                </div>

                <div className="col-12 col-md-8">
                  <label
                    htmlFor="manual-notes"
                    className="form-label"
                  >
                    Note
                  </label>
                  <input
                    id="manual-notes"
                    name="notes"
                    className="form-control"
                  />
                </div>

                <div className="col-12">
                  <button
                    type="submit"
                    className="btn btn-outline-primary"
                  >
                    Registra rata manuale
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
