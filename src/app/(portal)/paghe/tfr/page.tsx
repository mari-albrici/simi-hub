import Link from "@/components/ui/app-link";

import {
  deletePayrollTfrMovementAction,
  getPayrollLegalEntities,
  getPayrollTfrBalances,
  getPayrollTfrEmployees,
  getPayrollTfrLedger,
  getPayrollTfrMovements,
  savePayrollTfrMovementAction,
  type PayrollTfrMovementType,
} from "@/lib/payroll";

import { requirePagePermission } from "@/lib/permissions";

type PageProps = {
  searchParams: Promise<{
    legal_entity_id?: string;
    employee_id?: string;
    success?: string;
    error?: string;
    error_kind?: string;
  }>;
};

const MOVEMENT_LABELS: Record<
  PayrollTfrMovementType,
  string
> = {
  opening_balance: "Saldo iniziale",
  accrual: "Accantonamento",
  revaluation: "Rivalutazione",
  advance: "Anticipo",
  settlement: "Liquidazione",
  transfer_pension_fund: "Trasferimento fondo pensione",
  transfer_inps: "Trasferimento INPS",
  recovery_inps: "Recupero INPS",
  adjustment: "Rettifica",
};

const NEGATIVE_TYPES = new Set<PayrollTfrMovementType>([
  "advance",
  "settlement",
  "transfer_pension_fund",
  "transfer_inps",
]);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("it-IT").format(
    new Date(`${value}T00:00:00`),
  );
}

export default async function PayrollTfrPage({
  searchParams,
}: PageProps) {
  await requirePagePermission(
    "payroll.tfr.read",
  );

  const params = await searchParams;
  const legalEntityId =
    params.legal_entity_id || undefined;
  const employeeId =
    params.employee_id || undefined;

  const [
    legalEntities,
    balances,
    employees,
    movements,
  ] = await Promise.all([
    getPayrollLegalEntities(),
    getPayrollTfrBalances(legalEntityId),
    getPayrollTfrEmployees(legalEntityId),
    getPayrollTfrMovements({
      legal_entity_id: legalEntityId,
      employee_id: employeeId,
    }),
  ]);

  const selectedEmployee =
    employeeId
      ? employees.find(
          (employee) =>
            employee.id === employeeId,
        ) ?? null
      : null;

  const ledger =
    selectedEmployee
      ? await getPayrollTfrLedger(
          selectedEmployee.id,
          selectedEmployee.legal_entity_id,
        )
      : [];

  const selectedBalance =
    selectedEmployee
      ? balances.find(
          (balance) =>
            balance.employee_id ===
            selectedEmployee.id,
        ) ?? null
      : null;

  const totalBalance =
    balances.reduce(
      (sum, item) =>
        sum + item.current_balance,
      0,
    );

  const totalAccruals =
    balances.reduce(
      (sum, item) =>
        sum + item.total_accruals,
      0,
    );

  const totalAdvances =
    balances.reduce(
      (sum, item) =>
        sum + item.total_advances,
      0,
    );

  const totalSettlements =
    balances.reduce(
      (sum, item) =>
        sum + item.total_settlements,
      0,
    );

  return (
    <div className="container-fluid py-4">
      <div className="mb-3">
        <Link
          href="/paghe"
          className="text-decoration-none small"
        >
          <i
            className="bi bi-arrow-left me-2"
            aria-hidden="true"
          />
          Torna alle paghe
        </Link>
      </div>

      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1">
            TFR
          </h1>
          <p className="text-muted mb-0">
            Saldi, accantonamenti, anticipi,
            liquidazioni e mastro cronologico.
          </p>
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
                Fondo TFR
              </div>
              <div className="fs-4 fw-semibold">
                {formatCurrency(totalBalance)}
              </div>
              <div className="small text-muted">
                Saldo corrente
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Accantonamenti
              </div>
              <div className="fs-4 fw-semibold">
                {formatCurrency(totalAccruals)}
              </div>
              <div className="small text-muted">
                Totale registrato
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Anticipi
              </div>
              <div className="fs-4 fw-semibold">
                {formatCurrency(totalAdvances)}
              </div>
              <div className="small text-muted">
                Totale erogato
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Liquidazioni
              </div>
              <div className="fs-4 fw-semibold">
                {formatCurrency(totalSettlements)}
              </div>
              <div className="small text-muted">
                Totale liquidato
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
            <div className="col-12 col-md-5">
              <label
                htmlFor="tfr-entity"
                className="form-label"
              >
                Società
              </label>
              <select
                id="tfr-entity"
                name="legal_entity_id"
                className="form-select"
                defaultValue={
                  legalEntityId ?? ""
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

            <div className="col-12 col-md-5">
              <label
                htmlFor="tfr-employee"
                className="form-label"
              >
                Dipendente
              </label>
              <select
                id="tfr-employee"
                name="employee_id"
                className="form-select"
                defaultValue={
                  employeeId ?? ""
                }
              >
                <option value="">
                  Tutti i dipendenti
                </option>
                {employees.map(
                  (employee) => (
                    <option
                      key={employee.id}
                      value={employee.id}
                    >
                      {employee.last_name}{" "}
                      {employee.first_name}
                      {employee.employee_code
                        ? ` — ${employee.employee_code}`
                        : ""}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="col-12 col-md-2">
              <div className="d-flex gap-2">
                <button
                  type="submit"
                  className="btn btn-primary flex-grow-1"
                >
                  Filtra
                </button>
                <Link
                  href="/paghe/tfr"
                  className="btn btn-outline-secondary"
                  aria-label="Azzera filtri"
                >
                  <i
                    className="bi bi-x-lg"
                    aria-hidden="true"
                  />
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12 col-xl-8">
          <div className="card mb-4">
            <div className="card-header bg-body d-flex justify-content-between align-items-center gap-3">
              <h2 className="h5 mb-0">
                Saldi dipendenti
              </h2>
              <span className="text-muted small">
                {balances.length} risultati
              </span>
            </div>

            {balances.length === 0 ? (
              <div className="card-body py-5 text-center">
                <i
                  className="bi bi-wallet2 fs-1 text-muted"
                  aria-hidden="true"
                />
                <h3 className="h5 mt-3">
                  Nessun saldo TFR
                </h3>
                <p className="text-muted mb-0">
                  Registra un saldo iniziale o
                  sincronizza un accantonamento
                  da un&apos;elaborazione paghe.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Dipendente</th>
                      <th className="text-end">
                        Saldo
                      </th>
                      <th className="text-end">
                        Maturato
                      </th>
                      <th className="text-end">
                        Anticipi
                      </th>
                      <th>
                        Ultimo movimento
                      </th>
                      <th
                        className="text-end"
                        aria-label="Azioni"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map(
                      (balance) => (
                        <tr
                          key={`${balance.legal_entity_id}-${balance.employee_id}`}
                        >
                          <td>
                            <div className="fw-semibold">
                              {balance.last_name}{" "}
                              {balance.first_name}
                            </div>
                            {balance.employee_code && (
                              <div className="small text-muted">
                                {balance.employee_code}
                              </div>
                            )}
                          </td>
                          <td className="text-end fw-semibold text-nowrap">
                            {formatCurrency(
                              balance.current_balance,
                            )}
                          </td>
                          <td className="text-end text-nowrap">
                            {formatCurrency(
                              balance.total_accruals,
                            )}
                          </td>
                          <td className="text-end text-nowrap">
                            {formatCurrency(
                              balance.total_advances,
                            )}
                          </td>
                          <td>
                            {formatDate(
                              balance.last_movement_date,
                            )}
                          </td>
                          <td className="text-end">
                            <Link
                              href={`/paghe/tfr?legal_entity_id=${balance.legal_entity_id}&employee_id=${balance.employee_id}`}
                              className="btn btn-sm btn-outline-secondary"
                            >
                              Mastro
                            </Link>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedEmployee && (
            <div className="card">
              <div className="card-header bg-body">
                <div className="d-flex flex-column flex-md-row justify-content-between gap-2">
                  <div>
                    <h2 className="h5 mb-1">
                      Mastro TFR —{" "}
                      {selectedEmployee.last_name}{" "}
                      {selectedEmployee.first_name}
                    </h2>
                    <div className="small text-muted">
                      Saldo attuale:{" "}
                      <strong>
                        {formatCurrency(
                          selectedBalance?.current_balance ??
                            0,
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {ledger.length === 0 ? (
                <div className="card-body text-muted">
                  Nessun movimento registrato.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Movimento</th>
                        <th>Riferimento</th>
                        <th className="text-end">
                          Importo
                        </th>
                        <th className="text-end">
                          Saldo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map(
                        (item) => (
                          <tr key={item.id}>
                            <td className="text-nowrap">
                              {formatDate(
                                item.movement_date,
                              )}
                            </td>
                            <td>
                              <div className="fw-medium">
                                {
                                  MOVEMENT_LABELS[
                                    item.movement_type
                                  ]
                                }
                              </div>
                              {item.notes && (
                                <div className="small text-muted">
                                  {item.notes}
                                </div>
                              )}
                            </td>
                            <td>
                              {item.source_reference ??
                                item.source ??
                                "—"}
                            </td>
                            <td
                              className={`text-end text-nowrap ${
                                item.amount < 0
                                  ? "text-danger"
                                  : "text-success"
                              }`}
                            >
                              {formatCurrency(
                                item.amount,
                              )}
                            </td>
                            <td className="text-end fw-semibold text-nowrap">
                              {formatCurrency(
                                item.running_balance,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="col-12 col-xl-4">
          <div className="card mb-4">
            <div className="card-header bg-body">
              <h2 className="h5 mb-0">
                Nuovo movimento
              </h2>
            </div>
            <div className="card-body">
              {employees.length === 0 ? (
                <p className="text-muted mb-0">
                  Nessun dipendente disponibile
                  con i filtri selezionati.
                </p>
              ) : (
                <form
                  action={
                    savePayrollTfrMovementAction
                  }
                  className="d-flex flex-column gap-3"
                >
                  <input
                    type="hidden"
                    name="movement_id"
                    value=""
                  />

                  <div>
                    <label
                      htmlFor="new-tfr-employee"
                      className="form-label"
                    >
                      Dipendente
                    </label>
                    <select
                      id="new-tfr-employee"
                      name="employee_id"
                      className="form-select"
                      defaultValue={
                        selectedEmployee?.id ?? ""
                      }
                      required
                    >
                      <option
                        value=""
                        disabled
                      >
                        Seleziona dipendente
                      </option>
                      {employees.map(
                        (employee) => (
                          <option
                            key={employee.id}
                            value={employee.id}
                          >
                            {employee.last_name}{" "}
                            {employee.first_name}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="new-tfr-entity"
                      className="form-label"
                    >
                      Società
                    </label>
                    <select
                      id="new-tfr-entity"
                      name="legal_entity_id"
                      className="form-select"
                      defaultValue={
                        selectedEmployee?.legal_entity_id ??
                        legalEntityId ??
                        ""
                      }
                      required
                    >
                      <option
                        value=""
                        disabled
                      >
                        Seleziona società
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

                  <div>
                    <label
                      htmlFor="new-tfr-date"
                      className="form-label"
                    >
                      Data
                    </label>
                    <input
                      id="new-tfr-date"
                      type="date"
                      name="movement_date"
                      className="form-control"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="new-tfr-type"
                      className="form-label"
                    >
                      Tipo
                    </label>
                    <select
                      id="new-tfr-type"
                      name="movement_type"
                      className="form-select"
                      defaultValue="opening_balance"
                      required
                    >
                      {Object.entries(
                        MOVEMENT_LABELS,
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

                  <div>
                    <label
                      htmlFor="new-tfr-amount"
                      className="form-label"
                    >
                      Importo con segno
                    </label>
                    <input
                      id="new-tfr-amount"
                      type="number"
                      name="amount"
                      className="form-control"
                      step="0.01"
                      required
                    />
                    <div className="form-text">
                      Positivo per saldo,
                      accantonamento e
                      rivalutazione. Negativo per
                      anticipo, liquidazione e
                      trasferimenti.
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="new-tfr-source"
                      className="form-label"
                    >
                      Fonte
                    </label>
                    <input
                      id="new-tfr-source"
                      name="source"
                      className="form-control"
                      placeholder="Es. storico, payroll, consulente"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="new-tfr-reference"
                      className="form-label"
                    >
                      Riferimento
                    </label>
                    <input
                      id="new-tfr-reference"
                      name="source_reference"
                      className="form-control"
                      placeholder="Documento o prospetto"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="new-tfr-notes"
                      className="form-label"
                    >
                      Note
                    </label>
                    <textarea
                      id="new-tfr-notes"
                      name="notes"
                      className="form-control"
                      rows={3}
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                  >
                    Salva movimento
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header bg-body">
              <h2 className="h5 mb-0">
                Movimenti registrati
              </h2>
            </div>

            {movements.length === 0 ? (
              <div className="card-body text-muted">
                Nessun movimento.
              </div>
            ) : (
              <div className="list-group list-group-flush">
                {movements
                  .slice(0, 20)
                  .map((movement) => (
                    <div
                      key={movement.id}
                      className="list-group-item"
                    >
                      <div className="d-flex justify-content-between gap-3">
                        <div>
                          <div className="fw-medium">
                            {movement.last_name}{" "}
                            {movement.first_name}
                          </div>
                          <div className="small text-muted">
                            {
                              MOVEMENT_LABELS[
                                movement.movement_type
                              ]
                            }{" "}
                            ·{" "}
                            {formatDate(
                              movement.movement_date,
                            )}
                          </div>
                        </div>
                        <div
                          className={`text-nowrap fw-semibold ${
                            movement.amount < 0
                              ? "text-danger"
                              : "text-success"
                          }`}
                        >
                          {formatCurrency(
                            movement.amount,
                          )}
                        </div>
                      </div>

                      <form
                        action={
                          deletePayrollTfrMovementAction
                        }
                        className="mt-2"
                      >
                        <input
                          type="hidden"
                          name="movement_id"
                          value={movement.id}
                        />
                        <input
                          type="hidden"
                          name="payroll_run_id"
                          value=""
                        />
                        <button
                          type="submit"
                          className="btn btn-sm btn-outline-danger"
                        >
                          Elimina
                        </button>
                      </form>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="small text-muted mt-3">
        I tipi{" "}
        {Array.from(NEGATIVE_TYPES)
          .map(
            (type) =>
              MOVEMENT_LABELS[type],
          )
          .join(", ")}{" "}
        richiedono importi negativi.
      </div>
    </div>
  );
}
