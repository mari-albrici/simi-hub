"use client";

import { useState } from "react";

import {
  savePayrollEmployeeEntryAction,
  type PayrollEmployeeEntry,
  type PayrollEmployeeOption,
} from "@/lib/payroll";

type Props = {
  payrollRunId: string;
  employees: PayrollEmployeeOption[];
  entries: PayrollEmployeeEntry[];
  disabled?: boolean;
};

function numberValue(
  value: number | undefined,
) {
  return value ?? 0;
}

export default function PayrollEmployeeForm({
  payrollRunId,
  employees,
  entries,
  disabled = false,
}: Props) {
  const [employeeId, setEmployeeId] =
    useState("");

  const existingEntry =
    entries.find(
      (entry) =>
        entry.employee_id ===
        employeeId,
    );

  const selectedEmployee =
    employees.find(
      (employee) =>
        employee.id ===
        employeeId,
    );

  /*
   * Cambiando dipendente forziamo
   * il remount del form tramite key,
   * così defaultValue viene aggiornato.
   */
  const formKey = `${employeeId}-${existingEntry?.updated_at ?? "new"}`;

  return (
    <div className="card mb-4">
      <div className="card-header bg-body">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
          <div>
            <h2 className="h5 mb-1">
              Inserimento dati dipendente
            </h2>

            <div className="small text-muted">
              Inserisci o modifica i dati
              dell'elaborazione mensile.
            </div>
          </div>

          {existingEntry && (
            <span className="badge text-bg-light border">
              Già presente
            </span>
          )}
        </div>
      </div>

      <div className="card-body">
        {disabled ? (
          <div
            className="alert alert-secondary mb-0"
            role="alert"
          >
            L'elaborazione è chiusa.
            I dati dei dipendenti non
            possono essere modificati.
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label
                htmlFor="payroll-employee"
                className="form-label"
              >
                Dipendente
              </label>

              <select
                id="payroll-employee"
                className="form-select"
                value={employeeId}
                onChange={(event) =>
                  setEmployeeId(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Seleziona un dipendente
                </option>

                {employees.map(
                  (employee) => {
                    const hasEntry =
                      entries.some(
                        (entry) =>
                          entry.employee_id ===
                          employee.id,
                      );

                    return (
                      <option
                        key={employee.id}
                        value={employee.id}
                      >
                        {employee.last_name}{" "}
                        {employee.first_name}
                        {employee.employee_code
                          ? ` · ${employee.employee_code}`
                          : ""}
                        {hasEntry
                          ? " · già inserito"
                          : ""}
                      </option>
                    );
                  },
                )}
              </select>

              {selectedEmployee && (
                <div className="form-text">
                  {selectedEmployee.hire_date
                    ? `Assunzione: ${new Intl.DateTimeFormat(
                        "it-IT",
                      ).format(
                        new Date(
                          `${selectedEmployee.hire_date}T00:00:00`,
                        ),
                      )}`
                    : "Data assunzione non indicata"}

                  {selectedEmployee.termination_date &&
                    ` · Cessazione: ${new Intl.DateTimeFormat(
                      "it-IT",
                    ).format(
                      new Date(
                        `${selectedEmployee.termination_date}T00:00:00`,
                      ),
                    )}`}
                </div>
              )}
            </div>

            {employeeId && (
              <form
                key={formKey}
                action={
                  savePayrollEmployeeEntryAction
                }
              >
                <input
                  type="hidden"
                  name="payroll_run_id"
                  value={payrollRunId}
                />

                <input
                  type="hidden"
                  name="employee_id"
                  value={employeeId}
                />

                <div className="row g-3">
                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`gross-${employeeId}`}
                      className="form-label"
                    >
                      Lordo
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`gross-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="gross_salary"
                        min="0"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.gross_salary,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`other-${employeeId}`}
                      className="form-label"
                    >
                      Altre voci
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`other-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="other_salary_items"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.other_salary_items,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`base-${employeeId}`}
                      className="form-label"
                    >
                      Imponibile previdenziale
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`base-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="social_security_base"
                        min="0"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.social_security_base,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`net-${employeeId}`}
                      className="form-label"
                    >
                      Netto
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`net-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="net_salary"
                        min="0"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.net_salary,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12">
                    <hr className="my-1" />
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`employer-${employeeId}`}
                      className="form-label"
                    >
                      Contributi datore
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`employer-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="employer_contributions"
                        min="0"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.employer_contributions,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`employee-contributions-${employeeId}`}
                      className="form-label"
                    >
                      Contributi dipendente
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`employee-contributions-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="employee_contributions"
                        min="0"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.employee_contributions,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`tfr-${employeeId}`}
                      className="form-label"
                    >
                      TFR maturato
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`tfr-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="tfr_accrual"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.tfr_accrual,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`tfr-inps-${employeeId}`}
                      className="form-label"
                    >
                      TFR INPS
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`tfr-inps-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="tfr_inps"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.tfr_inps,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`tfr-recovery-${employeeId}`}
                      className="form-label"
                    >
                      Recupero TFR
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`tfr-recovery-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="tfr_recovery"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.tfr_recovery,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`reimbursements-${employeeId}`}
                      className="form-label"
                    >
                      Rimborsi
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`reimbursements-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="reimbursements"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.reimbursements,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12">
                    <hr className="my-1" />
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label htmlFor={`loan-deductions-${employeeId}`} className="form-label">
                      Prestiti
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">€</span>
                      <input
                        id={`loan-deductions-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="loan_deductions"
                        min="0"
                        step="0.01"
                        defaultValue={numberValue(existingEntry?.loan_deductions)}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label htmlFor={`fifth-assignment-deductions-${employeeId}`} className="form-label">
                      Cessione del quinto
                    </label>
                    <div className="input-group">
                      <span className="input-group-text">€</span>
                      <input
                        id={`fifth-assignment-deductions-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="fifth_assignment_deductions"
                        min="0"
                        step="0.01"
                        defaultValue={numberValue(existingEntry?.fifth_assignment_deductions)}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`cost-${employeeId}`}
                      className="form-label fw-semibold"
                    >
                      Costo aziendale
                    </label>

                    <div className="input-group">
                      <span className="input-group-text">
                        €
                      </span>

                      <input
                        id={`cost-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="company_cost"
                        min="0"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.company_cost,
                        )}
                      />
                    </div>
                  </div>

                  <div className="col-12 col-md-6 col-xl-3">
                    <label
                      htmlFor={`hours-${employeeId}`}
                      className="form-label"
                    >
                      Ore lavorate
                    </label>

                    <div className="input-group">
                      <input
                        id={`hours-${employeeId}`}
                        type="number"
                        className="form-control"
                        name="worked_hours"
                        min="0"
                        step="0.01"
                        defaultValue={numberValue(
                          existingEntry?.worked_hours,
                        )}
                      />

                      <span className="input-group-text">
                        h
                      </span>
                    </div>
                  </div>

                  <div className="col-12">
                    <label
                      htmlFor={`notes-${employeeId}`}
                      className="form-label"
                    >
                      Note
                    </label>

                    <textarea
                      id={`notes-${employeeId}`}
                      className="form-control"
                      name="notes"
                      rows={2}
                      defaultValue={
                        existingEntry?.notes ??
                        ""
                      }
                    />
                  </div>
                </div>

                <div className="d-flex justify-content-end mt-4">
                  <button
                    type="submit"
                    className="btn btn-primary"
                  >
                    <i
                      className="bi bi-floppy me-2"
                      aria-hidden="true"
                    />

                    {existingEntry
                      ? "Aggiorna dati"
                      : "Aggiungi dipendente"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}