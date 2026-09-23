"use client";

import { useMemo, useState } from "react";

import {
  applyPayrollHourAllocationAction,
  deletePayrollAllocationAction,
  deletePayrollProjectHoursAction,
  savePayrollManualAllocationAction,
  savePayrollProjectHoursAction,
  type PayrollAllocation,
  type PayrollAllocationProposal,
  type PayrollEmployeeEntry,
  type PayrollProjectHours,
  type PayrollProjectOption,
} from "@/lib/payroll";

type Props = {
  payrollRunId: string;
  currency: string;
  entries: PayrollEmployeeEntry[];
  projects: PayrollProjectOption[];
  hours: PayrollProjectHours[];
  allocations: PayrollAllocation[];
  proposals: PayrollAllocationProposal[];
  proposalEntryId: string | null;
  disabled: boolean;
};

const HOUR_TYPES = [
  ["worked", "Lavorate"],
  ["holiday", "Ferie"],
  ["leave", "Permessi"],
  ["sickness", "Malattia"],
  ["accident", "Infortunio"],
  ["training", "Formazione"],
  ["travel", "Trasferta"],
  ["other", "Altro"],
] as const;

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits,
  }).format(value);
}

export default function PayrollAllocationManager({
  payrollRunId,
  currency,
  entries,
  projects,
  hours,
  allocations,
  proposals,
  proposalEntryId,
  disabled,
}: Props) {
  const initialEntryId =
    proposalEntryId && entries.some((entry) => entry.id === proposalEntryId)
      ? proposalEntryId
      : entries[0]?.id ?? "";

  const [selectedEntryId, setSelectedEntryId] = useState(initialEntryId);

  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? null;

  const selectedHours = useMemo(
    () =>
      selectedEntry
        ? hours.filter((row) => row.employee_id === selectedEntry.employee_id)
        : [],
    [hours, selectedEntry],
  );

  const selectedAllocations = useMemo(
    () =>
      selectedEntry
        ? allocations.filter(
            (allocation) =>
              allocation.employee_entry_id === selectedEntry.id,
          )
        : [],
    [allocations, selectedEntry],
  );

  const visibleProposals =
    selectedEntry && proposalEntryId === selectedEntry.id ? proposals : [];

  const workedProjectHours = selectedHours
    .filter((row) => row.hour_type === "worked")
    .reduce((sum, row) => sum + row.hours, 0);

  const allocatedPercentage = selectedAllocations.reduce(
    (sum, row) => sum + row.allocation_percentage,
    0,
  );

  const allocatedCost = selectedAllocations.reduce(
    (sum, row) => sum + row.total_allocated_cost,
    0,
  );

  const allocationDifference = selectedEntry
    ? selectedEntry.company_cost - allocatedCost
    : 0;

  const balanced =
    selectedEntry !== null &&
    Math.abs(allocatedPercentage - 100) <= 0.01 &&
    Math.abs(allocationDifference) <= 0.01;

  function proposalHref(entryId: string) {
    return `/paghe/${payrollRunId}?allocation_entry=${encodeURIComponent(
      entryId,
    )}#allocazioni`;
  }

  return (
    <div className="card mb-4" id="allocazioni">
      <div className="card-header bg-body">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
          <div>
            <h2 className="h5 mb-1">Ore e costo commesse</h2>
            <div className="small text-muted">
              Le ore operative e la ripartizione economica restano separate.
            </div>
          </div>

          {selectedEntry && (
            <span
              className={`badge ${
                balanced
                  ? "text-bg-success"
                  : "text-bg-warning"
              }`}
            >
              {balanced ? "Allocazione quadrata" : "Da completare"}
            </span>
          )}
        </div>
      </div>

      <div className="card-body">
        {entries.length === 0 ? (
          <div className="text-muted">
            Inserisci prima almeno un dipendente nell&apos;elaborazione.
          </div>
        ) : (
          <>
            <div className="row g-3 align-items-end mb-4">
              <div className="col-12 col-lg-7">
                <label
                  className="form-label"
                  htmlFor="allocation_employee_entry"
                >
                  Dipendente
                </label>

                <select
                  id="allocation_employee_entry"
                  className="form-select"
                  value={selectedEntryId}
                  onChange={(event) =>
                    setSelectedEntryId(event.target.value)
                  }
                >
                  {entries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.last_name} {entry.first_name}
                      {entry.employee_code
                        ? ` · ${entry.employee_code}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              {selectedEntry && (
                <>
                  <div className="col-6 col-lg">
                    <div className="small text-muted">Costo aziendale</div>
                    <div className="fw-semibold">
                      {formatCurrency(
                        selectedEntry.company_cost,
                        currency,
                      )}
                    </div>
                  </div>

                  <div className="col-6 col-lg">
                    <div className="small text-muted">Ore payroll</div>
                    <div className="fw-semibold">
                      {formatNumber(selectedEntry.worked_hours)}
                    </div>
                  </div>
                </>
              )}
            </div>

            {selectedEntry && (
              <>
                <div className="border rounded p-3 mb-4">
                  <h3 className="h6 mb-3">Registra ore su commessa</h3>

                  {disabled ? (
                    <div className="alert alert-secondary mb-0">
                      L&apos;elaborazione è chiusa. Ore e allocazioni sono in
                      sola lettura.
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="alert alert-warning mb-0">
                      Nessuna commessa disponibile.
                    </div>
                  ) : (
                    <form
                      action={savePayrollProjectHoursAction}
                      className="row g-3 align-items-end"
                    >
                      <input
                        type="hidden"
                        name="payroll_run_id"
                        value={payrollRunId}
                      />
                      <input
                        type="hidden"
                        name="employee_id"
                        value={selectedEntry.employee_id}
                      />

                      <div className="col-12 col-md-5">
                        <label className="form-label" htmlFor="hours_project">
                          Commessa
                        </label>
                        <select
                          id="hours_project"
                          name="project_id"
                          className="form-select"
                          required
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Seleziona commessa
                          </option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.project_code} — {project.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-6 col-md-3">
                        <label className="form-label" htmlFor="hour_type">
                          Tipo
                        </label>
                        <select
                          id="hour_type"
                          name="hour_type"
                          className="form-select"
                          defaultValue="worked"
                        >
                          {HOUR_TYPES.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-6 col-md-2">
                        <label className="form-label" htmlFor="hours_value">
                          Ore
                        </label>
                        <input
                          id="hours_value"
                          name="hours"
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-control"
                          required
                        />
                      </div>

                      <div className="col-12 col-md-2 d-grid">
                        <button
                          type="submit"
                          className="btn btn-primary"
                        >
                          Salva ore
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <div className="mb-4">
                  <div className="d-flex justify-content-between align-items-center gap-3 mb-2">
                    <h3 className="h6 mb-0">Ore registrate</h3>
                    <span className="small text-muted">
                      Lavorate su commesse:{" "}
                      <strong>{formatNumber(workedProjectHours)}</strong>
                    </span>
                  </div>

                  {selectedHours.length === 0 ? (
                    <div className="border rounded p-3 text-muted">
                      Nessuna ora registrata per questo dipendente.
                    </div>
                  ) : (
                    <div className="table-responsive border rounded">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th>Commessa</th>
                            <th>Tipo</th>
                            <th className="text-end">Ore</th>
                            {!disabled && (
                              <th
                                className="text-end"
                                aria-label="Azioni"
                              />
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedHours.map((row) => (
                            <tr key={row.id}>
                              <td>
                                <div className="fw-semibold">
                                  {row.project_code}
                                </div>
                                <div className="small text-muted">
                                  {row.project_name}
                                </div>
                              </td>
                              <td>
                                {HOUR_TYPES.find(
                                  ([value]) => value === row.hour_type,
                                )?.[1] ?? row.hour_type}
                              </td>
                              <td className="text-end">
                                {formatNumber(row.hours)}
                              </td>
                              {!disabled && (
                                <td className="text-end">
                                  <form
                                    action={
                                      deletePayrollProjectHoursAction
                                    }
                                  >
                                    <input
                                      type="hidden"
                                      name="payroll_run_id"
                                      value={payrollRunId}
                                    />
                                    <input
                                      type="hidden"
                                      name="hours_id"
                                      value={row.id}
                                    />
                                    <button
                                      type="submit"
                                      className="btn btn-sm btn-outline-danger"
                                      title="Rimuovi ore"
                                      aria-label={`Rimuovi ore ${row.project_code}`}
                                    >
                                      <i
                                        className="bi bi-trash"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </form>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="border rounded p-3 mb-4">
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                    <div>
                      <h3 className="h6 mb-1">
                        Ripartizione automatica per ore
                      </h3>
                      <div className="small text-muted">
                        Usa esclusivamente le ore di tipo &quot;Lavorate&quot;
                        attribuite alle commesse.
                      </div>
                    </div>

                    <div className="d-flex flex-wrap gap-2">
                      <a
                        href={proposalHref(selectedEntry.id)}
                        className="btn btn-outline-secondary"
                      >
                        <i
                          className="bi bi-calculator me-2"
                          aria-hidden="true"
                        />
                        Calcola proposta
                      </a>

                      {!disabled && workedProjectHours > 0 && (
                        <form action={applyPayrollHourAllocationAction}>
                          <input
                            type="hidden"
                            name="payroll_run_id"
                            value={payrollRunId}
                          />
                          <input
                            type="hidden"
                            name="employee_entry_id"
                            value={selectedEntry.id}
                          />
                          <button
                            type="submit"
                            className="btn btn-primary"
                          >
                            <i
                              className="bi bi-check2-circle me-2"
                              aria-hidden="true"
                            />
                            Applica per ore
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {visibleProposals.length > 0 && (
                    <div className="table-responsive mt-3">
                      <table className="table table-sm mb-0">
                        <thead>
                          <tr>
                            <th>Commessa</th>
                            <th className="text-end">Ore</th>
                            <th className="text-end">%</th>
                            <th className="text-end">Costo proposto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleProposals.map((proposal) => (
                            <tr key={proposal.project_id}>
                              <td>
                                {proposal.project_code} —{" "}
                                {proposal.project_name}
                              </td>
                              <td className="text-end">
                                {formatNumber(proposal.worked_hours)}
                              </td>
                              <td className="text-end">
                                {formatNumber(
                                  proposal.allocation_percentage,
                                  4,
                                )}
                                %
                              </td>
                              <td className="text-end">
                                {formatCurrency(
                                  proposal.proposed_cost,
                                  currency,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {proposalEntryId === selectedEntry.id &&
                    visibleProposals.length === 0 && (
                      <div className="alert alert-warning mt-3 mb-0">
                        Non ci sono ore lavorate su commesse da cui calcolare
                        una proposta.
                      </div>
                    )}
                </div>

                <div className="mb-4">
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-2 mb-2">
                    <div>
                      <h3 className="h6 mb-1">Allocazione economica</h3>
                      <div className="small text-muted">
                        La quadratura richiede 100% e l&apos;intero costo
                        aziendale allocato.
                      </div>
                    </div>

                    <div className="small text-md-end">
                      <div>
                        Percentuale:{" "}
                        <strong>
                          {formatNumber(allocatedPercentage, 4)}%
                        </strong>
                      </div>
                      <div>
                        Allocato:{" "}
                        <strong>
                          {formatCurrency(allocatedCost, currency)}
                        </strong>
                      </div>
                      <div
                        className={
                          Math.abs(allocationDifference) <= 0.01
                            ? "text-success"
                            : "text-danger"
                        }
                      >
                        Differenza:{" "}
                        <strong>
                          {formatCurrency(
                            allocationDifference,
                            currency,
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {selectedAllocations.length === 0 ? (
                    <div className="border rounded p-3 text-muted">
                      Nessuna allocazione economica presente.
                    </div>
                  ) : (
                    <div className="table-responsive border rounded">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th>Commessa</th>
                            <th>Metodo</th>
                            <th className="text-end">Ore</th>
                            <th className="text-end">%</th>
                            <th className="text-end">Lordo</th>
                            <th className="text-end">Contributi</th>
                            <th className="text-end">Altri costi</th>
                            <th className="text-end">Totale</th>
                            {!disabled && (
                              <th
                                className="text-end"
                                aria-label="Azioni"
                              />
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedAllocations.map((allocation) => (
                            <tr key={allocation.id}>
                              <td>
                                <div className="fw-semibold">
                                  {allocation.project_code}
                                </div>
                                <div className="small text-muted">
                                  {allocation.project_name}
                                </div>
                              </td>
                              <td>
                                {allocation.manual_override ? (
                                  <span
                                    className="badge text-bg-warning"
                                    title={
                                      allocation.override_reason ?? undefined
                                    }
                                  >
                                    Manuale
                                  </span>
                                ) : (
                                  <span className="badge text-bg-light border">
                                    Per ore
                                  </span>
                                )}
                              </td>
                              <td className="text-end">
                                {formatNumber(allocation.worked_hours)}
                              </td>
                              <td className="text-end">
                                {formatNumber(
                                  allocation.allocation_percentage,
                                  4,
                                )}
                                %
                              </td>
                              <td className="text-end">
                                {formatCurrency(
                                  allocation.salary_amount,
                                  currency,
                                )}
                              </td>
                              <td className="text-end">
                                {formatCurrency(
                                  allocation.employer_contributions_amount,
                                  currency,
                                )}
                              </td>
                              <td className="text-end">
                                {formatCurrency(
                                  allocation.other_cost_amount,
                                  currency,
                                )}
                              </td>
                              <td className="text-end fw-semibold">
                                {formatCurrency(
                                  allocation.total_allocated_cost,
                                  currency,
                                )}
                              </td>
                              {!disabled && (
                                <td className="text-end">
                                  <form
                                    action={deletePayrollAllocationAction}
                                  >
                                    <input
                                      type="hidden"
                                      name="payroll_run_id"
                                      value={payrollRunId}
                                    />
                                    <input
                                      type="hidden"
                                      name="allocation_id"
                                      value={allocation.id}
                                    />
                                    <button
                                      type="submit"
                                      className="btn btn-sm btn-outline-danger"
                                      title="Rimuovi allocazione"
                                      aria-label={`Rimuovi allocazione ${allocation.project_code}`}
                                    >
                                      <i
                                        className="bi bi-trash"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </form>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {!disabled && projects.length > 0 && (
                  <div className="border rounded p-3">
                    <h3 className="h6 mb-1">Override manuale</h3>
                    <p className="small text-muted mb-3">
                      Usa questa sezione quando la ripartizione economica non
                      deve seguire le ore. La motivazione è obbligatoria.
                    </p>

                    <form
                      action={savePayrollManualAllocationAction}
                      className="row g-3"
                    >
                      <input
                        type="hidden"
                        name="payroll_run_id"
                        value={payrollRunId}
                      />
                      <input
                        type="hidden"
                        name="employee_entry_id"
                        value={selectedEntry.id}
                      />

                      <div className="col-12 col-lg-4">
                        <label
                          className="form-label"
                          htmlFor="manual_project"
                        >
                          Commessa
                        </label>
                        <select
                          id="manual_project"
                          name="project_id"
                          className="form-select"
                          required
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Seleziona commessa
                          </option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.project_code} — {project.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-6 col-lg-2">
                        <label
                          className="form-label"
                          htmlFor="manual_hours"
                        >
                          Ore
                        </label>
                        <input
                          id="manual_hours"
                          name="worked_hours"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue="0"
                          className="form-control"
                          required
                        />
                      </div>

                      <div className="col-6 col-lg-2">
                        <label
                          className="form-label"
                          htmlFor="manual_percentage"
                        >
                          Percentuale
                        </label>
                        <div className="input-group">
                          <input
                            id="manual_percentage"
                            name="allocation_percentage"
                            type="number"
                            min="0"
                            max="100"
                            step="0.0001"
                            className="form-control"
                            required
                          />
                          <span className="input-group-text">%</span>
                        </div>
                      </div>

                      <div className="col-12 col-lg-4">
                        <label
                          className="form-label"
                          htmlFor="manual_cost"
                        >
                          Costo allocato
                        </label>
                        <div className="input-group">
                          <span className="input-group-text">
                            {currency}
                          </span>
                          <input
                            id="manual_cost"
                            name="total_allocated_cost"
                            type="number"
                            min="0"
                            step="0.01"
                            className="form-control"
                            required
                          />
                        </div>
                      </div>

                      <div className="col-12">
                        <label
                          className="form-label"
                          htmlFor="manual_reason"
                        >
                          Motivazione
                        </label>
                        <textarea
                          id="manual_reason"
                          name="reason"
                          className="form-control"
                          rows={2}
                          required
                          placeholder="Es. ripartizione definita amministrativamente 50/50."
                        />
                      </div>

                      <div className="col-12 d-flex justify-content-end">
                        <button
                          type="submit"
                          className="btn btn-outline-primary"
                        >
                          Salva allocazione manuale
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
