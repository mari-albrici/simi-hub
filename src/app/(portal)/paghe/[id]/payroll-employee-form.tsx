"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

function nullableNumberValue(
  value: number | null | undefined,
) {
  return value ?? "";
}

function employeeLabel(
  employee: PayrollEmployeeOption,
) {
  return `${employee.last_name} ${employee.first_name}${
    employee.employee_code
      ? ` · ${employee.employee_code}`
      : ""
  }`;
}

function formatDate(
  value: string | null,
) {
  if (!value) return null;

  return new Intl.DateTimeFormat(
    "it-IT",
  ).format(
    new Date(`${value}T00:00:00`),
  );
}

export default function PayrollEmployeeForm({
  payrollRunId,
  employees,
  entries,
  disabled = false,
}: Props) {
  const [isOpen, setIsOpen] =
    useState(false);

  const [employeeId, setEmployeeId] =
    useState("");

  const [isSaving, setIsSaving] =
    useState(false);

  const submittedEntriesVersionRef =
    useRef<string | null>(null);

  const existingEntry =
    entries.find(
      (entry) =>
        entry.employee_id ===
        employeeId,
    );

  const selectedEmployee =
    employees.find(
      (employee) =>
        employee.id === employeeId,
    );

  const availableEmployees =
    useMemo(
      () =>
        employees.filter(
          (employee) =>
            !entries.some(
              (entry) =>
                entry.employee_id ===
                employee.id,
            ),
        ),
      [employees, entries],
    );

  const formKey = `${employeeId}-${existingEntry?.updated_at ?? "new"}`;

  const entriesVersion = entries
    .map(
      (entry) =>
        `${entry.id}:${entry.updated_at}`,
    )
    .join("|");

  useEffect(() => {
    const submittedVersion =
      submittedEntriesVersionRef.current;

    if (
      !isSaving ||
      submittedVersion === null ||
      entriesVersion === submittedVersion
    ) {
      return;
    }

    submittedEntriesVersionRef.current = null;
    setIsOpen(false);
    setEmployeeId("");
    setIsSaving(false);
  }, [entriesVersion, isSaving]);

  function openNew() {
    submittedEntriesVersionRef.current = null;
    setIsSaving(false);
    setEmployeeId("");
    setIsOpen(true);
  }

  function openExisting(
    employeeEntry: PayrollEmployeeEntry,
  ) {
    submittedEntriesVersionRef.current = null;
    setIsSaving(false);
    setEmployeeId(
      employeeEntry.employee_id,
    );
    setIsOpen(true);
  }

  function closeModal() {
    submittedEntriesVersionRef.current = null;
    setIsSaving(false);
    setIsOpen(false);
    setEmployeeId("");
  }

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-body">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
            <div>
              <h2 className="h5 mb-1">
                Dipendenti
              </h2>

              <div className="small text-muted">
                Cedolini registrati
                nell&apos;elaborazione mensile.
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={openNew}
              disabled={disabled}
            >
              <i
                className="bi bi-plus-lg me-2"
                aria-hidden="true"
              />
              Registra cedolino
            </button>
          </div>
        </div>

        <div className="card-body p-0">
          {disabled && (
            <div
              className="alert alert-secondary rounded-0 border-0 border-bottom mb-0"
              role="alert"
            >
              L&apos;elaborazione è chiusa.
              I cedolini non possono essere
              modificati.
            </div>
          )}

          {entries.length === 0 ? (
            <div className="p-4 text-center text-muted">
              Nessun cedolino registrato.
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
                      Netto
                    </th>
                    <th className="text-end">
                      Costo aziendale
                    </th>
                    <th
                      className="text-end"
                      aria-label="Azioni"
                    />
                  </tr>
                </thead>

                <tbody>
                  {entries.map(
                    (entry) => (
                      <tr key={entry.id}>
                        <td>
                          <div className="fw-semibold">
                            {entry.last_name}{" "}
                            {entry.first_name}
                          </div>

                          {entry.employee_code && (
                            <div className="small text-muted">
                              {entry.employee_code}
                            </div>
                          )}
                        </td>

                        <td className="text-end">
                          {entry.worked_hours.toLocaleString(
                            "it-IT",
                            {
                              maximumFractionDigits: 2,
                            },
                          )}
                        </td>

                        <td className="text-end">
                          {entry.gross_salary.toLocaleString(
                            "it-IT",
                            {
                              style: "currency",
                              currency: "EUR",
                            },
                          )}
                        </td>

                        <td className="text-end">
                          {entry.net_salary.toLocaleString(
                            "it-IT",
                            {
                              style: "currency",
                              currency: "EUR",
                            },
                          )}
                        </td>

                        <td className="text-end">
                          {entry.company_cost.toLocaleString(
                            "it-IT",
                            {
                              style: "currency",
                              currency: "EUR",
                            },
                          )}
                        </td>

                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() =>
                              openExisting(
                                entry,
                              )
                            }
                            disabled={disabled}
                          >
                            <i
                              className="bi bi-pencil me-1"
                              aria-hidden="true"
                            />
                            Modifica
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isOpen && (
        <>
          <div
            className="modal fade show d-block"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payrollEmployeeModalTitle"
          >
            <div className="modal-dialog modal-xl modal-dialog-scrollable">
              <div className="modal-content">
                <div className="modal-header">
                  <div>
                    <h2
                      id="payrollEmployeeModalTitle"
                      className="modal-title fs-5 mb-1"
                    >
                      {existingEntry
                        ? "Modifica cedolino"
                        : "Registra cedolino"}
                    </h2>

                    <div className="small text-muted">
                      Inserisci i dati
                      normalizzati del cedolino
                      mensile.
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Chiudi"
                    onClick={closeModal}
                  />
                </div>

                <div className="modal-body">
                  <div className="mb-4">
                    <label
                      htmlFor="payroll-employee"
                      className="form-label fw-semibold"
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
                      disabled={
                        Boolean(existingEntry)
                      }
                    >
                      <option value="">
                        Seleziona un dipendente
                      </option>

                      {existingEntry &&
                        selectedEmployee && (
                          <option
                            value={
                              selectedEmployee.id
                            }
                          >
                            {employeeLabel(
                              selectedEmployee,
                            )}
                          </option>
                        )}

                      {!existingEntry &&
                        availableEmployees.map(
                          (employee) => (
                            <option
                              key={
                                employee.id
                              }
                              value={
                                employee.id
                              }
                            >
                              {employeeLabel(
                                employee,
                              )}
                            </option>
                          ),
                        )}
                    </select>

                    {selectedEmployee && (
                      <div className="form-text">
                        {selectedEmployee.hire_date
                          ? `Assunzione: ${formatDate(
                              selectedEmployee.hire_date,
                            )}`
                          : "Data assunzione non indicata"}

                        {selectedEmployee.termination_date &&
                          ` · Cessazione: ${formatDate(
                            selectedEmployee.termination_date,
                          )}`}
                      </div>
                    )}
                  </div>

                  {!employeeId ? (
                    <div className="alert alert-light border mb-0">
                      Seleziona il dipendente
                      per inserire i dati del
                      cedolino.
                    </div>
                  ) : (
                    <form
                      id="payroll-employee-form"
                      key={formKey}
                      action={
                        savePayrollEmployeeEntryAction
                      }
                      onSubmit={() => {
                        submittedEntriesVersionRef.current =
                          entriesVersion;
                        setIsSaving(true);
                      }}
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

                      <section className="mb-4">
                        <h3 className="h6 text-uppercase text-muted mb-3">
                          Retribuzione
                        </h3>

                        <div className="row g-3">
                          <MoneyField
                            id={`gross-${employeeId}`}
                            name="gross_salary"
                            label="Lordo / totale competenze"
                            value={numberValue(
                              existingEntry?.gross_salary,
                            )}
                            min={0}
                          />

                          <MoneyField
                            id={`salary-cost-${employeeId}`}
                            name="salary_cost"
                            label="Costo stipendio"
                            value={nullableNumberValue(
                              existingEntry?.salary_cost,
                            )}
                            min={0}
                            emphasized
                          />

                          <MoneyField
                            id={`other-${employeeId}`}
                            name="other_salary_items"
                            label="Altre voci retributive"
                            value={numberValue(
                              existingEntry?.other_salary_items,
                            )}
                          />

                          <MoneyField
                            id={`social-base-${employeeId}`}
                            name="social_security_base"
                            label="Imponibile previdenziale"
                            value={numberValue(
                              existingEntry?.social_security_base,
                            )}
                            min={0}
                          />

                          <MoneyField
                            id={`taxable-${employeeId}`}
                            name="taxable_income"
                            label="Imponibile fiscale"
                            value={nullableNumberValue(
                              existingEntry?.taxable_income,
                            )}
                            min={0}
                          />

                          <MoneyField
                            id={`employee-contributions-${employeeId}`}
                            name="employee_contributions"
                            label="Contributi dipendente"
                            value={numberValue(
                              existingEntry?.employee_contributions,
                            )}
                            min={0}
                          />

                          <MoneyField
                            id={`income-tax-${employeeId}`}
                            name="income_tax"
                            label="IRPEF / imposte"
                            value={nullableNumberValue(
                              existingEntry?.income_tax,
                            )}
                            min={0}
                          />

                          <MoneyField
                            id={`net-${employeeId}`}
                            name="net_salary"
                            label="Netto"
                            value={numberValue(
                              existingEntry?.net_salary,
                            )}
                            min={0}
                            emphasized
                          />
                        </div>
                      </section>

                      <hr />

                      <section className="my-4">
                        <h3 className="h6 text-uppercase text-muted mb-3">
                          Presenze
                        </h3>

                        <div className="row g-3">
                          <HoursField
                            id={`worked-${employeeId}`}
                            name="worked_hours"
                            label="Ore lavorate"
                            value={numberValue(
                              existingEntry?.worked_hours,
                            )}
                          />

                          <HoursField
                            id={`holiday-${employeeId}`}
                            name="holiday_hours"
                            label="Ferie"
                            value={nullableNumberValue(
                              existingEntry?.holiday_hours,
                            )}
                          />

                          <HoursField
                            id={`leave-${employeeId}`}
                            name="leave_hours"
                            label="Permessi"
                            value={nullableNumberValue(
                              existingEntry?.leave_hours,
                            )}
                          />

                          <HoursField
                            id={`sickness-${employeeId}`}
                            name="sickness_hours"
                            label="Malattia"
                            value={nullableNumberValue(
                              existingEntry?.sickness_hours,
                            )}
                          />

                          <HoursField
                            id={`accident-${employeeId}`}
                            name="accident_hours"
                            label="Infortunio"
                            value={nullableNumberValue(
                              existingEntry?.accident_hours,
                            )}
                          />
                        </div>
                      </section>

                      <hr />

                      <section className="my-4">
                        <h3 className="h6 text-uppercase text-muted mb-3">
                          Altre voci
                        </h3>

                        <div className="row g-3">
                          <MoneyField
                            id={`travel-${employeeId}`}
                            name="travel_allowances"
                            label="Trasferte"
                            value={nullableNumberValue(
                              existingEntry?.travel_allowances,
                            )}
                          />

                          <MoneyField
                            id={`reimbursements-${employeeId}`}
                            name="reimbursements"
                            label="Rimborsi"
                            value={numberValue(
                              existingEntry?.reimbursements,
                            )}
                          />

                          <MoneyField
                            id={`bonuses-${employeeId}`}
                            name="bonuses"
                            label="Premi"
                            value={nullableNumberValue(
                              existingEntry?.bonuses,
                            )}
                          />
                        </div>
                      </section>

                      <hr />

                      <section className="my-4">
                        <h3 className="h6 text-uppercase text-muted mb-3">
                          TFR e trattenute
                        </h3>

                        <div className="row g-3">
                          <MoneyField
                            id={`tfr-${employeeId}`}
                            name="tfr_accrual"
                            label="TFR maturato"
                            value={numberValue(
                              existingEntry?.tfr_accrual,
                            )}
                          />

                          <MoneyField
                            id={`tfr-inps-${employeeId}`}
                            name="tfr_inps"
                            label="TFR INPS"
                            value={numberValue(
                              existingEntry?.tfr_inps,
                            )}
                          />

                          <MoneyField
                            id={`tfr-recovery-${employeeId}`}
                            name="tfr_recovery"
                            label="Recupero TFR"
                            value={numberValue(
                              existingEntry?.tfr_recovery,
                            )}
                          />

                          <MoneyField
                            id={`loan-${employeeId}`}
                            name="loan_deductions"
                            label="Prestiti"
                            value={numberValue(
                              existingEntry?.loan_deductions,
                            )}
                            min={0}
                          />

                          <MoneyField
                            id={`fifth-${employeeId}`}
                            name="fifth_assignment_deductions"
                            label="Cessione del quinto"
                            value={numberValue(
                              existingEntry?.fifth_assignment_deductions,
                            )}
                            min={0}
                          />
                        </div>
                      </section>

                      <hr />

                      <section className="my-4">
                        <h3 className="h6 text-uppercase text-muted mb-3">
                          Costo aziendale
                        </h3>

                        <div className="row g-3">
                          <CalculatedMoneyField
                            label="Contributi azienda attribuiti"
                            value={
                              existingEntry?.employer_contributions ??
                              null
                            }
                          />

                          <CalculatedMoneyField
                            label="Costo aziendale"
                            value={
                              existingEntry?.company_cost ??
                              null
                            }
                            emphasized
                          />
                        </div>

                        <div className="form-text mt-2">
                          Valori calcolati automaticamente
                          utilizzando il totale dei contributi
                          aziendali dell&apos;elaborazione,
                          l&apos;imponibile previdenziale,
                          il costo stipendio e il TFR INPS.
                          Dopo il primo salvataggio saranno
                          aggiornati automaticamente.
                        </div>
                      </section>

                      <hr />

                      <section className="mt-4">
                        <label
                          htmlFor={`notes-${employeeId}`}
                          className="form-label fw-semibold"
                        >
                          Note
                        </label>

                        <textarea
                          id={`notes-${employeeId}`}
                          className="form-control"
                          name="notes"
                          rows={3}
                          defaultValue={
                            existingEntry?.notes ??
                            ""
                          }
                        />
                      </section>
                    </form>
                  )}
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={closeModal}
                  >
                    Annulla
                  </button>

                  <button
                    type="submit"
                    form="payroll-employee-form"
                    className="btn btn-primary"
                    disabled={!employeeId || isSaving}
                  >
                    <i
                      className="bi bi-floppy me-2"
                      aria-hidden="true"
                    />

                    {isSaving
                      ? "Salvataggio..."
                      : existingEntry
                        ? "Salva modifiche"
                        : "Registra cedolino"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            className="modal-backdrop fade show"
            onClick={closeModal}
            aria-hidden="true"
          />
        </>
      )}
    </>
  );
}

type NumericFieldProps = {
  id: string;
  name: string;
  label: string;
  value: number | "";
  min?: number;
  emphasized?: boolean;
};

function MoneyField({
  id,
  name,
  label,
  value,
  min,
  emphasized = false,
}: NumericFieldProps) {
  return (
    <div className="col-12 col-md-6 col-xl-4">
      <label
        htmlFor={id}
        className={`form-label${
          emphasized
            ? " fw-semibold"
            : ""
        }`}
      >
        {label}
      </label>

      <div className="input-group">
        <span className="input-group-text">
          €
        </span>

        <input
          id={id}
          type="number"
          className="form-control"
          name={name}
          min={min}
          step="0.01"
          defaultValue={value}
        />
      </div>
    </div>
  );
}

function CalculatedMoneyField({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: number | null;
  emphasized?: boolean;
}) {
  return (
    <div className="col-12 col-md-6 col-xl-4">
      <label
        className={`form-label${
          emphasized ? " fw-semibold" : ""
        }`}
      >
        {label}
      </label>

      <div className="input-group">
        <span className="input-group-text">
          €
        </span>

        <input
          type="text"
          className={`form-control${
            emphasized ? " fw-semibold" : ""
          }`}
          value={
            value === null
              ? "Calcolato al salvataggio"
              : value.toLocaleString("it-IT", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
          }
          readOnly
          tabIndex={-1}
          aria-readonly="true"
        />
      </div>
    </div>
  );
}


function HoursField({
  id,
  name,
  label,
  value,
}: NumericFieldProps) {
  return (
    <div className="col-12 col-md-6 col-xl">
      <label
        htmlFor={id}
        className="form-label"
      >
        {label}
      </label>

      <div className="input-group">
        <input
          id={id}
          type="number"
          className="form-control"
          name={name}
          min={0}
          step="0.01"
          defaultValue={value}
        />

        <span className="input-group-text">
          h
        </span>
      </div>
    </div>
  );
}
