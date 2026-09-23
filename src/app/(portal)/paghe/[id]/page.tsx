import { notFound } from "next/navigation";

import Link from "@/components/ui/app-link";

import {
  getPayrollAccountingBalance,
  getPayrollAccountingByAccount,
  getPayrollAccountingEmployees,
  getPayrollAccountingEntries,
  getPayrollAccountingProjects,
  getPayrollAllocationProposal,
  getPayrollAllocations,
  getPayrollEmployeeEntries,
  getPayrollEmployees,
  getPayrollProjectHours,
  getPayrollProjects,
  getPayrollRunById,
  getPayrollTfrMovements,
  generatePayrollAccountingEntriesAction,
  clearPayrollGeneratedAccountingEntriesAction,
  deletePayrollManualAccountingEntryAction,
  savePayrollManualAccountingEntryAction,
  syncPayrollTfrAccrualAction,
  setPayrollRunStatusAction,
  closePayrollRunAction,
  reopenPayrollRunAction,
  type PayrollRunStatus,
} from "@/lib/payroll";

import { requirePagePermission } from "@/lib/permissions";

import PayrollAllocationManager from "./payroll-allocation-manager";
import PayrollEmployeeForm from "./payroll-employee-form";

type PageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    success?: string;
    error?: string;
    allocation_entry?: string;
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

const STATUS_LABELS: Record<PayrollRunStatus, string> = {
  draft: "Bozza",
  imported: "Importata",
  review: "In revisione",
  reconciled: "Riconciliata",
  closed: "Chiusa",
  reopened: "Riaperta",
};

function statusBadgeClass(status: PayrollRunStatus) {
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
  currency: string,
) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 2,
  }).format(value);
}

function CheckIndicator({
  ok,
  okLabel,
  errorLabel,
}: {
  ok: boolean;
  okLabel: string;
  errorLabel: string;
}) {
  if (ok) {
    return (
      <span className="text-success">
        <i
          className="bi bi-check-circle-fill me-2"
          aria-hidden="true"
        />

        {okLabel}
      </span>
    );
  }

  return (
    <span className="text-danger">
      <i
        className="bi bi-exclamation-triangle-fill me-2"
        aria-hidden="true"
      />

      {errorLabel}
    </span>
  );
}

export default async function PayrollRunPage({
  params,
  searchParams,
}: PageProps) {
  await requirePagePermission(
    "payroll.employee.read",
  );

  const { id } = await params;
  const query = await searchParams;

  const run =
    await getPayrollRunById(id);

  if (!run) {
    notFound();
  }

  const [
    employees,
    employeeEntries,
    projects,
    projectHours,
    allocations,
    tfrMovements,
    accountingEntries,
    accountingBalance,
    accountingByAccount,
    accountingEmployees,
    accountingProjects,
  ] = await Promise.all([
    getPayrollEmployees(id),
    getPayrollEmployeeEntries(id),
    getPayrollProjects(),
    getPayrollProjectHours(id),
    getPayrollAllocations(id),
    getPayrollTfrMovements({
      payroll_run_id: id,
    }),
    getPayrollAccountingEntries(id),
    getPayrollAccountingBalance(id),
    getPayrollAccountingByAccount(id),
    getPayrollAccountingEmployees(id),
    getPayrollAccountingProjects(id),
  ]);

  const proposalEntryId =
    query.allocation_entry &&
    employeeEntries.some(
      (entry) => entry.id === query.allocation_entry,
    )
      ? query.allocation_entry
      : null;

  const allocationProposals =
    proposalEntryId
      ? await getPayrollAllocationProposal(
          proposalEntryId,
        )
      : [];

  /*
   * Durante la lavorazione i totali vengono
   * calcolati direttamente dalle righe dipendente.
   *
   * I totali memorizzati in payroll_runs diventano
   * invece quelli definitivi alla chiusura.
   */
  const liveTotals =
    employeeEntries.reduce(
      (totals, entry) => {
        totals.gross +=
          entry.gross_salary;

        totals.net +=
          entry.net_salary;

        totals.employerContributions +=
          entry.employer_contributions;

        totals.companyCost +=
          entry.company_cost;

        totals.workedHours +=
          entry.worked_hours;

        return totals;
      },
      {
        gross: 0,
        net: 0,
        employerContributions: 0,
        companyCost: 0,
        workedHours: 0,
      },
    );

  const monthLabel =
    MONTHS[run.month - 1] ??
    String(run.month);

  const accountingBalanced =
    Math.abs(
      run.validation.accounting_difference,
    ) <= 0.01;

  const isClosed =
    run.status === "closed";

  return (
    <div className="container-fluid py-4">
      {/* -------------------------------------------------- */}
      {/* BACK */}
      {/* -------------------------------------------------- */}

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

      {/* -------------------------------------------------- */}
      {/* MESSAGGI */}
      {/* -------------------------------------------------- */}

      {query.success && (
        <div
          className="alert alert-success"
          role="alert"
        >
          {query.success}
        </div>
      )}

      {query.error && (
        <div
          className="alert alert-danger"
          role="alert"
        >
          {query.error}
        </div>
      )}

      {/* -------------------------------------------------- */}
      {/* TESTATA */}
      {/* -------------------------------------------------- */}

      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3 mb-4">
        <div>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <h1 className="h3 mb-0">
              {monthLabel} {run.year}
            </h1>

            <span
              className={`badge ${statusBadgeClass(
                run.status,
              )}`}
            >
              {STATUS_LABELS[run.status]}
            </span>

            <span className="badge text-bg-light border">
              {run.country}
            </span>
          </div>

          <div className="text-muted">
            {run.legal_entity_name}

            {run.legal_entity_code !== "-" && (
              <>
                {" "}
                · {run.legal_entity_code}
              </>
            )}
          </div>

          {run.source && (
            <div className="small text-muted mt-1">
              Fonte: {run.source}
            </div>
          )}
        </div>

        <div className="d-flex flex-wrap gap-2">
          <Link
            href={`/paghe/tfr?legal_entity_id=${run.legal_entity_id}`}
            className="btn btn-outline-secondary"
          >
            <i
              className="bi bi-wallet2 me-2"
              aria-hidden="true"
            />
            TFR
          </Link>

          {(
            run.status === "draft" ||
            run.status === "imported" ||
            run.status === "reopened"
          ) && (
            <form action={setPayrollRunStatusAction}>
              <input
                type="hidden"
                name="payroll_run_id"
                value={run.id}
              />
              <input
                type="hidden"
                name="new_status"
                value="review"
              />
              <button
                type="submit"
                className="btn btn-outline-primary"
              >
                <i
                  className="bi bi-search me-2"
                  aria-hidden="true"
                />
                Avvia revisione
              </button>
            </form>
          )}

          {run.status === "review" && (
            <form action={setPayrollRunStatusAction}>
              <input
                type="hidden"
                name="payroll_run_id"
                value={run.id}
              />
              <input
                type="hidden"
                name="new_status"
                value="reconciled"
              />
              <button
                type="submit"
                className="btn btn-primary"
              >
                <i
                  className="bi bi-check2-circle me-2"
                  aria-hidden="true"
                />
                Segna come riconciliata
              </button>
            </form>
          )}

          {run.status === "reconciled" && (
            <form action={closePayrollRunAction}>
              <input
                type="hidden"
                name="payroll_run_id"
                value={run.id}
              />
              <button
                type="submit"
                className="btn btn-success"
                disabled={!run.validation.can_close}
                title={
                  run.validation.can_close
                    ? "Chiudi definitivamente l'elaborazione"
                    : "Completa prima tutti i controlli di chiusura"
                }
              >
                <i
                  className="bi bi-lock me-2"
                  aria-hidden="true"
                />
                Chiudi elaborazione
              </button>
            </form>
          )}
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* KPI */}
      {/* -------------------------------------------------- */}

      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Dipendenti
              </div>

              <div className="fs-3 fw-semibold">
                {employeeEntries.length}
              </div>

              <div className="small text-muted">
                Nell&apos;elaborazione
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Lordo
              </div>

              <div className="fs-4 fw-semibold">
                {formatCurrency(
                  liveTotals.gross,
                  run.currency,
                )}
              </div>

              <div className="small text-muted">
                Retribuzioni lorde
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Netto
              </div>

              <div className="fs-4 fw-semibold">
                {formatCurrency(
                  liveTotals.net,
                  run.currency,
                )}
              </div>

              <div className="small text-muted">
                Netto dipendenti
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card h-100">
            <div className="card-body">
              <div className="text-muted small mb-1">
                Costo aziendale
              </div>

              <div className="fs-4 fw-semibold">
                {formatCurrency(
                  liveTotals.companyCost,
                  run.currency,
                )}
              </div>

              <div className="small text-muted">
                Costo complessivo
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- */}
      {/* CONTENUTO */}
      {/* -------------------------------------------------- */}

      <div className="row g-4">
        <div className="col-12 col-xl-8">
          {/* ---------------------------------------------- */}
          {/* FORM DIPENDENTE */}
          {/* ---------------------------------------------- */}

          <PayrollEmployeeForm
            payrollRunId={run.id}
            employees={employees}
            entries={employeeEntries}
            disabled={isClosed}
          />

          {/* ---------------------------------------------- */}
          {/* ORE E ALLOCAZIONI */}
          {/* ---------------------------------------------- */}

          <PayrollAllocationManager
            payrollRunId={run.id}
            currency={run.currency}
            entries={employeeEntries}
            projects={projects}
            hours={projectHours}
            allocations={allocations}
            proposals={allocationProposals}
            proposalEntryId={proposalEntryId}
            disabled={isClosed}
          />

          {/* ---------------------------------------------- */}
          {/* TABELLA DIPENDENTI */}
          {/* ---------------------------------------------- */}

          <div className="card mb-4">
            <div className="card-header bg-body">
              <div className="d-flex justify-content-between align-items-center gap-3">
                <h2 className="h5 mb-0">
                  Dipendenti
                </h2>

                <span className="badge text-bg-light border">
                  {employeeEntries.length}
                </span>
              </div>
            </div>

            {employeeEntries.length === 0 ? (
              <div className="card-body py-5 text-center">
                <i
                  className="bi bi-people fs-1 text-muted"
                  aria-hidden="true"
                />

                <h3 className="h5 mt-3">
                  Nessun dipendente
                </h3>

                <p className="text-muted mb-0">
                  Seleziona un dipendente dal
                  modulo sopra per iniziare
                  l&apos;elaborazione.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Dipendente</th>

                      <th className="text-end">
                        Ore
                      </th>

                      <th className="text-end">
                        Lordo
                      </th>

                      <th className="text-end">
                        Contributi datore
                      </th>

                      <th className="text-end">
                        Netto
                      </th>

                      <th className="text-end">
                        Costo
                      </th>

                      <th className="text-end">
                        TFR
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {employeeEntries.map(
                      (entry) => (
                        <tr key={entry.id}>
                          <td>
                            <div className="fw-semibold">
                              {entry.last_name}{" "}
                              {entry.first_name}
                            </div>

                            {entry.employee_code && (
                              <div className="small text-muted">
                                {
                                  entry.employee_code
                                }
                              </div>
                            )}
                          </td>

                          <td className="text-end text-nowrap">
                            {formatNumber(
                              entry.worked_hours,
                            )}
                          </td>

                          <td className="text-end text-nowrap">
                            {formatCurrency(
                              entry.gross_salary,
                              run.currency,
                            )}
                          </td>

                          <td className="text-end text-nowrap">
                            {formatCurrency(
                              entry.employer_contributions,
                              run.currency,
                            )}
                          </td>

                          <td className="text-end text-nowrap">
                            {formatCurrency(
                              entry.net_salary,
                              run.currency,
                            )}
                          </td>

                          <td className="text-end text-nowrap fw-semibold">
                            {formatCurrency(
                              entry.company_cost,
                              run.currency,
                            )}
                          </td>

                          <td className="text-end text-nowrap">
                            {(() => {
                              const accrualMovement =
                                tfrMovements.find(
                                  (movement) =>
                                    movement.employee_id ===
                                      entry.employee_id &&
                                    movement.movement_type ===
                                      "accrual",
                                );

                              const synced =
                                accrualMovement != null &&
                                Math.abs(
                                  accrualMovement.amount -
                                    entry.tfr_accrual,
                                ) <= 0.01;

                              if (synced) {
                                return (
                                  <span className="text-success small">
                                    <i
                                      className="bi bi-check-circle-fill me-1"
                                      aria-hidden="true"
                                    />
                                    Sincronizzato
                                  </span>
                                );
                              }

                              if (
                                isClosed ||
                                entry.tfr_accrual <= 0
                              ) {
                                return (
                                  <span className="text-muted">
                                    —
                                  </span>
                                );
                              }

                              return (
                                <form
                                  action={
                                    syncPayrollTfrAccrualAction
                                  }
                                >
                                  <input
                                    type="hidden"
                                    name="payroll_run_id"
                                    value={run.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="employee_entry_id"
                                    value={entry.id}
                                  />
                                  <button
                                    type="submit"
                                    className="btn btn-sm btn-outline-secondary"
                                  >
                                    Sincronizza{" "}
                                    {formatCurrency(
                                      entry.tfr_accrual,
                                      run.currency,
                                    )}
                                  </button>
                                </form>
                              );
                            })()}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>

                  <tfoot>
                    <tr className="table-light fw-semibold">
                      <td>
                        Totale
                      </td>

                      <td className="text-end text-nowrap">
                        {formatNumber(
                          liveTotals.workedHours,
                        )}
                      </td>

                      <td className="text-end text-nowrap">
                        {formatCurrency(
                          liveTotals.gross,
                          run.currency,
                        )}
                      </td>

                      <td className="text-end text-nowrap">
                        {formatCurrency(
                          liveTotals.employerContributions,
                          run.currency,
                        )}
                      </td>

                      <td className="text-end text-nowrap">
                        {formatCurrency(
                          liveTotals.net,
                          run.currency,
                        )}
                      </td>

                      <td className="text-end text-nowrap">
                        {formatCurrency(
                          liveTotals.companyCost,
                          run.currency,
                        )}
                      </td>

                      <td className="text-end text-nowrap">
                        {formatCurrency(
                          employeeEntries.reduce(
                            (sum, entry) =>
                              sum +
                              entry.tfr_accrual,
                            0,
                          ),
                          run.currency,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ---------------------------------------------- */}
          {/* CONTABILIZZAZIONE */}
          {/* ---------------------------------------------- */}

          <div
            className="card mb-4"
            id="accounting"
          >
            <div className="card-header bg-body">
              <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
                <div>
                  <h2 className="h5 mb-1">
                    Contabilizzazione
                  </h2>
                  <div className="small text-muted">
                    Scritture contabili generate
                    dall&apos;elaborazione paghe.
                  </div>
                </div>

                {!isClosed && (
                  <div className="d-flex flex-wrap gap-2">
                    <form
                      action={
                        generatePayrollAccountingEntriesAction
                      }
                    >
                      <input
                        type="hidden"
                        name="payroll_run_id"
                        value={run.id}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                      >
                        <i
                          className="bi bi-arrow-repeat me-2"
                          aria-hidden="true"
                        />
                        {accountingEntries.some(
                          (entry) => !entry.is_manual,
                        )
                          ? "Rigenera scritture"
                          : "Genera scritture"}
                      </button>
                    </form>

                    {accountingEntries.some(
                      (entry) => !entry.is_manual,
                    ) && (
                      <form
                        action={
                          clearPayrollGeneratedAccountingEntriesAction
                        }
                      >
                        <input
                          type="hidden"
                          name="payroll_run_id"
                          value={run.id}
                        />
                        <button
                          type="submit"
                          className="btn btn-outline-secondary btn-sm"
                        >
                          Rimuovi automatiche
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="card-body border-bottom">
              <div className="row g-3">
                <div className="col-12 col-md-4">
                  <div className="border rounded p-3 h-100">
                    <div className="small text-muted">
                      Dare
                    </div>
                    <div className="fs-5 fw-semibold">
                      {formatCurrency(
                        accountingBalance?.total_debit ??
                          0,
                        run.currency,
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-12 col-md-4">
                  <div className="border rounded p-3 h-100">
                    <div className="small text-muted">
                      Avere
                    </div>
                    <div className="fs-5 fw-semibold">
                      {formatCurrency(
                        accountingBalance?.total_credit ??
                          0,
                        run.currency,
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-12 col-md-4">
                  <div className="border rounded p-3 h-100">
                    <div className="small text-muted">
                      Differenza
                    </div>
                    <div
                      className={`fs-5 fw-semibold ${
                        Math.abs(
                          accountingBalance?.difference ??
                            0,
                        ) <= 0.01
                          ? "text-success"
                          : "text-danger"
                      }`}
                    >
                      {formatCurrency(
                        accountingBalance?.difference ??
                          0,
                        run.currency,
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                {accountingEntries.length === 0 ? (
                  <span className="text-muted small">
                    Nessuna scrittura contabile
                    presente.
                  </span>
                ) : accountingBalance?.is_balanced ? (
                  <span className="text-success small">
                    <i
                      className="bi bi-check-circle-fill me-2"
                      aria-hidden="true"
                    />
                    Scritture quadrate.
                  </span>
                ) : (
                  <span className="text-danger small">
                    <i
                      className="bi bi-exclamation-triangle-fill me-2"
                      aria-hidden="true"
                    />
                    Scritture non quadrate.
                  </span>
                )}
              </div>
            </div>

            {accountingEntries.length === 0 ? (
              <div className="card-body py-5 text-center">
                <i
                  className="bi bi-journal-text fs-1 text-muted"
                  aria-hidden="true"
                />
                <h3 className="h6 mt-3">
                  Nessuna scrittura
                </h3>
                <p className="text-muted small mb-0">
                  Configura le regole contabili e
                  genera le scritture
                  dell&apos;elaborazione.
                </p>
              </div>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th>Conto</th>
                        <th>Descrizione</th>
                        <th>Riferimento</th>
                        <th className="text-end">
                          Dare
                        </th>
                        <th className="text-end">
                          Avere
                        </th>
                        <th className="text-end">
                          Tipo
                        </th>
                        {!isClosed && (
                          <th
                            className="text-end"
                            aria-label="Azioni"
                          />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {accountingEntries.map(
                        (entry) => (
                          <tr key={entry.id}>
                            <td className="fw-semibold text-nowrap">
                              {entry.account_code}
                            </td>
                            <td>
                              <div>
                                {entry.description}
                              </div>
                              {entry.item_type_name && (
                                <div className="small text-muted">
                                  {
                                    entry.item_type_name
                                  }
                                </div>
                              )}
                              {entry.manual_reason && (
                                <div className="small text-muted">
                                  Motivo:{" "}
                                  {
                                    entry.manual_reason
                                  }
                                </div>
                              )}
                            </td>
                            <td>
                              {entry.project_code ||
                              entry.employee_name ? (
                                <>
                                  {entry.project_code && (
                                    <div className="small">
                                      Commessa{" "}
                                      {
                                        entry.project_code
                                      }
                                    </div>
                                  )}
                                  {entry.employee_name && (
                                    <div className="small text-muted">
                                      {
                                        entry.employee_name
                                      }
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="text-muted">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="text-end text-nowrap">
                              {entry.debit > 0
                                ? formatCurrency(
                                    entry.debit,
                                    run.currency,
                                  )
                                : "—"}
                            </td>
                            <td className="text-end text-nowrap">
                              {entry.credit > 0
                                ? formatCurrency(
                                    entry.credit,
                                    run.currency,
                                  )
                                : "—"}
                            </td>
                            <td className="text-end">
                              <span
                                className={`badge ${
                                  entry.is_manual
                                    ? "text-bg-warning"
                                    : "text-bg-light border"
                                }`}
                              >
                                {entry.is_manual
                                  ? "Manuale"
                                  : "Automatica"}
                              </span>
                            </td>
                            {!isClosed && (
                              <td className="text-end">
                                {entry.is_manual ? (
                                  <form
                                    action={
                                      deletePayrollManualAccountingEntryAction
                                    }
                                  >
                                    <input
                                      type="hidden"
                                      name="payroll_run_id"
                                      value={run.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="entry_id"
                                      value={entry.id}
                                    />
                                    <button
                                      type="submit"
                                      className="btn btn-sm btn-outline-danger"
                                      title="Elimina riga manuale"
                                      aria-label="Elimina riga manuale"
                                    >
                                      <i
                                        className="bi bi-trash"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </form>
                                ) : null}
                              </td>
                            )}
                          </tr>
                        ),
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="table-light fw-semibold">
                        <td colSpan={3}>
                          Totale
                        </td>
                        <td className="text-end text-nowrap">
                          {formatCurrency(
                            accountingBalance?.total_debit ??
                              0,
                            run.currency,
                          )}
                        </td>
                        <td className="text-end text-nowrap">
                          {formatCurrency(
                            accountingBalance?.total_credit ??
                              0,
                            run.currency,
                          )}
                        </td>
                        <td />
                        {!isClosed && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {accountingByAccount.length > 0 && (
                  <div className="card-body border-top">
                    <h3 className="h6 mb-3">
                      Riepilogo per conto
                    </h3>
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th>Conto</th>
                            <th className="text-end">
                              Dare
                            </th>
                            <th className="text-end">
                              Avere
                            </th>
                            <th className="text-end">
                              Saldo
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {accountingByAccount.map(
                            (account) => (
                              <tr
                                key={
                                  account.account_code
                                }
                              >
                                <td>
                                  {
                                    account.account_code
                                  }
                                </td>
                                <td className="text-end">
                                  {formatCurrency(
                                    account.debit,
                                    run.currency,
                                  )}
                                </td>
                                <td className="text-end">
                                  {formatCurrency(
                                    account.credit,
                                    run.currency,
                                  )}
                                </td>
                                <td className="text-end fw-semibold">
                                  {formatCurrency(
                                    account.balance,
                                    run.currency,
                                  )}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {!isClosed && (
              <div className="card-body border-top">
                <h3 className="h6 mb-3">
                  Aggiungi riga manuale
                </h3>

                <form
                  action={
                    savePayrollManualAccountingEntryAction
                  }
                  className="row g-3"
                >
                  <input
                    type="hidden"
                    name="payroll_run_id"
                    value={run.id}
                  />

                  <div className="col-12 col-md-4">
                    <label
                      className="form-label"
                      htmlFor="accounting-account-code"
                    >
                      Conto
                    </label>
                    <input
                      id="accounting-account-code"
                      name="account_code"
                      className="form-control"
                      required
                    />
                  </div>

                  <div className="col-12 col-md-8">
                    <label
                      className="form-label"
                      htmlFor="accounting-description"
                    >
                      Descrizione
                    </label>
                    <input
                      id="accounting-description"
                      name="description"
                      className="form-control"
                      required
                    />
                  </div>

                  <div className="col-12 col-md-3">
                    <label
                      className="form-label"
                      htmlFor="accounting-debit"
                    >
                      Dare
                    </label>
                    <input
                      id="accounting-debit"
                      name="debit"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue="0"
                      className="form-control"
                    />
                  </div>

                  <div className="col-12 col-md-3">
                    <label
                      className="form-label"
                      htmlFor="accounting-credit"
                    >
                      Avere
                    </label>
                    <input
                      id="accounting-credit"
                      name="credit"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue="0"
                      className="form-control"
                    />
                  </div>

                  <div className="col-12 col-md-3">
                    <label
                      className="form-label"
                      htmlFor="accounting-employee"
                    >
                      Dipendente
                    </label>
                    <select
                      id="accounting-employee"
                      name="employee_id"
                      className="form-select"
                      defaultValue=""
                    >
                      <option value="">
                        Nessuno
                      </option>
                      {accountingEmployees.map(
                        (employee) => (
                          <option
                            key={employee.id}
                            value={employee.id}
                          >
                            {employee.last_name}{" "}
                            {employee.first_name}
                            {employee.employee_code
                              ? ` · ${employee.employee_code}`
                              : ""}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div className="col-12 col-md-3">
                    <label
                      className="form-label"
                      htmlFor="accounting-project"
                    >
                      Commessa
                    </label>
                    <select
                      id="accounting-project"
                      name="project_id"
                      className="form-select"
                      defaultValue=""
                    >
                      <option value="">
                        Nessuna
                      </option>
                      {accountingProjects.map(
                        (project) => (
                          <option
                            key={project.id}
                            value={project.id}
                          >
                            {
                              project.project_code
                            }{" "}
                            — {project.name}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div className="col-12">
                    <label
                      className="form-label"
                      htmlFor="accounting-reason"
                    >
                      Motivazione
                    </label>
                    <textarea
                      id="accounting-reason"
                      name="manual_reason"
                      className="form-control"
                      rows={2}
                      required
                    />
                    <div className="form-text">
                      Obbligatoria per ogni
                      registrazione manuale.
                    </div>
                  </div>

                  <div className="col-12">
                    <button
                      type="submit"
                      className="btn btn-outline-primary"
                    >
                      <i
                        className="bi bi-plus-lg me-2"
                        aria-hidden="true"
                      />
                      Aggiungi riga
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* ---------------------------------------------- */}
          {/* NOTE */}
          {/* ---------------------------------------------- */}

          <div className="card">
            <div className="card-header bg-body">
              <h2 className="h5 mb-0">
                Note
              </h2>
            </div>

            <div className="card-body">
              {run.notes ? (
                <p className="mb-0 text-break">
                  {run.notes}
                </p>
              ) : (
                <span className="text-muted">
                  Nessuna nota.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ */}
        {/* SIDEBAR */}
        {/* ------------------------------------------------ */}

        <div className="col-12 col-xl-4">
          {/* ---------------------------------------------- */}
          {/* CONTROLLI */}
          {/* ---------------------------------------------- */}

          <div className="card mb-4">
            <div className="card-header bg-body">
              <h2 className="h5 mb-0">
                Controlli
              </h2>
            </div>

            <div className="card-body">
              <div className="d-flex flex-column gap-3">
                <div>
                  <div className="small text-muted mb-1">
                    Allocazione commesse
                  </div>

                  <CheckIndicator
                    ok={
                      run.validation.allocations_ok
                    }
                    okLabel="Quadrata"
                    errorLabel={
                      employeeEntries.length === 0
                        ? "Nessun dato"
                        : run.validation.unbalanced_allocations === 1
                          ? "1 anomalia"
                          : `${run.validation.unbalanced_allocations} anomalie`
                    }
                  />
                </div>

                <hr className="my-0" />

                <div>
                  <div className="small text-muted mb-1">
                    Ore payroll / commesse
                  </div>

                  <CheckIndicator
                    ok={run.validation.hours_ok}
                    okLabel="Quadrate"
                    errorLabel={
                      employeeEntries.length === 0
                        ? "Nessun dato"
                        : run.validation.hours_mismatches === 1
                          ? "1 anomalia"
                          : `${run.validation.hours_mismatches} anomalie`
                    }
                  />

                  {employeeEntries.length > 0 && (
                    <div className="small text-muted mt-2">
                      <div className="d-flex justify-content-between gap-3">
                        <span>Ore payroll</span>
                        <span className="fw-semibold">
                          {formatNumber(
                            run.validation
                              .payroll_worked_hours,
                          )}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between gap-3">
                        <span>Ore commesse</span>
                        <span className="fw-semibold">
                          {formatNumber(
                            run.validation
                              .project_worked_hours,
                          )}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between gap-3">
                        <span>Differenza</span>
                        <span
                          className={
                            run.validation.hours_ok
                              ? "fw-semibold text-success"
                              : "fw-semibold text-danger"
                          }
                        >
                          {run.validation
                            .hours_difference > 0
                            ? "+"
                            : ""}
                          {formatNumber(
                            run.validation
                              .hours_difference,
                          )}{" "}
                          h
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <hr className="my-0" />

                <div>
                  <div className="small text-muted mb-1">
                    TFR payroll / ledger
                  </div>

                  <CheckIndicator
                    ok={run.validation.tfr_ok}
                    okLabel="Quadrato"
                    errorLabel={
                      employeeEntries.length === 0
                        ? "Nessun dato"
                        : run.validation.tfr_mismatches === 1
                          ? "1 anomalia"
                          : `${run.validation.tfr_mismatches} anomalie`
                    }
                  />

                  {employeeEntries.length > 0 && (
                    <div className="small text-muted mt-2">
                      <div className="d-flex justify-content-between gap-3">
                        <span>TFR payroll</span>
                        <span className="fw-semibold">
                          {formatCurrency(
                            run.validation
                              .payroll_tfr_accrual,
                            run.currency,
                          )}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between gap-3">
                        <span>TFR ledger</span>
                        <span className="fw-semibold">
                          {formatCurrency(
                            run.validation
                              .ledger_tfr_accrual,
                            run.currency,
                          )}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between gap-3">
                        <span>Differenza</span>
                        <span
                          className={
                            run.validation.tfr_ok
                              ? "fw-semibold text-success"
                              : "fw-semibold text-danger"
                          }
                        >
                          {run.validation
                            .tfr_difference > 0
                            ? "+"
                            : ""}
                          {formatCurrency(
                            run.validation
                              .tfr_difference,
                            run.currency,
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <hr className="my-0" />

                <div>
                  <div className="small text-muted mb-1">
                    Prestiti / cessioni
                  </div>

                  <CheckIndicator
                    ok={run.validation.loans_ok}
                    okLabel="Quadrati"
                    errorLabel={
                      employeeEntries.length === 0
                        ? "Nessun dato"
                        : run.validation.loan_mismatches === 1
                          ? "1 anomalia"
                          : `${run.validation.loan_mismatches} anomalie`
                    }
                  />

                  {employeeEntries.length > 0 && (
                    <div className="small text-muted mt-2">
                      <div className="fw-semibold text-body mb-1">
                        Prestiti
                      </div>

                      <div className="d-flex justify-content-between gap-3">
                        <span>Payroll</span>
                        <span className="fw-semibold">
                          {formatCurrency(
                            run.validation
                              .payroll_loan_deductions,
                            run.currency,
                          )}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between gap-3">
                        <span>Rate attese</span>
                        <span className="fw-semibold">
                          {formatCurrency(
                            run.validation
                              .expected_loan_deductions,
                            run.currency,
                          )}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between gap-3">
                        <span>Differenza</span>
                        <span
                          className={
                            Math.abs(
                              run.validation.loan_difference,
                            ) <= 0.01
                              ? "fw-semibold text-success"
                              : "fw-semibold text-danger"
                          }
                        >
                          {run.validation.loan_difference > 0
                            ? "+"
                            : ""}
                          {formatCurrency(
                            run.validation.loan_difference,
                            run.currency,
                          )}
                        </span>
                      </div>

                      <div className="fw-semibold text-body mt-2 mb-1">
                        Cessioni del quinto
                      </div>

                      <div className="d-flex justify-content-between gap-3">
                        <span>Payroll</span>
                        <span className="fw-semibold">
                          {formatCurrency(
                            run.validation
                              .payroll_fifth_assignment_deductions,
                            run.currency,
                          )}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between gap-3">
                        <span>Rate attese</span>
                        <span className="fw-semibold">
                          {formatCurrency(
                            run.validation
                              .expected_fifth_assignment_deductions,
                            run.currency,
                          )}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between gap-3">
                        <span>Differenza</span>
                        <span
                          className={
                            Math.abs(
                              run.validation
                                .fifth_assignment_difference,
                            ) <= 0.01
                              ? "fw-semibold text-success"
                              : "fw-semibold text-danger"
                          }
                        >
                          {run.validation
                            .fifth_assignment_difference > 0
                            ? "+"
                            : ""}
                          {formatCurrency(
                            run.validation
                              .fifth_assignment_difference,
                            run.currency,
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <hr className="my-0" />

                <div>
                  <div className="small text-muted mb-1">
                    Coerenza payroll / contabilità
                  </div>

                  <CheckIndicator
                    ok={
                      run.validation.accounting_source_ok
                    }
                    okLabel="Quadrata"
                    errorLabel={
                      run.validation
                        .accounting_source_mismatches === 1
                        ? "1 anomalia"
                        : `${run.validation.accounting_source_mismatches} anomalie`
                    }
                  />

                  <div className="small text-muted mt-2">
                    <div className="fw-semibold text-body mb-1">
                      Dare
                    </div>

                    <div className="d-flex justify-content-between gap-3">
                      <span>Payroll atteso</span>
                      <span className="fw-semibold">
                        {formatCurrency(
                          run.validation
                            .expected_accounting_debit,
                          run.currency,
                        )}
                      </span>
                    </div>

                    <div className="d-flex justify-content-between gap-3">
                      <span>Contabilizzato</span>
                      <span className="fw-semibold">
                        {formatCurrency(
                          run.validation
                            .generated_accounting_debit,
                          run.currency,
                        )}
                      </span>
                    </div>

                    <div className="d-flex justify-content-between gap-3">
                      <span>Differenza</span>
                      <span
                        className={
                          Math.abs(
                            run.validation
                              .accounting_debit_source_difference,
                          ) <= 0.01
                            ? "fw-semibold text-success"
                            : "fw-semibold text-danger"
                        }
                      >
                        {run.validation
                          .accounting_debit_source_difference > 0
                          ? "+"
                          : ""}
                        {formatCurrency(
                          run.validation
                            .accounting_debit_source_difference,
                          run.currency,
                        )}
                      </span>
                    </div>

                    <div className="fw-semibold text-body mt-2 mb-1">
                      Avere
                    </div>

                    <div className="d-flex justify-content-between gap-3">
                      <span>Payroll atteso</span>
                      <span className="fw-semibold">
                        {formatCurrency(
                          run.validation
                            .expected_accounting_credit,
                          run.currency,
                        )}
                      </span>
                    </div>

                    <div className="d-flex justify-content-between gap-3">
                      <span>Contabilizzato</span>
                      <span className="fw-semibold">
                        {formatCurrency(
                          run.validation
                            .generated_accounting_credit,
                          run.currency,
                        )}
                      </span>
                    </div>

                    <div className="d-flex justify-content-between gap-3">
                      <span>Differenza</span>
                      <span
                        className={
                          Math.abs(
                            run.validation
                              .accounting_credit_source_difference,
                          ) <= 0.01
                            ? "fw-semibold text-success"
                            : "fw-semibold text-danger"
                        }
                      >
                        {run.validation
                          .accounting_credit_source_difference > 0
                          ? "+"
                          : ""}
                        {formatCurrency(
                          run.validation
                            .accounting_credit_source_difference,
                          run.currency,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <hr className="my-0" />

                <div>
                  <div className="small text-muted mb-1">
                    Contabilità
                  </div>

                  <CheckIndicator
                    ok={
                      run.validation.accounting_ok
                    }
                    okLabel="Quadrata"
                    errorLabel={
                      run.validation
                        .accounting_entries === 0
                        ? "Nessuna registrazione"
                        : "Non quadrata"
                    }
                  />
                </div>

                <hr className="my-0" />

                <div>
                  <div className="small text-muted mb-1">
                    Chiusura
                  </div>

                  {isClosed ? (
                    <span className="text-success">
                      <i
                        className="bi bi-lock-fill me-2"
                        aria-hidden="true"
                      />
                      Elaborazione chiusa
                    </span>
                  ) : (
                    <CheckIndicator
                      ok={
                        run.validation.can_close
                      }
                      okLabel="Pronta per la chiusura"
                      errorLabel="Controlli da completare"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------- */}
          {/* QUADRATURA */}
          {/* ---------------------------------------------- */}

          <div className="card mb-4">
            <div className="card-header bg-body">
              <h2 className="h5 mb-0">
                Quadratura contabile
              </h2>
            </div>

            <div className="card-body">
              <dl className="row mb-0">
                <dt className="col-6 fw-normal text-muted">
                  Dare
                </dt>

                <dd className="col-6 text-end">
                  {formatCurrency(
                    run.validation.total_debit,
                    run.currency,
                  )}
                </dd>

                <dt className="col-6 fw-normal text-muted">
                  Avere
                </dt>

                <dd className="col-6 text-end">
                  {formatCurrency(
                    run.validation.total_credit,
                    run.currency,
                  )}
                </dd>

                <dt className="col-6">
                  Differenza
                </dt>

                <dd
                  className={`col-6 text-end fw-semibold ${
                    accountingBalanced
                      ? "text-success"
                      : "text-danger"
                  }`}
                >
                  {formatCurrency(
                    run.validation
                      .accounting_difference,
                    run.currency,
                  )}
                </dd>
              </dl>
            </div>
          </div>

          {/* ---------------------------------------------- */}
          {/* ELABORAZIONE */}
          {/* ---------------------------------------------- */}

          <div className="card">
            <div className="card-header bg-body">
              <h2 className="h5 mb-0">
                Elaborazione
              </h2>
            </div>

            <div className="card-body">
              <dl className="row mb-0 small">
                <dt className="col-5 text-muted fw-normal">
                  Periodo
                </dt>

                <dd className="col-7 text-end">
                  {monthLabel} {run.year}
                </dd>

                <dt className="col-5 text-muted fw-normal">
                  Paese
                </dt>

                <dd className="col-7 text-end">
                  {run.country}
                </dd>

                <dt className="col-5 text-muted fw-normal">
                  Valuta
                </dt>

                <dd className="col-7 text-end">
                  {run.currency}
                </dd>

                <dt className="col-5 text-muted fw-normal">
                  Stato
                </dt>

                <dd className="col-7 text-end">
                  {STATUS_LABELS[run.status]}
                </dd>

                <dt className="col-5 text-muted fw-normal">
                  Dipendenti
                </dt>

                <dd className="col-7 text-end">
                  {employeeEntries.length}
                </dd>

                <dt className="col-5 text-muted fw-normal">
                  Ore
                </dt>

                <dd className="col-7 text-end">
                  {formatNumber(
                    liveTotals.workedHours,
                  )}
                </dd>
              </dl>

              <hr />

              <div className="small">
                {(
                  run.status === "draft" ||
                  run.status === "imported" ||
                  run.status === "reopened"
                ) && (
                  <div className="text-muted">
                    L&apos;elaborazione è modificabile.
                    Quando i dati sono pronti, avvia la
                    revisione dalla testata.
                  </div>
                )}

                {run.status === "review" && (
                  <div className="text-muted">
                    Verifica dati dipendenti, allocazioni,
                    TFR, prestiti/cessioni, coerenza
                    payroll/contabilità e contabilizzazione,
                    quindi segna l&apos;elaborazione come
                    riconciliata.
                  </div>
                )}

                {run.status === "reconciled" && (
                  <div>
                    {run.validation.can_close ? (
                      <span className="text-success">
                        <i
                          className="bi bi-check-circle-fill me-2"
                          aria-hidden="true"
                        />
                        Tutti i controlli richiesti per la
                        chiusura sono completati.
                      </span>
                    ) : (
                      <span className="text-danger">
                        <i
                          className="bi bi-exclamation-triangle-fill me-2"
                          aria-hidden="true"
                        />
                        Completa i controlli prima di
                        chiudere l&apos;elaborazione.
                      </span>
                    )}
                  </div>
                )}

                {run.status === "closed" && (
                  <div>
                    <div className="alert alert-light border small mb-3">
                      <i
                        className="bi bi-lock-fill me-2"
                        aria-hidden="true"
                      />
                      Elaborazione chiusa. I dati sono in
                      sola lettura finché non viene
                      riaperta.
                    </div>

                    <form action={reopenPayrollRunAction}>
                      <input
                        type="hidden"
                        name="payroll_run_id"
                        value={run.id}
                      />

                      <label
                        className="form-label"
                        htmlFor="payroll-reopen-reason"
                      >
                        Motivazione riapertura
                      </label>

                      <textarea
                        id="payroll-reopen-reason"
                        name="reason"
                        className="form-control"
                        rows={3}
                        maxLength={10000}
                        required
                        placeholder="Indica perché è necessario riaprire l'elaborazione"
                      />

                      <button
                        type="submit"
                        className="btn btn-outline-danger w-100 mt-3"
                      >
                        <i
                          className="bi bi-unlock me-2"
                          aria-hidden="true"
                        />
                        Riapri elaborazione
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}