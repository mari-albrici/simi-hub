"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorizedClient } from "@/lib/permissions";
import { checkDatabase, publicError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validations";

// ============================================================
// TIPI
// ============================================================

export type PayrollRunStatus =
  | "draft"
  | "imported"
  | "review"
  | "reconciled"
  | "closed"
  | "reopened";

export type PayrollRunRecord = {
  id: string;

  legal_entity_id: string;
  legal_entity_name: string;
  legal_entity_code: string;
  country: string;

  year: number;
  month: number;

  status: PayrollRunStatus;

  currency: string;
  source: string | null;
  notes: string | null;

  total_gross: number;
  total_net: number;
  total_employer_contributions: number;
  total_employee_cost: number;

  total_debit: number;
  total_credit: number;
  difference: number;

  employee_count: number;

  created_at: string;
  updated_at: string;

  reviewed_at: string | null;
  closed_at: string | null;
};

export type PayrollRunDetail = PayrollRunRecord & {
  created_by: string;
  reviewed_by: string | null;
  closed_by: string | null;

  validation: PayrollRunValidation;
};

export type PayrollRunValidation = {
  employees_count: number;
  unbalanced_allocations: number;

  hours_mismatches: number;
  payroll_worked_hours: number;
  project_worked_hours: number;
  hours_difference: number;

  tfr_mismatches: number;
  payroll_tfr_accrual: number;
  ledger_tfr_accrual: number;
  tfr_difference: number;

  loan_mismatches: number;
  payroll_loan_deductions: number;
  expected_loan_deductions: number;
  loan_difference: number;
  payroll_fifth_assignment_deductions: number;
  expected_fifth_assignment_deductions: number;
  fifth_assignment_difference: number;

  accounting_source_mismatches: number;
  expected_accounting_debit: number;
  generated_accounting_debit: number;
  accounting_debit_source_difference: number;
  expected_accounting_credit: number;
  generated_accounting_credit: number;
  accounting_credit_source_difference: number;

  accounting_entries: number;

  total_debit: number;
  total_credit: number;
  accounting_difference: number;

  allocations_ok: boolean;
  hours_ok: boolean;
  tfr_ok: boolean;
  loans_ok: boolean;
  accounting_source_ok: boolean;
  accounting_ok: boolean;
  can_close: boolean;
};

export type PayrollLegalEntityOption = {
  id: string;
  code: string;
  business_name: string;
  country: string | null;
};

// ============================================================
// HELPERS
// ============================================================

function payrollPeriodBounds(
  year: number,
  month: number,
) {
  const start = `${year}-${String(
    month,
  ).padStart(2, "0")}-01`;

  const nextYear =
    month === 12
      ? year + 1
      : year;

  const nextMonth =
    month === 12
      ? 1
      : month + 1;

  const nextStart = `${nextYear}-${String(
    nextMonth,
  ).padStart(2, "0")}-01`;

  return {
    start,
    nextStart,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string"
    ? value
    : null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function nullableNumberValue(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function relationObject(
  value: unknown,
): Record<string, unknown> | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    const first = value[0];

    return first &&
      typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return null;
}

function payrollRun(
  row: Record<string, unknown>,
): PayrollRunRecord {
  const entity = relationObject(
    row.entity,
  );

  const entries = Array.isArray(
    row.employee_entries,
  )
    ? row.employee_entries
    : [];

  return {
    id: String(row.id),

    legal_entity_id: String(
      row.legal_entity_id,
    ),

    legal_entity_name:
      stringOrNull(
        entity?.business_name,
      ) ?? "-",

    legal_entity_code:
      stringOrNull(entity?.code) ?? "-",

    country:
      stringOrNull(row.country) ?? "",

    year: numberValue(row.year),
    month: numberValue(row.month),

    status:
      row.status as PayrollRunStatus,

    currency:
      stringOrNull(row.currency) ??
      "EUR",

    source:
      stringOrNull(row.source),

    notes:
      stringOrNull(row.notes),

    total_gross:
      numberValue(row.total_gross),

    total_net:
      numberValue(row.total_net),

    total_employer_contributions:
      numberValue(
        row.total_employer_contributions,
      ),

    total_employee_cost:
      numberValue(
        row.total_employee_cost,
      ),

    total_debit:
      numberValue(row.total_debit),

    total_credit:
      numberValue(row.total_credit),

    difference:
      numberValue(row.difference),

    employee_count:
      entries.length,

    created_at:
      String(row.created_at),

    updated_at:
      String(row.updated_at),

    reviewed_at:
      stringOrNull(row.reviewed_at),

    closed_at:
      stringOrNull(row.closed_at),
  };
}

const payrollRunSelect = `
  id,
  legal_entity_id,
  year,
  month,
  country,
  status,
  currency,
  source,
  notes,
  total_gross,
  total_net,
  total_employer_contributions,
  total_employee_cost,
  total_debit,
  total_credit,
  difference,
  created_at,
  updated_at,
  reviewed_at,
  closed_at,
  entity:legal_entities!payroll_runs_legal_entity_id_fkey(
    code,
    business_name
  ),
  employee_entries:payroll_employee_entries(
    id
  )
`;

// ============================================================
// LETTURA ELABORAZIONI
// ============================================================

export async function getPayrollRuns(
  filter: {
    legal_entity_id?: string;
    year?: number;
    status?: PayrollRunStatus;
  } = {},
): Promise<PayrollRunRecord[]> {
  const db =
    await authorizedClient(
      "payroll.summary.read",
    );

  let query = db
    .from("payroll_runs")
    .select(payrollRunSelect)
    .order("year", {
      ascending: false,
    })
    .order("month", {
      ascending: false,
    });

  if (filter.legal_entity_id) {
    query = query.eq(
      "legal_entity_id",
      uuidSchema.parse(
        filter.legal_entity_id,
      ),
    );
  }

  if (filter.year) {
    query = query.eq(
      "year",
      filter.year,
    );
  }

  if (filter.status) {
    query = query.eq(
      "status",
      filter.status,
    );
  }

  const result = await query;

  checkDatabase(
    result.error,
    "Lettura elaborazioni paghe",
  );

  return (result.data ?? []).map(
    (row) =>
      payrollRun(
        row as unknown as Record<
          string,
          unknown
        >,
      ),
  );
}

// ============================================================
// DETTAGLIO ELABORAZIONE
// ============================================================

export async function getPayrollRunById(
  id: string,
): Promise<PayrollRunDetail | null> {
  const runId = uuidSchema.parse(id);

  /*
   * Il dettaglio contiene dati individuali.
   *
   * NON usiamo payroll.summary.read:
   * management potrà vedere riepiloghi,
   * ma non entrare nel dettaglio
   * retributivo del dipendente.
   */
  const db =
    await authorizedClient(
      "payroll.employee.read",
    );

  const [runResult, validationResult] =
    await Promise.all([
      db
        .from("payroll_runs")
        .select(`
          ${payrollRunSelect},
          created_by,
          reviewed_by,
          closed_by
        `)
        .eq("id", runId)
        .maybeSingle(),

      db.rpc(
        "payroll_validate_run",
        {
          p_payroll_run_id: runId,
        },
      ),
    ]);

  checkDatabase(
    runResult.error,
    "Lettura elaborazione paghe",
  );

  checkDatabase(
    validationResult.error,
    "Verifica elaborazione paghe",
  );

  if (!runResult.data) {
    return null;
  }

  const base = payrollRun(
    runResult.data as unknown as Record<
      string,
      unknown
    >,
  );

  const validationRaw =
    Array.isArray(
      validationResult.data,
    )
      ? validationResult.data[0]
      : validationResult.data;

  const validation =
    (validationRaw ??
      {}) as Record<
        string,
        unknown
      >;

  return {
    ...base,

    created_by:
      String(
        runResult.data.created_by,
      ),

    reviewed_by:
      stringOrNull(
        runResult.data.reviewed_by,
      ),

    closed_by:
      stringOrNull(
        runResult.data.closed_by,
      ),

    validation: {
      employees_count:
        numberValue(
          validation.employees_count,
        ),

      unbalanced_allocations:
        numberValue(
          validation.unbalanced_allocations,
        ),

      hours_mismatches:
        numberValue(
          validation.hours_mismatches,
        ),

      payroll_worked_hours:
        numberValue(
          validation.payroll_worked_hours,
        ),

      project_worked_hours:
        numberValue(
          validation.project_worked_hours,
        ),

      hours_difference:
        numberValue(
          validation.hours_difference,
        ),

      tfr_mismatches:
        numberValue(
          validation.tfr_mismatches,
        ),

      payroll_tfr_accrual:
        numberValue(
          validation.payroll_tfr_accrual,
        ),

      ledger_tfr_accrual:
        numberValue(
          validation.ledger_tfr_accrual,
        ),

      tfr_difference:
        numberValue(
          validation.tfr_difference,
        ),

      loan_mismatches:
        numberValue(
          validation.loan_mismatches,
        ),

      payroll_loan_deductions:
        numberValue(
          validation.payroll_loan_deductions,
        ),

      expected_loan_deductions:
        numberValue(
          validation.expected_loan_deductions,
        ),

      loan_difference:
        numberValue(
          validation.loan_difference,
        ),

      payroll_fifth_assignment_deductions:
        numberValue(
          validation.payroll_fifth_assignment_deductions,
        ),

      expected_fifth_assignment_deductions:
        numberValue(
          validation.expected_fifth_assignment_deductions,
        ),

      fifth_assignment_difference:
        numberValue(
          validation.fifth_assignment_difference,
        ),

      accounting_source_mismatches:
        numberValue(
          validation.accounting_source_mismatches,
        ),

      expected_accounting_debit:
        numberValue(
          validation.expected_accounting_debit,
        ),

      generated_accounting_debit:
        numberValue(
          validation.generated_accounting_debit,
        ),

      accounting_debit_source_difference:
        numberValue(
          validation.accounting_debit_source_difference,
        ),

      expected_accounting_credit:
        numberValue(
          validation.expected_accounting_credit,
        ),

      generated_accounting_credit:
        numberValue(
          validation.generated_accounting_credit,
        ),

      accounting_credit_source_difference:
        numberValue(
          validation.accounting_credit_source_difference,
        ),

      accounting_entries:
        numberValue(
          validation.accounting_entries,
        ),

      total_debit:
        numberValue(
          validation.total_debit,
        ),

      total_credit:
        numberValue(
          validation.total_credit,
        ),

      accounting_difference:
        numberValue(
          validation.accounting_difference,
        ),

      allocations_ok:
        validation.allocations_ok ===
        true,

      hours_ok:
        validation.hours_ok ===
        true,

      tfr_ok:
        validation.tfr_ok ===
        true,

      loans_ok:
        validation.loans_ok ===
        true,

      accounting_source_ok:
        validation.accounting_source_ok ===
        true,

      accounting_ok:
        validation.accounting_ok ===
        true,

      can_close:
        validation.can_close === true,
    },
  };
}

// ============================================================
// SOCIETÀ DISPONIBILI PER LE PAGHE
// ============================================================

export async function getPayrollLegalEntities(): Promise<
  PayrollLegalEntityOption[]
> {
  /*
   * Non richiamiamo getLegalEntities()
   * perché quella funzione richiede
   * legal_entity.read.
   *
   * Chi gestisce Paghe deve poter
   * selezionare la società tramite il
   * proprio permesso payroll.
   */
  const db =
    await authorizedClient(
      "payroll.read",
    );

  const result = await db
    .from("legal_entities")
    .select(
      "id,code,business_name,country",
    )
    .eq("active", true)
    .order("business_name");

  checkDatabase(
    result.error,
    "Lettura società paghe",
  );

  return (result.data ?? []).map(
    (row) => ({
      id: String(row.id),
      code: String(row.code),
      business_name: String(
        row.business_name,
      ),
      country:
        stringOrNull(row.country),
    }),
  );
}

// ============================================================
// DIPENDENTI DISPONIBILI PER UNA ELABORAZIONE
// ============================================================

export async function getPayrollEmployees(
  payrollRunId: string,
): Promise<PayrollEmployeeOption[]> {
  const runId =
    uuidSchema.parse(payrollRunId);

  const db =
    await authorizedClient(
      "payroll.employee.read",
    );

  /*
   * Prima leggiamo società e periodo.
   */
  const runResult = await db
    .from("payroll_runs")
    .select(
      "id,legal_entity_id,year,month",
    )
    .eq("id", runId)
    .maybeSingle();

  checkDatabase(
    runResult.error,
    "Lettura elaborazione paghe",
  );

  if (!runResult.data) {
    return [];
  }

  const year =
    Number(runResult.data.year);

  const month =
    Number(runResult.data.month);

  const { start, nextStart } =
    payrollPeriodBounds(
      year,
      month,
    );

  /*
   * Regola temporale:
   *
   * hire_date < primo giorno del mese successivo
   *
   * E
   *
   * termination_date assente
   * oppure termination_date >= primo giorno del mese.
   *
   * In questo modo includiamo anche chi è stato
   * assunto o cessato durante il mese.
   */
  const result = await db
    .from("employees")
    .select(`
      id,
      employee_code,
      first_name,
      last_name,
      status,
      hire_date,
      termination_date
    `)
    .eq(
      "legal_entity_id",
      runResult.data.legal_entity_id,
    )
    .is("archived_at", null)
    .or(
      `hire_date.is.null,hire_date.lt.${nextStart}`,
    )
    .or(
      `termination_date.is.null,termination_date.gte.${start}`,
    )
    .order("last_name")
    .order("first_name");

  checkDatabase(
    result.error,
    "Lettura dipendenti paghe",
  );

  return (result.data ?? []).map(
    (employee) => ({
      id: String(employee.id),

      employee_code:
        stringOrNull(
          employee.employee_code,
        ),

      first_name:
        String(employee.first_name),

      last_name:
        String(employee.last_name),

      status:
        String(employee.status),

      hire_date:
        stringOrNull(
          employee.hire_date,
        ),

      termination_date:
        stringOrNull(
          employee.termination_date,
        ),
    }),
  );
}

// ============================================================
// RIGHE DIPENDENTI DELLA ELABORAZIONE
// ============================================================

export async function getPayrollEmployeeEntries(
  payrollRunId: string,
): Promise<PayrollEmployeeEntry[]> {
  const runId =
    uuidSchema.parse(payrollRunId);

  const db =
    await authorizedClient(
      "payroll.employee.read",
    );

  const result = await db
    .from("payroll_employee_entries")
    .select(`
      id,
      payroll_run_id,
      employee_id,

      gross_salary,
      salary_cost,
      other_salary_items,
      social_security_base,
      taxable_income,
      net_salary,

      employer_contributions,
      employee_contributions,
      income_tax,

      tfr_accrual,
      tfr_inps,
      tfr_recovery,

      reimbursements,
      travel_allowances,
      bonuses,

      loan_deductions,
      fifth_assignment_deductions,

      company_cost,

      worked_hours,
      holiday_hours,
      leave_hours,
      sickness_hours,
      accident_hours,

      notes,
      created_at,
      updated_at,

      employee:employees!payroll_employee_entries_employee_id_fkey(
        employee_code,
        first_name,
        last_name
      )
    `)
    .eq(
      "payroll_run_id",
      runId,
    );

  checkDatabase(
    result.error,
    "Lettura dipendenti elaborazione paghe",
  );

  const rows =
    (result.data ?? []).map(
      (row) => {
        const employee =
          relationObject(
            row.employee,
          );

        return {
          id: String(row.id),

          payroll_run_id:
            String(
              row.payroll_run_id,
            ),

          employee_id:
            String(
              row.employee_id,
            ),

          employee_code:
            stringOrNull(
              employee?.employee_code,
            ),

          first_name:
            stringOrNull(
              employee?.first_name,
            ) ?? "",

          last_name:
            stringOrNull(
              employee?.last_name,
            ) ?? "",

          gross_salary:
            numberValue(
              row.gross_salary,
            ),

          salary_cost:
            nullableNumberValue(
              row.salary_cost,
            ),

          other_salary_items:
            numberValue(
              row.other_salary_items,
            ),

          social_security_base:
            numberValue(
              row.social_security_base,
            ),

          taxable_income:
            nullableNumberValue(
              row.taxable_income,
            ),

          net_salary:
            numberValue(
              row.net_salary,
            ),

          employer_contributions:
            numberValue(
              row.employer_contributions,
            ),

          employee_contributions:
            numberValue(
              row.employee_contributions,
            ),

          income_tax:
            nullableNumberValue(
              row.income_tax,
            ),

          tfr_accrual:
            numberValue(
              row.tfr_accrual,
            ),

          tfr_inps:
            numberValue(
              row.tfr_inps,
            ),

          tfr_recovery:
            numberValue(
              row.tfr_recovery,
            ),

          reimbursements:
            numberValue(
              row.reimbursements,
            ),

          travel_allowances:
            nullableNumberValue(
              row.travel_allowances,
            ),

          bonuses:
            nullableNumberValue(
              row.bonuses,
            ),

          loan_deductions:
            numberValue(
              row.loan_deductions,
            ),

          fifth_assignment_deductions:
            numberValue(
              row.fifth_assignment_deductions,
            ),

          company_cost:
            numberValue(
              row.company_cost,
            ),

          worked_hours:
            numberValue(
              row.worked_hours,
            ),

          holiday_hours:
            nullableNumberValue(
              row.holiday_hours,
            ),

          leave_hours:
            nullableNumberValue(
              row.leave_hours,
            ),

          sickness_hours:
            nullableNumberValue(
              row.sickness_hours,
            ),

          accident_hours:
            nullableNumberValue(
              row.accident_hours,
            ),

          notes:
            stringOrNull(
              row.notes,
            ),

          created_at:
            String(
              row.created_at,
            ),

          updated_at:
            String(
              row.updated_at,
            ),
        } satisfies PayrollEmployeeEntry;
      },
    );

  return rows.sort(
    (a, b) =>
      a.last_name.localeCompare(
        b.last_name,
        "it",
      ) ||
      a.first_name.localeCompare(
        b.first_name,
        "it",
      ),
  );
}

// ============================================================
// CREAZIONE ELABORAZIONE
// ============================================================

const createPayrollRunSchema =
  z.object({
    legal_entity_id: z.uuid(),

    year: z.coerce
      .number()
      .int()
      .min(2000)
      .max(2100),

    month: z.coerce
      .number()
      .int()
      .min(1)
      .max(12),

    country: z
      .string()
      .trim()
      .min(2)
      .max(3),

    currency: z
      .string()
      .trim()
      .length(3)
      .default("EUR"),

    source: z
      .string()
      .trim()
      .max(200)
      .default(""),

    notes: z
      .string()
      .trim()
      .max(10000)
      .default(""),
  });

export async function createPayrollRunAction(
  form: FormData,
) {
  try {
    const values =
      createPayrollRunSchema.parse({
        legal_entity_id:
          form.get(
            "legal_entity_id",
          ),

        year:
          form.get("year"),

        month:
          form.get("month"),

        country:
          form.get("country"),

        currency:
          form.get("currency") ||
          "EUR",

        source:
          form.get("source") || "",

        notes:
          form.get("notes") || "",
      });

    const db =
      await authorizedClient(
        "payroll.create",
      );

    const result = await db.rpc(
      "payroll_create_run",
      {
        p_legal_entity_id:
          values.legal_entity_id,

        p_year:
          values.year,

        p_month:
          values.month,

        p_country:
          values.country,

        p_currency:
          values.currency,

        p_source:
          values.source || null,

        p_notes:
          values.notes || null,
      },
    );

    checkDatabase(
      result.error,
      "Creazione elaborazione paghe",
    );

    if (!result.data) {
      throw new Error(
        "Creazione elaborazione non confermata.",
      );
    }

    const id = String(
      result.data,
    );

    revalidatePath(
      "/paghe",
      "layout",
    );

    redirect(
      `/paghe/${id}?success=${encodeURIComponent(
        "Elaborazione paghe creata.",
      )}`,
    );
  } catch (error) {
    /*
     * redirect() di Next utilizza internamente
     * un'eccezione speciale: non dobbiamo
     * intercettarla dopo un successo.
     */
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String(
        (
          error as {
            digest?: unknown;
          }
        ).digest,
      ).startsWith(
        "NEXT_REDIRECT",
      )
    ) {
      throw error;
    }

    const parsed =
      publicError(error);

    redirect(
      `/paghe?error=${encodeURIComponent(
        parsed.message,
      )}&error_kind=${encodeURIComponent(
        parsed.kind,
      )}`,
    );
  }
}

export type PayrollEmployeeOption = {
  id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  status: string;
  hire_date: string | null;
  termination_date: string | null;
};

export type PayrollEmployeeEntry = {
  id: string;
  payroll_run_id: string;
  employee_id: string;

  employee_code: string | null;
  first_name: string;
  last_name: string;

  gross_salary: number;
  salary_cost: number | null;
  other_salary_items: number;
  social_security_base: number;
  taxable_income: number | null;
  net_salary: number;

  employer_contributions: number;
  employee_contributions: number;
  income_tax: number | null;

  tfr_accrual: number;
  tfr_inps: number;
  tfr_recovery: number;

  reimbursements: number;
  travel_allowances: number | null;
  bonuses: number | null;

  loan_deductions: number;
  fifth_assignment_deductions: number;

  company_cost: number;

  worked_hours: number;
  holiday_hours: number | null;
  leave_hours: number | null;
  sickness_hours: number | null;
  accident_hours: number | null;

  notes: string | null;

  created_at: string;
  updated_at: string;
};



const nullablePayrollNumberSchema =
  z.number().nullable();

const nonNegativeNullablePayrollNumberSchema =
  z.number().min(0).nullable();

const payrollEmployeeEntrySchema =
  z.object({
    payroll_run_id:
      z.uuid(),

    employee_id:
      z.uuid(),

    gross_salary:
      z.coerce
        .number()
        .min(0),

    salary_cost:
      nonNegativeNullablePayrollNumberSchema,

    other_salary_items:
      z.coerce
        .number(),

    social_security_base:
      z.coerce
        .number()
        .min(0),

    taxable_income:
      nonNegativeNullablePayrollNumberSchema,

    net_salary:
      z.coerce
        .number()
        .min(0),


    employee_contributions:
      z.coerce
        .number()
        .min(0),

    income_tax:
      nonNegativeNullablePayrollNumberSchema,

    tfr_accrual:
      z.coerce
        .number(),

    tfr_inps:
      z.coerce
        .number(),

    tfr_recovery:
      z.coerce
        .number(),

    reimbursements:
      z.coerce
        .number(),

    travel_allowances:
      nullablePayrollNumberSchema,

    bonuses:
      nullablePayrollNumberSchema,

    loan_deductions:
      z.coerce.number().min(0),

    fifth_assignment_deductions:
      z.coerce.number().min(0),


    worked_hours:
      z.coerce
        .number()
        .min(0),

    holiday_hours:
      nonNegativeNullablePayrollNumberSchema,

    leave_hours:
      nonNegativeNullablePayrollNumberSchema,

    sickness_hours:
      nonNegativeNullablePayrollNumberSchema,

    accident_hours:
      nonNegativeNullablePayrollNumberSchema,

    notes:
      z.string()
        .trim()
        .max(10000)
        .default(""),
  });

function nullableFormNumber(
  form: FormData,
  name: string,
): number | null {
  const raw = form.get(name);

  if (
    raw === null ||
    typeof raw !== "string" ||
    raw.trim() === ""
  ) {
    return null;
  }

  const parsed = Number(
    raw.trim().replace(",", "."),
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export async function savePayrollEmployeeEntryAction(
  form: FormData,
) {
  let payrollRunId = "";

  try {
    const values =
      payrollEmployeeEntrySchema.parse({
        payroll_run_id:
          form.get(
            "payroll_run_id",
          ),

        employee_id:
          form.get(
            "employee_id",
          ),

        gross_salary:
          form.get(
            "gross_salary",
          ) || 0,

        salary_cost:
          nullableFormNumber(
            form,
            "salary_cost",
          ),

        other_salary_items:
          form.get(
            "other_salary_items",
          ) || 0,

        social_security_base:
          form.get(
            "social_security_base",
          ) || 0,

        taxable_income:
          nullableFormNumber(
            form,
            "taxable_income",
          ),

        net_salary:
          form.get(
            "net_salary",
          ) || 0,


        employee_contributions:
          form.get(
            "employee_contributions",
          ) || 0,

        income_tax:
          nullableFormNumber(
            form,
            "income_tax",
          ),

        tfr_accrual:
          form.get(
            "tfr_accrual",
          ) || 0,

        tfr_inps:
          form.get(
            "tfr_inps",
          ) || 0,

        tfr_recovery:
          form.get(
            "tfr_recovery",
          ) || 0,

        reimbursements:
          form.get(
            "reimbursements",
          ) || 0,

        travel_allowances:
          nullableFormNumber(
            form,
            "travel_allowances",
          ),

        bonuses:
          nullableFormNumber(
            form,
            "bonuses",
          ),

        loan_deductions:
          form.get(
            "loan_deductions",
          ) || 0,

        fifth_assignment_deductions:
          form.get(
            "fifth_assignment_deductions",
          ) || 0,


        worked_hours:
          form.get(
            "worked_hours",
          ) || 0,

        holiday_hours:
          nullableFormNumber(
            form,
            "holiday_hours",
          ),

        leave_hours:
          nullableFormNumber(
            form,
            "leave_hours",
          ),

        sickness_hours:
          nullableFormNumber(
            form,
            "sickness_hours",
          ),

        accident_hours:
          nullableFormNumber(
            form,
            "accident_hours",
          ),

        notes:
          form.get("notes") || "",
      });

    payrollRunId =
      values.payroll_run_id;

    const db =
      await authorizedClient(
        "payroll.update",
      );

    const result = await db.rpc(
      "payroll_upsert_employee_entry",
      {
        p_payroll_run_id:
          values.payroll_run_id,

        p_employee_id:
          values.employee_id,

        p_gross_salary:
          values.gross_salary,

        p_salary_cost:
          values.salary_cost,

        p_other_salary_items:
          values.other_salary_items,

        p_social_security_base:
          values.social_security_base,

        p_taxable_income:
          values.taxable_income,

        p_net_salary:
          values.net_salary,


        p_employee_contributions:
          values.employee_contributions,

        p_income_tax:
          values.income_tax,

        p_tfr_accrual:
          values.tfr_accrual,

        p_tfr_inps:
          values.tfr_inps,

        p_tfr_recovery:
          values.tfr_recovery,

        p_reimbursements:
          values.reimbursements,

        p_travel_allowances:
          values.travel_allowances,

        p_bonuses:
          values.bonuses,


        p_worked_hours:
          values.worked_hours,

        p_holiday_hours:
          values.holiday_hours,

        p_leave_hours:
          values.leave_hours,

        p_sickness_hours:
          values.sickness_hours,

        p_accident_hours:
          values.accident_hours,

        p_notes:
          values.notes || null,
      },
    );

    checkDatabase(
      result.error,
      "Salvataggio dati paghe dipendente",
    );

    if (!result.data) {
      throw new Error(
        "Salvataggio dati paghe non confermato.",
      );
    }

    const deductionsResult = await db.rpc(
      "payroll_set_employee_loan_deductions",
      {
        p_employee_entry_id:
          String(result.data),

        p_loan_deductions:
          values.loan_deductions,

        p_fifth_assignment_deductions:
          values.fifth_assignment_deductions,
      },
    );

    checkDatabase(
      deductionsResult.error,
      "Salvataggio trattenute prestiti e cessioni",
    );

    revalidatePath(
      `/paghe/${payrollRunId}`,
    );

    revalidatePath(
      "/paghe",
    );

    redirect(
      `/paghe/${payrollRunId}?success=${encodeURIComponent(
        "Dati del dipendente salvati.",
      )}`,
    );
  } catch (error) {
    /*
     * Non intercettiamo il redirect
     * interno di Next.
     */
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String(
        (
          error as {
            digest?: unknown;
          }
        ).digest,
      ).startsWith(
        "NEXT_REDIRECT",
      )
    ) {
      throw error;
    }

    const parsed =
      publicError(error);

    const destination =
      payrollRunId
        ? `/paghe/${payrollRunId}`
        : "/paghe";

    redirect(
      `${destination}?error=${encodeURIComponent(
        parsed.message,
      )}&error_kind=${encodeURIComponent(
        parsed.kind,
      )}`,
    );
  }
}

// ============================================================
// P1.7 — ORE E ALLOCAZIONE COSTI ALLE COMMESSE
// ============================================================

export type PayrollProjectOption = {
  id: string;
  project_code: string;
  name: string;
};

export type PayrollProjectHours = {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  hour_type:
  | "worked"
  | "holiday"
  | "leave"
  | "sickness"
  | "accident"
  | "training"
  | "travel"
  | "other";
  hours: number;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollAllocation = {
  id: string;
  employee_entry_id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  allocation_method:
  | "hours"
  | "percentage"
  | "equal"
  | "manual"
  | "fixed_project";
  worked_hours: number;
  allocation_percentage: number;
  salary_amount: number;
  employer_contributions_amount: number;
  other_cost_amount: number;
  total_allocated_cost: number;
  manual_override: boolean;
  override_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollAllocationProposal = {
  project_id: string;
  project_code: string;
  project_name: string;
  worked_hours: number;
  allocation_percentage: number;
  proposed_cost: number;
};

async function getPayrollProjectDirectory(
  db: Awaited<ReturnType<typeof authorizedClient>>,
  projectIds?: string[],
): Promise<Map<string, PayrollProjectOption>> {
  let query = db
    .from("projects")
    .select("id,project_code,name")
    .is("archived_at", null)
    .order("project_code");

  if (projectIds) {
    if (projectIds.length === 0) {
      return new Map();
    }

    query = query.in("id", projectIds);
  }

  const result = await query;

  checkDatabase(
    result.error,
    "Lettura commesse paghe",
  );

  return new Map(
    (result.data ?? []).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        project_code: String(row.project_code ?? ""),
        name: String(row.name ?? ""),
      },
    ]),
  );
}

export async function getPayrollProjects(): Promise<
  PayrollProjectOption[]
> {
  const db = await authorizedClient(
    "payroll.employee.read",
  );

  const directory =
    await getPayrollProjectDirectory(db);

  return Array.from(directory.values());
}

export async function getPayrollProjectHours(
  payrollRunId: string,
): Promise<PayrollProjectHours[]> {
  const runId = uuidSchema.parse(payrollRunId);
  const db = await authorizedClient(
    "payroll.employee.read",
  );

  const result = await db
    .from("payroll_employee_project_hours")
    .select(`
      id,
      payroll_run_id,
      employee_id,
      project_id,
      hour_type,
      hours,
      source,
      notes,
      created_at,
      updated_at
    `)
    .eq("payroll_run_id", runId)
    .not("project_id", "is", null)
    .order("created_at");

  checkDatabase(
    result.error,
    "Lettura ore commesse paghe",
  );

  const rows = result.data ?? [];
  const projectIds = Array.from(
    new Set(
      rows
        .map((row) => stringOrNull(row.project_id))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const projects =
    await getPayrollProjectDirectory(
      db,
      projectIds,
    );

  return rows.map((row) => {
    const projectId = String(row.project_id);
    const project = projects.get(projectId);

    return {
      id: String(row.id),
      payroll_run_id: String(row.payroll_run_id),
      employee_id: String(row.employee_id),
      project_id: projectId,
      project_code: project?.project_code ?? "-",
      project_name: project?.name ?? "Commessa",
      hour_type: row.hour_type as PayrollProjectHours["hour_type"],
      hours: numberValue(row.hours),
      source: stringOrNull(row.source),
      notes: stringOrNull(row.notes),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    } satisfies PayrollProjectHours;
  });
}

export async function getPayrollAllocations(
  payrollRunId: string,
): Promise<PayrollAllocation[]> {
  const runId = uuidSchema.parse(payrollRunId);
  const db = await authorizedClient(
    "payroll.employee.read",
  );

  const entriesResult = await db
    .from("payroll_employee_entries")
    .select("id")
    .eq("payroll_run_id", runId);

  checkDatabase(
    entriesResult.error,
    "Lettura righe elaborazione paghe",
  );

  const entryIds = (entriesResult.data ?? []).map(
    (row) => String(row.id),
  );

  if (entryIds.length === 0) {
    return [];
  }

  const result = await db
    .from("payroll_allocations")
    .select(`
      id,
      employee_entry_id,
      project_id,
      allocation_method,
      worked_hours,
      allocation_percentage,
      salary_amount,
      employer_contributions_amount,
      other_cost_amount,
      total_allocated_cost,
      manual_override,
      override_reason,
      created_at,
      updated_at
    `)
    .in("employee_entry_id", entryIds)
    .order("created_at");

  checkDatabase(
    result.error,
    "Lettura allocazioni paghe",
  );

  const rows = result.data ?? [];
  const projectIds = Array.from(
    new Set(
      rows.map((row) => String(row.project_id)),
    ),
  );

  const projects =
    await getPayrollProjectDirectory(
      db,
      projectIds,
    );

  return rows.map((row) => {
    const projectId = String(row.project_id);
    const project = projects.get(projectId);

    return {
      id: String(row.id),
      employee_entry_id: String(
        row.employee_entry_id,
      ),
      project_id: projectId,
      project_code: project?.project_code ?? "-",
      project_name: project?.name ?? "Commessa",
      allocation_method:
        row.allocation_method as PayrollAllocation["allocation_method"],
      worked_hours: numberValue(row.worked_hours),
      allocation_percentage: numberValue(
        row.allocation_percentage,
      ),
      salary_amount: numberValue(row.salary_amount),
      employer_contributions_amount: numberValue(
        row.employer_contributions_amount,
      ),
      other_cost_amount: numberValue(
        row.other_cost_amount,
      ),
      total_allocated_cost: numberValue(
        row.total_allocated_cost,
      ),
      manual_override: row.manual_override === true,
      override_reason: stringOrNull(
        row.override_reason,
      ),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    } satisfies PayrollAllocation;
  });
}

export async function getPayrollAllocationProposal(
  employeeEntryId: string,
): Promise<PayrollAllocationProposal[]> {
  const entryId = uuidSchema.parse(employeeEntryId);
  const db = await authorizedClient(
    "payroll.employee.read",
  );

  const result = await db.rpc(
    "payroll_propose_hour_allocation",
    {
      p_employee_entry_id: entryId,
    },
  );

  checkDatabase(
    result.error,
    "Calcolo proposta allocazione paghe",
  );

  const rows = (result.data ?? []) as Array<
    Record<string, unknown>
  >;

  const projectIds = Array.from(
    new Set(
      rows.map((row) => String(row.project_id)),
    ),
  );

  const projects =
    await getPayrollProjectDirectory(
      db,
      projectIds,
    );

  return rows.map((row) => {
    const projectId = String(row.project_id);
    const project = projects.get(projectId);

    return {
      project_id: projectId,
      project_code: project?.project_code ?? "-",
      project_name: project?.name ?? "Commessa",
      worked_hours: numberValue(row.worked_hours),
      allocation_percentage: numberValue(
        row.proposed_percentage,
      ),
      proposed_cost: numberValue(row.proposed_cost),
    } satisfies PayrollAllocationProposal;
  });
}

const payrollProjectHoursSchema = z.object({
  payroll_run_id: z.uuid(),
  employee_id: z.uuid(),
  project_id: z.uuid(),
  hour_type: z.enum([
    "worked",
    "holiday",
    "leave",
    "sickness",
    "accident",
    "training",
    "travel",
    "other",
  ]),
  hours: z.coerce.number().min(0),
  source: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(10000).default(""),
});

const payrollManualAllocationSchema = z.object({
  payroll_run_id: z.uuid(),
  employee_entry_id: z.uuid(),
  project_id: z.uuid(),
  allocation_percentage: z.coerce
    .number()
    .min(0)
    .max(100),
  total_allocated_cost: z.coerce.number().min(0),
  worked_hours: z.coerce.number().min(0),
  reason: z.string().trim().min(1).max(10000),
});

function isNextRedirect(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "digest" in error &&
    String(
      (error as { digest?: unknown }).digest,
    ).startsWith("NEXT_REDIRECT"),
  );
}

function payrollRunRedirect(
  payrollRunId: string,
  kind: "success" | "error",
  message: string,
  errorKind?: string,
): never {
  const params = new URLSearchParams();
  params.set(kind, message);

  if (errorKind) {
    params.set("error_kind", errorKind);
  }

  redirect(
    `/paghe/${payrollRunId}?${params.toString()}`,
  );
}

export async function savePayrollProjectHoursAction(
  form: FormData,
) {
  let payrollRunId = "";

  try {
    const values = payrollProjectHoursSchema.parse({
      payroll_run_id: form.get("payroll_run_id"),
      employee_id: form.get("employee_id"),
      project_id: form.get("project_id"),
      hour_type: form.get("hour_type") || "worked",
      hours: form.get("hours") || 0,
      source: form.get("source") || "",
      notes: form.get("notes") || "",
    });

    payrollRunId = values.payroll_run_id;

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_set_employee_project_hours",
      {
        p_payroll_run_id: values.payroll_run_id,
        p_employee_id: values.employee_id,
        p_project_id: values.project_id,
        p_hour_type: values.hour_type,
        p_hours: values.hours,
        p_source: values.source || null,
        p_notes: values.notes || null,
      },
    );

    checkDatabase(
      result.error,
      "Salvataggio ore commessa",
    );

    revalidatePath(`/paghe/${payrollRunId}`);

    payrollRunRedirect(
      payrollRunId,
      "success",
      values.hours === 0
        ? "Ore commessa rimosse."
        : "Ore commessa salvate.",
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(parsed.message)}&error_kind=${encodeURIComponent(parsed.kind)}`,
      );
    }

    payrollRunRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function applyPayrollHourAllocationAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    payrollRunId = uuidSchema.parse(payrollRunId);
    const employeeEntryId = uuidSchema.parse(
      String(form.get("employee_entry_id") || ""),
    );

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_apply_hour_allocation",
      {
        p_employee_entry_id: employeeEntryId,
      },
    );

    checkDatabase(
      result.error,
      "Applicazione allocazione per ore",
    );

    revalidatePath(`/paghe/${payrollRunId}`);

    payrollRunRedirect(
      payrollRunId,
      "success",
      "Allocazione per ore applicata.",
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(parsed.message)}&error_kind=${encodeURIComponent(parsed.kind)}`,
      );
    }

    payrollRunRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function savePayrollManualAllocationAction(
  form: FormData,
) {
  let payrollRunId = "";

  try {
    const values = payrollManualAllocationSchema.parse({
      payroll_run_id: form.get("payroll_run_id"),
      employee_entry_id: form.get("employee_entry_id"),
      project_id: form.get("project_id"),
      allocation_percentage:
        form.get("allocation_percentage") || 0,
      total_allocated_cost:
        form.get("total_allocated_cost") || 0,
      worked_hours: form.get("worked_hours") || 0,
      reason: form.get("reason") || "",
    });

    payrollRunId = values.payroll_run_id;

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_set_manual_allocation",
      {
        p_employee_entry_id:
          values.employee_entry_id,
        p_project_id: values.project_id,
        p_allocation_percentage:
          values.allocation_percentage,
        p_total_allocated_cost:
          values.total_allocated_cost,
        p_reason: values.reason,
        p_worked_hours: values.worked_hours,
      },
    );

    checkDatabase(
      result.error,
      "Salvataggio allocazione manuale",
    );

    revalidatePath(`/paghe/${payrollRunId}`);

    payrollRunRedirect(
      payrollRunId,
      "success",
      "Allocazione manuale salvata.",
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(parsed.message)}&error_kind=${encodeURIComponent(parsed.kind)}`,
      );
    }

    payrollRunRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function deletePayrollAllocationAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    payrollRunId = uuidSchema.parse(payrollRunId);
    const allocationId = uuidSchema.parse(
      String(form.get("allocation_id") || ""),
    );

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_delete_allocation",
      {
        p_allocation_id: allocationId,
      },
    );

    checkDatabase(
      result.error,
      "Eliminazione allocazione paghe",
    );

    revalidatePath(`/paghe/${payrollRunId}`);

    payrollRunRedirect(
      payrollRunId,
      "success",
      "Allocazione rimossa.",
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(parsed.message)}&error_kind=${encodeURIComponent(parsed.kind)}`,
      );
    }

    payrollRunRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function deletePayrollProjectHoursAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    payrollRunId = uuidSchema.parse(payrollRunId);
    const hoursId = uuidSchema.parse(
      String(form.get("hours_id") || ""),
    );

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_delete_employee_project_hours",
      {
        p_hours_id: hoursId,
      },
    );

    checkDatabase(
      result.error,
      "Eliminazione ore commessa",
    );

    revalidatePath(`/paghe/${payrollRunId}`);

    payrollRunRedirect(
      payrollRunId,
      "success",
      "Ore commessa rimosse.",
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(parsed.message)}&error_kind=${encodeURIComponent(parsed.kind)}`,
      );
    }

    payrollRunRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}


// ============================================================
// P1.8 — TFR
// ============================================================

export type PayrollTfrMovementType =
  | "opening_balance"
  | "accrual"
  | "revaluation"
  | "advance"
  | "settlement"
  | "transfer_pension_fund"
  | "transfer_inps"
  | "recovery_inps"
  | "adjustment";

export type PayrollTfrBalance = {
  employee_id: string;
  legal_entity_id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  current_balance: number;
  opening_balance: number;
  total_accruals: number;
  total_revaluations: number;
  total_advances: number;
  total_settlements: number;
  last_movement_date: string | null;
};

export type PayrollTfrLedgerEntry = {
  id: string;
  employee_id: string;
  legal_entity_id: string;
  payroll_run_id: string | null;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  movement_date: string;
  movement_type: PayrollTfrMovementType;
  amount: number;
  running_balance: number;
  source: string | null;
  source_reference: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PayrollTfrEmployeeOption = {
  id: string;
  legal_entity_id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  status: string;
  hire_date: string | null;
  termination_date: string | null;
};

export type PayrollTfrMovement = {
  id: string;
  employee_id: string;
  legal_entity_id: string;
  payroll_run_id: string | null;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  movement_date: string;
  movement_type: PayrollTfrMovementType;
  amount: number;
  source: string | null;
  source_reference: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export async function getPayrollTfrEmployees(
  legalEntityId?: string,
): Promise<PayrollTfrEmployeeOption[]> {
  const db = await authorizedClient(
    "payroll.tfr.read",
  );

  let query = db
    .from("employees")
    .select(`
      id,
      legal_entity_id,
      employee_code,
      first_name,
      last_name,
      status,
      hire_date,
      termination_date
    `)
    .is("archived_at", null)
    .order("last_name")
    .order("first_name");

  if (legalEntityId) {
    query = query.eq(
      "legal_entity_id",
      uuidSchema.parse(legalEntityId),
    );
  }

  const result = await query;

  checkDatabase(
    result.error,
    "Lettura dipendenti TFR",
  );

  return (result.data ?? []).map(
    (employee) => ({
      id: String(employee.id),
      legal_entity_id: String(
        employee.legal_entity_id,
      ),
      employee_code: stringOrNull(
        employee.employee_code,
      ),
      first_name: String(
        employee.first_name ?? "",
      ),
      last_name: String(
        employee.last_name ?? "",
      ),
      status: String(
        employee.status ?? "",
      ),
      hire_date: stringOrNull(
        employee.hire_date,
      ),
      termination_date: stringOrNull(
        employee.termination_date,
      ),
    }),
  );
}

async function getPayrollTfrEmployeeDirectory(
  db: Awaited<ReturnType<typeof authorizedClient>>,
  employeeIds: string[],
): Promise<
  Map<
    string,
    {
      employee_code: string | null;
      first_name: string;
      last_name: string;
    }
  >
> {
  if (employeeIds.length === 0) {
    return new Map();
  }

  const result = await db
    .from("employees")
    .select("id,employee_code,first_name,last_name")
    .in("id", employeeIds);

  checkDatabase(
    result.error,
    "Lettura dipendenti TFR",
  );

  return new Map(
    (result.data ?? []).map((employee) => [
      String(employee.id),
      {
        employee_code: stringOrNull(
          employee.employee_code,
        ),
        first_name: String(
          employee.first_name ?? "",
        ),
        last_name: String(
          employee.last_name ?? "",
        ),
      },
    ]),
  );
}

export async function getPayrollTfrBalances(
  legalEntityId?: string,
): Promise<PayrollTfrBalance[]> {
  const db = await authorizedClient(
    "payroll.tfr.read",
  );

  let query = db
    .from("employee_tfr_balances")
    .select(`
      employee_id,
      legal_entity_id,
      current_balance,
      opening_balance,
      total_accruals,
      total_revaluations,
      total_advances,
      total_settlements,
      last_movement_date
    `)
    .order("last_movement_date", {
      ascending: false,
      nullsFirst: false,
    });

  if (legalEntityId) {
    query = query.eq(
      "legal_entity_id",
      uuidSchema.parse(legalEntityId),
    );
  }

  const result = await query;

  checkDatabase(
    result.error,
    "Lettura saldi TFR",
  );

  const rows = result.data ?? [];

  const employeeIds = Array.from(
    new Set(
      rows.map((row) => String(row.employee_id)),
    ),
  );

  const employees =
    await getPayrollTfrEmployeeDirectory(
      db,
      employeeIds,
    );

  return rows
    .map((row) => {
      const employee = employees.get(
        String(row.employee_id),
      );

      return {
        employee_id: String(row.employee_id),
        legal_entity_id: String(
          row.legal_entity_id,
        ),
        employee_code:
          employee?.employee_code ?? null,
        first_name:
          employee?.first_name ?? "",
        last_name:
          employee?.last_name ?? "",
        current_balance: numberValue(
          row.current_balance,
        ),
        opening_balance: numberValue(
          row.opening_balance,
        ),
        total_accruals: numberValue(
          row.total_accruals,
        ),
        total_revaluations: numberValue(
          row.total_revaluations,
        ),
        total_advances: numberValue(
          row.total_advances,
        ),
        total_settlements: numberValue(
          row.total_settlements,
        ),
        last_movement_date: stringOrNull(
          row.last_movement_date,
        ),
      } satisfies PayrollTfrBalance;
    })
    .sort(
      (a, b) =>
        a.last_name.localeCompare(
          b.last_name,
          "it",
        ) ||
        a.first_name.localeCompare(
          b.first_name,
          "it",
        ),
    );
}

export async function getPayrollTfrLedger(
  employeeId: string,
  legalEntityId?: string,
): Promise<PayrollTfrLedgerEntry[]> {
  const parsedEmployeeId =
    uuidSchema.parse(employeeId);

  const db = await authorizedClient(
    "payroll.tfr.read",
  );

  let query = db
    .from("employee_tfr_ledger")
    .select(`
      id,
      employee_id,
      legal_entity_id,
      payroll_run_id,
      movement_date,
      movement_type,
      amount,
      running_balance,
      source,
      source_reference,
      notes,
      created_by,
      created_at,
      updated_at
    `)
    .eq("employee_id", parsedEmployeeId)
    .order("movement_date", {
      ascending: true,
    })
    .order("created_at", {
      ascending: true,
    });

  if (legalEntityId) {
    query = query.eq(
      "legal_entity_id",
      uuidSchema.parse(legalEntityId),
    );
  }

  const result = await query;

  checkDatabase(
    result.error,
    "Lettura mastro TFR",
  );

  const rows = result.data ?? [];

  const employees =
    await getPayrollTfrEmployeeDirectory(
      db,
      [parsedEmployeeId],
    );

  const employee = employees.get(
    parsedEmployeeId,
  );

  return rows.map((row) => ({
    id: String(row.id),
    employee_id: String(row.employee_id),
    legal_entity_id: String(
      row.legal_entity_id,
    ),
    payroll_run_id: stringOrNull(
      row.payroll_run_id,
    ),
    employee_code:
      employee?.employee_code ?? null,
    first_name:
      employee?.first_name ?? "",
    last_name:
      employee?.last_name ?? "",
    movement_date: String(
      row.movement_date,
    ),
    movement_type:
      row.movement_type as PayrollTfrMovementType,
    amount: numberValue(row.amount),
    running_balance: numberValue(
      row.running_balance,
    ),
    source: stringOrNull(row.source),
    source_reference: stringOrNull(
      row.source_reference,
    ),
    notes: stringOrNull(row.notes),
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

export async function getPayrollTfrMovements(
  filter: {
    payroll_run_id?: string;
    employee_id?: string;
    legal_entity_id?: string;
  } = {},
): Promise<PayrollTfrMovement[]> {
  const db = await authorizedClient(
    "payroll.tfr.read",
  );

  let query = db
    .from("employee_tfr_movements")
    .select(`
      id,
      employee_id,
      legal_entity_id,
      payroll_run_id,
      movement_date,
      movement_type,
      amount,
      source,
      source_reference,
      notes,
      created_by,
      created_at,
      updated_at
    `)
    .order("movement_date", {
      ascending: false,
    })
    .order("created_at", {
      ascending: false,
    });

  if (filter.payroll_run_id) {
    query = query.eq(
      "payroll_run_id",
      uuidSchema.parse(
        filter.payroll_run_id,
      ),
    );
  }

  if (filter.employee_id) {
    query = query.eq(
      "employee_id",
      uuidSchema.parse(
        filter.employee_id,
      ),
    );
  }

  if (filter.legal_entity_id) {
    query = query.eq(
      "legal_entity_id",
      uuidSchema.parse(
        filter.legal_entity_id,
      ),
    );
  }

  const result = await query;

  checkDatabase(
    result.error,
    "Lettura movimenti TFR",
  );

  const rows = result.data ?? [];

  const employeeIds = Array.from(
    new Set(
      rows.map((row) => String(row.employee_id)),
    ),
  );

  const employees =
    await getPayrollTfrEmployeeDirectory(
      db,
      employeeIds,
    );

  return rows.map((row) => {
    const employee = employees.get(
      String(row.employee_id),
    );

    return {
      id: String(row.id),
      employee_id: String(row.employee_id),
      legal_entity_id: String(
        row.legal_entity_id,
      ),
      payroll_run_id: stringOrNull(
        row.payroll_run_id,
      ),
      employee_code:
        employee?.employee_code ?? null,
      first_name:
        employee?.first_name ?? "",
      last_name:
        employee?.last_name ?? "",
      movement_date: String(
        row.movement_date,
      ),
      movement_type:
        row.movement_type as PayrollTfrMovementType,
      amount: numberValue(row.amount),
      source: stringOrNull(row.source),
      source_reference: stringOrNull(
        row.source_reference,
      ),
      notes: stringOrNull(row.notes),
      created_by: String(row.created_by),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    } satisfies PayrollTfrMovement;
  });
}

const payrollTfrMovementSchema = z.object({
  movement_id: z.union([
    z.uuid(),
    z.literal(""),
  ]).default(""),
  employee_id: z.uuid(),
  legal_entity_id: z.uuid(),
  payroll_run_id: z.union([
    z.uuid(),
    z.literal(""),
  ]).default(""),
  movement_date: z.iso.date(),
  movement_type: z.enum([
    "opening_balance",
    "accrual",
    "revaluation",
    "advance",
    "settlement",
    "transfer_pension_fund",
    "transfer_inps",
    "recovery_inps",
    "adjustment",
  ]),
  amount: z.coerce
    .number()
    .refine(
      (value) => value !== 0,
      "L'importo deve essere diverso da zero.",
    ),
  source: z
    .string()
    .trim()
    .max(200)
    .default(""),
  source_reference: z
    .string()
    .trim()
    .max(500)
    .default(""),
  notes: z
    .string()
    .trim()
    .max(10000)
    .default(""),
});

export async function savePayrollTfrMovementAction(
  form: FormData,
) {
  let payrollRunId = "";

  try {
    const values =
      payrollTfrMovementSchema.parse({
        movement_id:
          form.get("movement_id") || "",
        employee_id:
          form.get("employee_id"),
        legal_entity_id:
          form.get("legal_entity_id"),
        payroll_run_id:
          form.get("payroll_run_id") || "",
        movement_date:
          form.get("movement_date"),
        movement_type:
          form.get("movement_type"),
        amount:
          form.get("amount"),
        source:
          form.get("source") || "",
        source_reference:
          form.get("source_reference") || "",
        notes:
          form.get("notes") || "",
      });

    payrollRunId =
      values.payroll_run_id || "";

    const db = await authorizedClient(
      "payroll.tfr.manage",
    );

    const result = await db.rpc(
      "payroll_upsert_tfr_movement",
      {
        p_movement_id:
          values.movement_id || null,
        p_employee_id:
          values.employee_id,
        p_legal_entity_id:
          values.legal_entity_id,
        p_payroll_run_id:
          values.payroll_run_id || null,
        p_movement_date:
          values.movement_date,
        p_movement_type:
          values.movement_type,
        p_amount:
          values.amount,
        p_source:
          values.source || null,
        p_source_reference:
          values.source_reference || null,
        p_notes:
          values.notes || null,
      },
    );

    checkDatabase(
      result.error,
      "Salvataggio movimento TFR",
    );

    if (!result.data) {
      throw new Error(
        "Salvataggio movimento TFR non confermato.",
      );
    }

    revalidatePath("/paghe", "layout");

    if (payrollRunId) {
      payrollRunRedirect(
        payrollRunId,
        "success",
        values.movement_id
          ? "Movimento TFR aggiornato."
          : "Movimento TFR registrato.",
      );
    }

    redirect(
      `/paghe/tfr?success=${encodeURIComponent(
        values.movement_id
          ? "Movimento TFR aggiornato."
          : "Movimento TFR registrato.",
      )}`,
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (payrollRunId) {
      payrollRunRedirect(
        payrollRunId,
        "error",
        parsed.message,
        parsed.kind,
      );
    }

    redirect(
      `/paghe/tfr?error=${encodeURIComponent(
        parsed.message,
      )}&error_kind=${encodeURIComponent(
        parsed.kind,
      )}`,
    );
  }
}

export async function deletePayrollTfrMovementAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    if (payrollRunId) {
      payrollRunId =
        uuidSchema.parse(payrollRunId);
    }

    const movementId =
      uuidSchema.parse(
        String(
          form.get("movement_id") || "",
        ),
      );

    const db = await authorizedClient(
      "payroll.tfr.manage",
    );

    const result = await db.rpc(
      "payroll_delete_tfr_movement",
      {
        p_movement_id: movementId,
      },
    );

    checkDatabase(
      result.error,
      "Eliminazione movimento TFR",
    );

    revalidatePath("/paghe", "layout");

    if (payrollRunId) {
      payrollRunRedirect(
        payrollRunId,
        "success",
        "Movimento TFR eliminato.",
      );
    }

    redirect(
      `/paghe/tfr?success=${encodeURIComponent(
        "Movimento TFR eliminato.",
      )}`,
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (payrollRunId) {
      payrollRunRedirect(
        payrollRunId,
        "error",
        parsed.message,
        parsed.kind,
      );
    }

    redirect(
      `/paghe/tfr?error=${encodeURIComponent(
        parsed.message,
      )}&error_kind=${encodeURIComponent(
        parsed.kind,
      )}`,
    );
  }
}

export async function syncPayrollTfrAccrualAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    payrollRunId =
      uuidSchema.parse(payrollRunId);

    const employeeEntryId =
      uuidSchema.parse(
        String(
          form.get("employee_entry_id") || "",
        ),
      );

    const db = await authorizedClient(
      "payroll.tfr.manage",
    );

    const result = await db.rpc(
      "payroll_sync_tfr_accrual",
      {
        p_employee_entry_id:
          employeeEntryId,
      },
    );

    checkDatabase(
      result.error,
      "Sincronizzazione accantonamento TFR",
    );

    if (!result.data) {
      throw new Error(
        "Sincronizzazione TFR non confermata.",
      );
    }

    revalidatePath(
      `/paghe/${payrollRunId}`,
    );
    revalidatePath(
      "/paghe/tfr",
    );

    payrollRunRedirect(
      payrollRunId,
      "success",
      "Accantonamento TFR sincronizzato.",
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(
          parsed.message,
        )}&error_kind=${encodeURIComponent(
          parsed.kind,
        )}`,
      );
    }

    payrollRunRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

// ============================================================
// P1.9 — PRESTITI / CESSIONI
// ============================================================

export type PayrollLoanType =
  | "loan"
  | "fifth_assignment"
  | "delegation"
  | "garnishment"
  | "other";

export type PayrollLoanStatus =
  | "active"
  | "suspended"
  | "completed"
  | "cancelled";

export type PayrollLoanInstallmentStatus =
  | "expected"
  | "matched"
  | "different"
  | "missing"
  | "suspended"
  | "settled";

export type PayrollLoan = {
  id: string;
  employee_id: string;
  legal_entity_id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  loan_type: PayrollLoanType;
  lender: string | null;
  contract_reference: string | null;
  original_amount: number | null;
  installment_amount: number;
  total_installments: number | null;
  first_installment_date: string | null;
  start_date: string;
  expected_end_date: string | null;
  actual_end_date: string | null;
  status: PayrollLoanStatus;
  notes: string | null;
  processed_installments: number;
  total_withheld: number;
  last_processed_installment: number;
  next_installment_number: number;
  remaining_installments: number | null;
};

export type PayrollLoanInstallment = {
  id: string;
  loan_id: string;
  payroll_run_id: string;
  employee_id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  loan_type: PayrollLoanType;
  lender: string | null;
  installment_number: number;
  expected_amount: number;
  actual_amount: number | null;
  difference: number;
  reconciliation_status:
  | "matched"
  | "different"
  | "missing"
  | "suspended";
  payment_date: string | null;
  notes: string | null;
  payroll_year: number | null;
  payroll_month: number | null;
};

export type PayrollLoanEmployeeOption = {
  id: string;
  legal_entity_id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string;
  status: string;
  hire_date: string | null;
  termination_date: string | null;
};

async function getPayrollLoanEmployeeDirectory(
  db: Awaited<ReturnType<typeof authorizedClient>>,
  employeeIds: string[],
): Promise<
  Map<
    string,
    {
      employee_code: string | null;
      first_name: string;
      last_name: string;
    }
  >
> {
  if (employeeIds.length === 0) {
    return new Map();
  }

  const result = await db
    .from("employees")
    .select("id,employee_code,first_name,last_name")
    .in("id", employeeIds);

  checkDatabase(
    result.error,
    "Lettura dipendenti prestiti",
  );

  return new Map(
    (result.data ?? []).map((employee) => [
      String(employee.id),
      {
        employee_code: stringOrNull(
          employee.employee_code,
        ),
        first_name: String(
          employee.first_name ?? "",
        ),
        last_name: String(
          employee.last_name ?? "",
        ),
      },
    ]),
  );
}

export async function getPayrollLoanEmployees(
  legalEntityId?: string,
): Promise<PayrollLoanEmployeeOption[]> {
  const db = await authorizedClient(
    "payroll.loans.read",
  );

  let query = db
    .from("employees")
    .select(`
      id,
      legal_entity_id,
      employee_code,
      first_name,
      last_name,
      status,
      hire_date,
      termination_date
    `)
    .is("archived_at", null)
    .order("last_name")
    .order("first_name");

  if (legalEntityId) {
    query = query.eq(
      "legal_entity_id",
      uuidSchema.parse(legalEntityId),
    );
  }

  const result = await query;

  checkDatabase(
    result.error,
    "Lettura dipendenti prestiti",
  );

  return (result.data ?? []).map(
    (employee) => ({
      id: String(employee.id),
      legal_entity_id: String(
        employee.legal_entity_id,
      ),
      employee_code: stringOrNull(
        employee.employee_code,
      ),
      first_name: String(
        employee.first_name ?? "",
      ),
      last_name: String(
        employee.last_name ?? "",
      ),
      status: String(
        employee.status ?? "",
      ),
      hire_date: stringOrNull(
        employee.hire_date,
      ),
      termination_date: stringOrNull(
        employee.termination_date,
      ),
    }),
  );
}

export async function getPayrollLoans(
  filter: {
    legal_entity_id?: string;
    employee_id?: string;
    status?: PayrollLoanStatus;
  } = {},
): Promise<PayrollLoan[]> {
  const db = await authorizedClient(
    "payroll.loans.read",
  );

  let query = db
    .from("employee_loan_status")
    .select(`
      loan_id,
      employee_id,
      legal_entity_id,
      loan_type,
      lender,
      contract_reference,
      original_amount,
      installment_amount,
      total_installments,
      first_installment_date,
      start_date,
      expected_end_date,
      actual_end_date,
      status,
      processed_installments,
      total_withheld,
      last_processed_installment,
      next_installment_number,
      remaining_installments
    `)
    .order("start_date", {
      ascending: false,
    });

  if (filter.legal_entity_id) {
    query = query.eq(
      "legal_entity_id",
      uuidSchema.parse(
        filter.legal_entity_id,
      ),
    );
  }

  if (filter.employee_id) {
    query = query.eq(
      "employee_id",
      uuidSchema.parse(
        filter.employee_id,
      ),
    );
  }

  if (filter.status) {
    query = query.eq(
      "status",
      filter.status,
    );
  }

  const result = await query;

  checkDatabase(
    result.error,
    "Lettura prestiti e cessioni",
  );

  const rows = result.data ?? [];
  const employeeIds = Array.from(
    new Set(
      rows.map((row) =>
        String(row.employee_id),
      ),
    ),
  );

  const employees =
    await getPayrollLoanEmployeeDirectory(
      db,
      employeeIds,
    );

  return rows
    .map((row) => {
      const employee = employees.get(
        String(row.employee_id),
      );

      return {
        id: String(row.loan_id),
        employee_id: String(
          row.employee_id,
        ),
        legal_entity_id: String(
          row.legal_entity_id,
        ),
        employee_code:
          employee?.employee_code ?? null,
        first_name:
          employee?.first_name ?? "",
        last_name:
          employee?.last_name ?? "",
        loan_type:
          row.loan_type as PayrollLoanType,
        lender:
          stringOrNull(row.lender),
        contract_reference:
          stringOrNull(
            row.contract_reference,
          ),
        original_amount:
          row.original_amount == null
            ? null
            : numberValue(
              row.original_amount,
            ),
        installment_amount:
          numberValue(
            row.installment_amount,
          ),
        total_installments:
          row.total_installments == null
            ? null
            : numberValue(
              row.total_installments,
            ),
        first_installment_date:
          stringOrNull(
            row.first_installment_date,
          ),
        start_date: String(
          row.start_date,
        ),
        expected_end_date:
          stringOrNull(
            row.expected_end_date,
          ),
        actual_end_date:
          stringOrNull(
            row.actual_end_date,
          ),
        status:
          row.status as PayrollLoanStatus,
        notes: null,
        processed_installments:
          numberValue(
            row.processed_installments,
          ),
        total_withheld:
          numberValue(
            row.total_withheld,
          ),
        last_processed_installment:
          numberValue(
            row.last_processed_installment,
          ),
        next_installment_number:
          numberValue(
            row.next_installment_number,
          ),
        remaining_installments:
          row.remaining_installments ==
            null
            ? null
            : numberValue(
              row.remaining_installments,
            ),
      } satisfies PayrollLoan;
    })
    .sort(
      (a, b) =>
        a.last_name.localeCompare(
          b.last_name,
          "it",
        ) ||
        a.first_name.localeCompare(
          b.first_name,
          "it",
        ),
    );
}

export async function getPayrollLoanById(
  loanId: string,
): Promise<PayrollLoan | null> {
  const id = uuidSchema.parse(loanId);
  const db = await authorizedClient(
    "payroll.loans.read",
  );

  const [statusResult, baseResult] =
    await Promise.all([
      db
        .from("employee_loan_status")
        .select(`
          loan_id,
          employee_id,
          legal_entity_id,
          loan_type,
          lender,
          contract_reference,
          original_amount,
          installment_amount,
          total_installments,
          first_installment_date,
          start_date,
          expected_end_date,
          actual_end_date,
          status,
          processed_installments,
          total_withheld,
          last_processed_installment,
          next_installment_number,
          remaining_installments
        `)
        .eq("loan_id", id)
        .maybeSingle(),

      db
        .from("employee_loans")
        .select("id,notes")
        .eq("id", id)
        .maybeSingle(),
    ]);

  checkDatabase(
    statusResult.error,
    "Lettura prestito o cessione",
  );

  checkDatabase(
    baseResult.error,
    "Lettura note prestito o cessione",
  );

  if (!statusResult.data) {
    return null;
  }

  const row = statusResult.data;
  const employees =
    await getPayrollLoanEmployeeDirectory(
      db,
      [String(row.employee_id)],
    );

  const employee = employees.get(
    String(row.employee_id),
  );

  return {
    id: String(row.loan_id),
    employee_id: String(row.employee_id),
    legal_entity_id: String(
      row.legal_entity_id,
    ),
    employee_code:
      employee?.employee_code ?? null,
    first_name:
      employee?.first_name ?? "",
    last_name:
      employee?.last_name ?? "",
    loan_type:
      row.loan_type as PayrollLoanType,
    lender:
      stringOrNull(row.lender),
    contract_reference:
      stringOrNull(
        row.contract_reference,
      ),
    original_amount:
      row.original_amount == null
        ? null
        : numberValue(
          row.original_amount,
        ),
    installment_amount:
      numberValue(
        row.installment_amount,
      ),
    total_installments:
      row.total_installments == null
        ? null
        : numberValue(
          row.total_installments,
        ),
    first_installment_date:
      stringOrNull(
        row.first_installment_date,
      ),
    start_date: String(
      row.start_date,
    ),
    expected_end_date:
      stringOrNull(
        row.expected_end_date,
      ),
    actual_end_date:
      stringOrNull(
        row.actual_end_date,
      ),
    status:
      row.status as PayrollLoanStatus,
    notes:
      stringOrNull(
        baseResult.data?.notes,
      ),
    processed_installments:
      numberValue(
        row.processed_installments,
      ),
    total_withheld:
      numberValue(row.total_withheld),
    last_processed_installment:
      numberValue(
        row.last_processed_installment,
      ),
    next_installment_number:
      numberValue(
        row.next_installment_number,
      ),
    remaining_installments:
      row.remaining_installments == null
        ? null
        : numberValue(
          row.remaining_installments,
        ),
  };
}

export async function getPayrollLoanInstallments(
  filter: {
    loan_id?: string;
    payroll_run_id?: string;
    employee_id?: string;
  } = {},
): Promise<PayrollLoanInstallment[]> {
  const db = await authorizedClient(
    "payroll.loans.read",
  );

  let query = db
    .from("employee_loan_reconciliation")
    .select(`
      installment_id,
      loan_id,
      payroll_run_id,
      employee_id,
      loan_type,
      lender,
      installment_number,
      expected_amount,
      actual_amount,
      difference,
      reconciliation_status,
      payment_date,
      notes
    `)
    .order("installment_number", {
      ascending: false,
    });

  if (filter.loan_id) {
    query = query.eq(
      "loan_id",
      uuidSchema.parse(filter.loan_id),
    );
  }

  if (filter.payroll_run_id) {
    query = query.eq(
      "payroll_run_id",
      uuidSchema.parse(
        filter.payroll_run_id,
      ),
    );
  }

  if (filter.employee_id) {
    query = query.eq(
      "employee_id",
      uuidSchema.parse(
        filter.employee_id,
      ),
    );
  }

  const result = await query;

  checkDatabase(
    result.error,
    "Lettura rate prestiti",
  );

  const rows = result.data ?? [];

  const employeeIds = Array.from(
    new Set(
      rows.map((row) =>
        String(row.employee_id),
      ),
    ),
  );

  const runIds = Array.from(
    new Set(
      rows.map((row) =>
        String(row.payroll_run_id),
      ),
    ),
  );

  const [
    employees,
    runsResult,
  ] = await Promise.all([
    getPayrollLoanEmployeeDirectory(
      db,
      employeeIds,
    ),
    runIds.length > 0
      ? db
        .from("payroll_runs")
        .select("id,year,month")
        .in("id", runIds)
      : Promise.resolve({
        data: [],
        error: null,
      }),
  ]);

  checkDatabase(
    runsResult.error,
    "Lettura periodi rate prestiti",
  );

  const runDirectory = new Map(
    (runsResult.data ?? []).map(
      (run) => [
        String(run.id),
        {
          year: numberValue(run.year),
          month: numberValue(run.month),
        },
      ],
    ),
  );

  return rows.map((row) => {
    const employee = employees.get(
      String(row.employee_id),
    );

    const run = runDirectory.get(
      String(row.payroll_run_id),
    );

    return {
      id: String(row.installment_id),
      loan_id: String(row.loan_id),
      payroll_run_id: String(
        row.payroll_run_id,
      ),
      employee_id: String(
        row.employee_id,
      ),
      employee_code:
        employee?.employee_code ?? null,
      first_name:
        employee?.first_name ?? "",
      last_name:
        employee?.last_name ?? "",
      loan_type:
        row.loan_type as PayrollLoanType,
      lender:
        stringOrNull(row.lender),
      installment_number:
        numberValue(
          row.installment_number,
        ),
      expected_amount:
        numberValue(
          row.expected_amount,
        ),
      actual_amount:
        row.actual_amount == null
          ? null
          : numberValue(
            row.actual_amount,
          ),
      difference:
        numberValue(row.difference),
      reconciliation_status:
        row.reconciliation_status as PayrollLoanInstallment["reconciliation_status"],
      payment_date:
        stringOrNull(
          row.payment_date,
        ),
      notes:
        stringOrNull(row.notes),
      payroll_year:
        run?.year ?? null,
      payroll_month:
        run?.month ?? null,
    } satisfies PayrollLoanInstallment;
  });
}

const payrollLoanSchema = z.object({
  loan_id: z.union([
    z.literal(""),
    z.uuid(),
  ]).default(""),
  employee_id: z.uuid(),
  legal_entity_id: z.uuid(),
  loan_type: z.enum([
    "loan",
    "fifth_assignment",
    "delegation",
    "garnishment",
    "other",
  ]),
  lender: z
    .string()
    .trim()
    .max(500)
    .default(""),
  contract_reference: z
    .string()
    .trim()
    .max(500)
    .default(""),
  original_amount: z.union([
    z.literal(""),
    z.coerce.number().positive(),
  ]).default(""),
  installment_amount:
    z.coerce.number().positive(),
  total_installments: z.union([
    z.literal(""),
    z.coerce.number().int().positive(),
  ]).default(""),
  first_installment_date: z.union([
    z.literal(""),
    z.iso.date(),
  ]).default(""),
  start_date: z.iso.date(),
  expected_end_date: z.union([
    z.literal(""),
    z.iso.date(),
  ]).default(""),
  actual_end_date: z.union([
    z.literal(""),
    z.iso.date(),
  ]).default(""),
  status: z.enum([
    "active",
    "suspended",
    "completed",
    "cancelled",
  ]).default("active"),
  notes: z
    .string()
    .trim()
    .max(10000)
    .default(""),
});

const payrollLoanInstallmentSchema =
  z.object({
    installment_id: z.union([
      z.literal(""),
      z.uuid(),
    ]).default(""),
    loan_id: z.uuid(),
    payroll_run_id: z.uuid(),
    installment_number:
      z.coerce.number().int().positive(),
    expected_amount:
      z.coerce.number().min(0),
    actual_amount: z.union([
      z.literal(""),
      z.coerce.number().min(0),
    ]).default(""),
    status: z.enum([
      "expected",
      "matched",
      "different",
      "missing",
      "suspended",
      "settled",
    ]).default("expected"),
    payment_date: z.union([
      z.literal(""),
      z.iso.date(),
    ]).default(""),
    notes: z
      .string()
      .trim()
      .max(10000)
      .default(""),
  });

function payrollLoansRedirect(
  kind: "success" | "error",
  message: string,
  errorKind?: string,
  loanId?: string,
): never {
  const params = new URLSearchParams();
  params.set(kind, message);

  if (errorKind) {
    params.set(
      "error_kind",
      errorKind,
    );
  }

  if (loanId) {
    params.set("loan_id", loanId);
  }

  redirect(
    `/paghe/prestiti?${params.toString()}`,
  );
}

export async function savePayrollLoanAction(
  form: FormData,
) {
  try {
    const values = payrollLoanSchema.parse({
      loan_id:
        form.get("loan_id") || "",
      employee_id:
        form.get("employee_id"),
      legal_entity_id:
        form.get("legal_entity_id"),
      loan_type:
        form.get("loan_type"),
      lender:
        form.get("lender") || "",
      contract_reference:
        form.get(
          "contract_reference",
        ) || "",
      original_amount:
        form.get("original_amount") || "",
      installment_amount:
        form.get("installment_amount"),
      total_installments:
        form.get(
          "total_installments",
        ) || "",
      first_installment_date:
        form.get(
          "first_installment_date",
        ) || "",
      start_date:
        form.get("start_date"),
      expected_end_date:
        form.get(
          "expected_end_date",
        ) || "",
      actual_end_date:
        form.get(
          "actual_end_date",
        ) || "",
      status:
        form.get("status") || "active",
      notes:
        form.get("notes") || "",
    });

    const db = await authorizedClient(
      "payroll.loans.manage",
    );

    const result = await db.rpc(
      "payroll_upsert_employee_loan",
      {
        p_loan_id:
          values.loan_id || null,
        p_employee_id:
          values.employee_id,
        p_legal_entity_id:
          values.legal_entity_id,
        p_loan_type:
          values.loan_type,
        p_lender:
          values.lender || null,
        p_contract_reference:
          values.contract_reference ||
          null,
        p_original_amount:
          values.original_amount === ""
            ? null
            : values.original_amount,
        p_installment_amount:
          values.installment_amount,
        p_total_installments:
          values.total_installments === ""
            ? null
            : values.total_installments,
        p_first_installment_date:
          values.first_installment_date ||
          null,
        p_start_date:
          values.start_date,
        p_expected_end_date:
          values.expected_end_date ||
          null,
        p_actual_end_date:
          values.actual_end_date ||
          null,
        p_status:
          values.status,
        p_notes:
          values.notes || null,
      },
    );

    checkDatabase(
      result.error,
      "Salvataggio prestito o cessione",
    );

    if (!result.data) {
      throw new Error(
        "Salvataggio prestito o cessione non confermato.",
      );
    }

    revalidatePath(
      "/paghe/prestiti",
    );
    revalidatePath(
      "/paghe",
    );

    payrollLoansRedirect(
      "success",
      values.loan_id
        ? "Prestito o cessione aggiornato."
        : "Prestito o cessione registrato.",
      undefined,
      String(result.data),
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    payrollLoansRedirect(
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function setPayrollLoanStatusAction(
  form: FormData,
) {
  try {
    const loanId = uuidSchema.parse(
      String(form.get("loan_id") || ""),
    );

    const status = z.enum([
      "active",
      "suspended",
      "completed",
      "cancelled",
    ]).parse(form.get("status"));

    const actualEndDateRaw = String(
      form.get("actual_end_date") || "",
    );

    const actualEndDate =
      actualEndDateRaw
        ? z.iso.date().parse(
          actualEndDateRaw,
        )
        : null;

    const db = await authorizedClient(
      "payroll.loans.manage",
    );

    const result = await db.rpc(
      "payroll_set_employee_loan_status",
      {
        p_loan_id: loanId,
        p_status: status,
        p_actual_end_date:
          actualEndDate,
      },
    );

    checkDatabase(
      result.error,
      "Aggiornamento stato prestito",
    );

    revalidatePath(
      "/paghe/prestiti",
    );

    payrollLoansRedirect(
      "success",
      "Stato del finanziamento aggiornato.",
      undefined,
      loanId,
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    payrollLoansRedirect(
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function savePayrollLoanInstallmentAction(
  form: FormData,
) {
  try {
    const values =
      payrollLoanInstallmentSchema.parse({
        installment_id:
          form.get(
            "installment_id",
          ) || "",
        loan_id:
          form.get("loan_id"),
        payroll_run_id:
          form.get(
            "payroll_run_id",
          ),
        installment_number:
          form.get(
            "installment_number",
          ),
        expected_amount:
          form.get(
            "expected_amount",
          ),
        actual_amount:
          form.get(
            "actual_amount",
          ) || "",
        status:
          form.get("status") ||
          "expected",
        payment_date:
          form.get(
            "payment_date",
          ) || "",
        notes:
          form.get("notes") || "",
      });

    const db = await authorizedClient(
      "payroll.loans.manage",
    );

    const result = await db.rpc(
      "payroll_upsert_loan_installment",
      {
        p_installment_id:
          values.installment_id ||
          null,
        p_loan_id:
          values.loan_id,
        p_payroll_run_id:
          values.payroll_run_id,
        p_installment_number:
          values.installment_number,
        p_expected_amount:
          values.expected_amount,
        p_actual_amount:
          values.actual_amount === ""
            ? null
            : values.actual_amount,
        p_status:
          values.status,
        p_payment_date:
          values.payment_date ||
          null,
        p_notes:
          values.notes || null,
      },
    );

    checkDatabase(
      result.error,
      "Salvataggio rata prestito",
    );

    revalidatePath(
      "/paghe/prestiti",
    );
    revalidatePath(
      `/paghe/${values.payroll_run_id}`,
    );

    payrollLoansRedirect(
      "success",
      "Rata salvata.",
      undefined,
      values.loan_id,
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    payrollLoansRedirect(
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function preparePayrollLoanInstallmentAction(
  form: FormData,
) {
  let loanId = "";

  try {
    loanId = uuidSchema.parse(
      String(form.get("loan_id") || ""),
    );

    const payrollRunId =
      uuidSchema.parse(
        String(
          form.get(
            "payroll_run_id",
          ) || "",
        ),
      );

    const db = await authorizedClient(
      "payroll.loans.manage",
    );

    const result = await db.rpc(
      "payroll_prepare_loan_installment",
      {
        p_loan_id: loanId,
        p_payroll_run_id:
          payrollRunId,
      },
    );

    checkDatabase(
      result.error,
      "Generazione rata attesa",
    );

    revalidatePath(
      "/paghe/prestiti",
    );
    revalidatePath(
      `/paghe/${payrollRunId}`,
    );

    payrollLoansRedirect(
      "success",
      "Rata attesa generata.",
      undefined,
      loanId,
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    payrollLoansRedirect(
      "error",
      parsed.message,
      parsed.kind,
      loanId || undefined,
    );
  }
}

export async function reconcilePayrollLoanInstallmentAction(
  form: FormData,
) {
  let loanId = "";

  try {
    loanId = uuidSchema.parse(
      String(form.get("loan_id") || ""),
    );

    const installmentId =
      uuidSchema.parse(
        String(
          form.get(
            "installment_id",
          ) || "",
        ),
      );

    const db = await authorizedClient(
      "payroll.loans.manage",
    );

    const result = await db.rpc(
      "payroll_reconcile_loan_installment",
      {
        p_installment_id:
          installmentId,
      },
    );

    checkDatabase(
      result.error,
      "Riconciliazione rata prestito",
    );

    revalidatePath(
      "/paghe/prestiti",
    );

    payrollLoansRedirect(
      "success",
      "Rata riconciliata con l'elaborazione paghe.",
      undefined,
      loanId,
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    payrollLoansRedirect(
      "error",
      parsed.message,
      parsed.kind,
      loanId || undefined,
    );
  }
}

export async function deletePayrollLoanInstallmentAction(
  form: FormData,
) {
  let loanId = "";

  try {
    loanId = uuidSchema.parse(
      String(form.get("loan_id") || ""),
    );

    const installmentId =
      uuidSchema.parse(
        String(
          form.get(
            "installment_id",
          ) || "",
        ),
      );

    const db = await authorizedClient(
      "payroll.loans.manage",
    );

    const result = await db.rpc(
      "payroll_delete_loan_installment",
      {
        p_installment_id:
          installmentId,
      },
    );

    checkDatabase(
      result.error,
      "Eliminazione rata prestito",
    );

    revalidatePath(
      "/paghe/prestiti",
    );

    payrollLoansRedirect(
      "success",
      "Rata eliminata.",
      undefined,
      loanId,
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    payrollLoansRedirect(
      "error",
      parsed.message,
      parsed.kind,
      loanId || undefined,
    );
  }
}

export async function deletePayrollLoanAction(
  form: FormData,
) {
  try {
    const loanId = uuidSchema.parse(
      String(form.get("loan_id") || ""),
    );

    const db = await authorizedClient(
      "payroll.loans.manage",
    );

    const result = await db.rpc(
      "payroll_delete_employee_loan",
      {
        p_loan_id: loanId,
      },
    );

    checkDatabase(
      result.error,
      "Eliminazione prestito o cessione",
    );

    revalidatePath(
      "/paghe/prestiti",
    );

    payrollLoansRedirect(
      "success",
      "Prestito o cessione eliminato.",
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    payrollLoansRedirect(
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}


// ============================================================
// P1.10 — CONTABILIZZAZIONE PAGHE
// ============================================================

export type PayrollAccountingAmountSource =
  | "item"
  | "employee_summary"
  | "allocation"
  | "manual";

export type PayrollAccountingAllocationScope =
  | "none"
  | "project"
  | "employee"
  | "project_employee";

export type PayrollAccountingSourceType =
  | "item"
  | "employee_summary"
  | "allocation"
  | "loan"
  | "tfr"
  | "manual";

export type PayrollAccountingItemTypeOption = {
  id: string;
  code: string;
  name: string;
  country: string | null;
  description: string | null;
  affects_company_cost: boolean;
  affects_net: boolean;
  allocatable_to_project: boolean;
  active: boolean;
  sort_order: number;
};

export type PayrollAccountingRule = {
  id: string;
  legal_entity_id: string | null;
  legal_entity_name: string | null;
  country: string | null;
  item_type_id: string;
  item_type_code: string;
  item_type_name: string;
  rule_name: string;
  debit_account_code: string | null;
  credit_account_code: string | null;
  allocation_scope: PayrollAccountingAllocationScope;
  amount_source: PayrollAccountingAmountSource;
  priority: number;
  active: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PayrollAccountingEntry = {
  id: string;
  payroll_run_id: string;
  accounting_rule_id: string | null;
  item_type_id: string | null;
  item_type_code: string | null;
  item_type_name: string | null;
  employee_entry_id: string | null;
  employee_id: string | null;
  employee_code: string | null;
  employee_name: string | null;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  account_code: string;
  description: string;
  debit: number;
  credit: number;
  source_type: PayrollAccountingSourceType;
  source_id: string | null;
  is_manual: boolean;
  manual_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PayrollAccountingBalance = {
  payroll_run_id: string;
  legal_entity_id: string;
  year: number;
  month: number;
  country: string;
  status: PayrollRunStatus;
  entry_count: number;
  total_debit: number;
  total_credit: number;
  difference: number;
  is_balanced: boolean;
};

export type PayrollAccountingAccountSummary = {
  payroll_run_id: string;
  account_code: string;
  debit: number;
  credit: number;
  balance: number;
  entry_count: number;
};

export type PayrollAccountingEmployeeOption = {
  id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string;
};

export type PayrollAccountingProjectOption = {
  id: string;
  project_code: string;
  name: string;
};

export async function getPayrollAccountingItemTypes(): Promise<
  PayrollAccountingItemTypeOption[]
> {
  const db = await authorizedClient(
    "payroll.accounting.read",
  );

  const result = await db
    .from("payroll_item_types")
    .select(`
      id,
      code,
      name,
      country,
      description,
      affects_company_cost,
      affects_net,
      allocatable_to_project,
      active,
      sort_order
    `)
    .eq("active", true)
    .order("sort_order")
    .order("name");

  checkDatabase(
    result.error,
    "Lettura voci contabili paghe",
  );

  return (result.data ?? []).map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    country: stringOrNull(row.country),
    description: stringOrNull(row.description),
    affects_company_cost:
      row.affects_company_cost === true,
    affects_net:
      row.affects_net === true,
    allocatable_to_project:
      row.allocatable_to_project === true,
    active:
      row.active === true,
    sort_order:
      numberValue(row.sort_order),
  }));
}

export async function getPayrollAccountingRules(
  filter: {
    legal_entity_id?: string;
    country?: string;
    active?: boolean;
  } = {},
): Promise<PayrollAccountingRule[]> {
  const db = await authorizedClient(
    "payroll.accounting.read",
  );

  let query = db
    .from("payroll_accounting_rules")
    .select(`
      id,
      legal_entity_id,
      country,
      item_type_id,
      rule_name,
      debit_account_code,
      credit_account_code,
      allocation_scope,
      amount_source,
      priority,
      active,
      notes,
      created_by,
      created_at,
      updated_at,
      item_type:payroll_item_types!payroll_accounting_rules_item_type_id_fkey(
        code,
        name
      ),
      entity:legal_entities!payroll_accounting_rules_legal_entity_id_fkey(
        business_name
      )
    `)
    .order("priority")
    .order("rule_name");

  if (filter.legal_entity_id) {
    const entityId = uuidSchema.parse(
      filter.legal_entity_id,
    );

    query = query.or(
      `legal_entity_id.is.null,legal_entity_id.eq.${entityId}`,
    );
  }

  if (filter.country) {
    const country = filter.country
      .trim()
      .toUpperCase();

    query = query.or(
      `country.is.null,country.eq.${country}`,
    );
  }

  if (filter.active !== undefined) {
    query = query.eq(
      "active",
      filter.active,
    );
  }

  const result = await query;

  checkDatabase(
    result.error,
    "Lettura regole contabili paghe",
  );

  return (result.data ?? []).map((row) => {
    const itemType = relationObject(
      row.item_type,
    );

    const entity = relationObject(
      row.entity,
    );

    return {
      id: String(row.id),
      legal_entity_id:
        stringOrNull(row.legal_entity_id),
      legal_entity_name:
        stringOrNull(entity?.business_name),
      country:
        stringOrNull(row.country),
      item_type_id:
        String(row.item_type_id),
      item_type_code:
        stringOrNull(itemType?.code) ?? "",
      item_type_name:
        stringOrNull(itemType?.name) ?? "",
      rule_name:
        String(row.rule_name ?? ""),
      debit_account_code:
        stringOrNull(
          row.debit_account_code,
        ),
      credit_account_code:
        stringOrNull(
          row.credit_account_code,
        ),
      allocation_scope:
        row.allocation_scope as PayrollAccountingAllocationScope,
      amount_source:
        row.amount_source as PayrollAccountingAmountSource,
      priority:
        numberValue(row.priority),
      active:
        row.active === true,
      notes:
        stringOrNull(row.notes),
      created_by:
        String(row.created_by),
      created_at:
        String(row.created_at),
      updated_at:
        String(row.updated_at),
    } satisfies PayrollAccountingRule;
  });
}

export async function getPayrollAccountingEntries(
  payrollRunId: string,
): Promise<PayrollAccountingEntry[]> {
  const runId =
    uuidSchema.parse(payrollRunId);

  const db = await authorizedClient(
    "payroll.accounting.read",
  );

  const result = await db
    .from("payroll_accounting_entries")
    .select(`
      id,
      payroll_run_id,
      accounting_rule_id,
      item_type_id,
      employee_entry_id,
      employee_id,
      project_id,
      account_code,
      description,
      debit,
      credit,
      source_type,
      source_id,
      is_manual,
      manual_reason,
      created_by,
      created_at,
      updated_at,
      item_type:payroll_item_types!payroll_accounting_entries_item_type_id_fkey(
        code,
        name
      ),
      employee:employees!payroll_accounting_entries_employee_id_fkey(
        employee_code,
        first_name,
        last_name
      ),
      project:projects!payroll_accounting_entries_project_id_fkey(
        project_code,
        name
      )
    `)
    .eq("payroll_run_id", runId)
    .order("account_code")
    .order("created_at");

  checkDatabase(
    result.error,
    "Lettura scritture contabili paghe",
  );

  return (result.data ?? []).map((row) => {
    const itemType =
      relationObject(row.item_type);

    const employee =
      relationObject(row.employee);

    const project =
      relationObject(row.project);

    const firstName =
      stringOrNull(employee?.first_name) ??
      "";

    const lastName =
      stringOrNull(employee?.last_name) ??
      "";

    const employeeName =
      [lastName, firstName]
        .filter(Boolean)
        .join(" ") || null;

    return {
      id: String(row.id),
      payroll_run_id:
        String(row.payroll_run_id),
      accounting_rule_id:
        stringOrNull(
          row.accounting_rule_id,
        ),
      item_type_id:
        stringOrNull(row.item_type_id),
      item_type_code:
        stringOrNull(itemType?.code),
      item_type_name:
        stringOrNull(itemType?.name),
      employee_entry_id:
        stringOrNull(
          row.employee_entry_id,
        ),
      employee_id:
        stringOrNull(row.employee_id),
      employee_code:
        stringOrNull(
          employee?.employee_code,
        ),
      employee_name:
        employeeName,
      project_id:
        stringOrNull(row.project_id),
      project_code:
        stringOrNull(
          project?.project_code,
        ),
      project_name:
        stringOrNull(project?.name),
      account_code:
        String(row.account_code ?? ""),
      description:
        String(row.description ?? ""),
      debit:
        numberValue(row.debit),
      credit:
        numberValue(row.credit),
      source_type:
        row.source_type as PayrollAccountingSourceType,
      source_id:
        stringOrNull(row.source_id),
      is_manual:
        row.is_manual === true,
      manual_reason:
        stringOrNull(
          row.manual_reason,
        ),
      created_by:
        String(row.created_by),
      created_at:
        String(row.created_at),
      updated_at:
        String(row.updated_at),
    } satisfies PayrollAccountingEntry;
  });
}

export async function getPayrollAccountingBalance(
  payrollRunId: string,
): Promise<PayrollAccountingBalance | null> {
  const runId =
    uuidSchema.parse(payrollRunId);

  const db = await authorizedClient(
    "payroll.accounting.read",
  );

  const result = await db
    .from("payroll_accounting_balance")
    .select(`
      payroll_run_id,
      legal_entity_id,
      year,
      month,
      country,
      status,
      entry_count,
      total_debit,
      total_credit,
      difference,
      is_balanced
    `)
    .eq("payroll_run_id", runId)
    .maybeSingle();

  checkDatabase(
    result.error,
    "Lettura quadratura contabile paghe",
  );

  if (!result.data) {
    return null;
  }

  return {
    payroll_run_id:
      String(result.data.payroll_run_id),
    legal_entity_id:
      String(result.data.legal_entity_id),
    year:
      numberValue(result.data.year),
    month:
      numberValue(result.data.month),
    country:
      String(result.data.country ?? ""),
    status:
      result.data.status as PayrollRunStatus,
    entry_count:
      numberValue(
        result.data.entry_count,
      ),
    total_debit:
      numberValue(
        result.data.total_debit,
      ),
    total_credit:
      numberValue(
        result.data.total_credit,
      ),
    difference:
      numberValue(
        result.data.difference,
      ),
    is_balanced:
      result.data.is_balanced === true,
  };
}

export async function getPayrollAccountingByAccount(
  payrollRunId: string,
): Promise<PayrollAccountingAccountSummary[]> {
  const runId =
    uuidSchema.parse(payrollRunId);

  const db = await authorizedClient(
    "payroll.accounting.read",
  );

  const result = await db
    .from("payroll_accounting_by_account")
    .select(`
      payroll_run_id,
      account_code,
      debit,
      credit,
      balance,
      entry_count
    `)
    .eq("payroll_run_id", runId)
    .order("account_code");

  checkDatabase(
    result.error,
    "Lettura riepilogo contabile paghe",
  );

  return (result.data ?? []).map(
    (row) => ({
      payroll_run_id:
        String(row.payroll_run_id),
      account_code:
        String(row.account_code ?? ""),
      debit:
        numberValue(row.debit),
      credit:
        numberValue(row.credit),
      balance:
        numberValue(row.balance),
      entry_count:
        numberValue(row.entry_count),
    }),
  );
}

export async function getPayrollAccountingEmployees(
  payrollRunId: string,
): Promise<PayrollAccountingEmployeeOption[]> {
  const runId =
    uuidSchema.parse(payrollRunId);

  const db = await authorizedClient(
    "payroll.accounting.read",
  );

  const entriesResult = await db
    .from("payroll_employee_entries")
    .select("employee_id")
    .eq("payroll_run_id", runId);

  checkDatabase(
    entriesResult.error,
    "Lettura dipendenti contabilizzazione paghe",
  );

  const employeeIds = Array.from(
    new Set(
      (entriesResult.data ?? [])
        .map((row) =>
          stringOrNull(row.employee_id),
        )
        .filter(
          (id): id is string =>
            Boolean(id),
        ),
    ),
  );

  if (employeeIds.length === 0) {
    return [];
  }

  const result = await db
    .from("employees")
    .select(`
      id,
      employee_code,
      first_name,
      last_name
    `)
    .in("id", employeeIds)
    .order("last_name")
    .order("first_name");

  checkDatabase(
    result.error,
    "Lettura dipendenti contabilizzazione paghe",
  );

  return (result.data ?? []).map(
    (employee) => ({
      id: String(employee.id),
      employee_code:
        stringOrNull(
          employee.employee_code,
        ),
      first_name:
        String(
          employee.first_name ?? "",
        ),
      last_name:
        String(
          employee.last_name ?? "",
        ),
    }),
  );
}

export async function getPayrollAccountingProjects(
  payrollRunId: string,
): Promise<PayrollAccountingProjectOption[]> {
  const runId =
    uuidSchema.parse(payrollRunId);

  const db = await authorizedClient(
    "payroll.accounting.read",
  );

  const entriesResult = await db
    .from("payroll_employee_entries")
    .select("id")
    .eq("payroll_run_id", runId);

  checkDatabase(
    entriesResult.error,
    "Lettura elaborazione per commesse contabili",
  );

  const entryIds = (
    entriesResult.data ?? []
  ).map((row) => String(row.id));

  if (entryIds.length === 0) {
    return [];
  }

  const allocationsResult = await db
    .from("payroll_allocations")
    .select("project_id")
    .in(
      "employee_entry_id",
      entryIds,
    );

  checkDatabase(
    allocationsResult.error,
    "Lettura commesse contabilizzazione paghe",
  );

  const projectIds = Array.from(
    new Set(
      (allocationsResult.data ?? [])
        .map((row) =>
          stringOrNull(row.project_id),
        )
        .filter(
          (id): id is string =>
            Boolean(id),
        ),
    ),
  );

  if (projectIds.length === 0) {
    return [];
  }

  const result = await db
    .from("projects")
    .select("id,project_code,name")
    .in("id", projectIds)
    .order("project_code");

  checkDatabase(
    result.error,
    "Lettura commesse contabilizzazione paghe",
  );

  return (result.data ?? []).map(
    (project) => ({
      id: String(project.id),
      project_code:
        String(
          project.project_code ?? "",
        ),
      name:
        String(project.name ?? ""),
    }),
  );
}

const payrollAccountingRuleSchema =
  z.object({
    rule_id: z.union([
      z.literal(""),
      z.uuid(),
    ]).default(""),

    legal_entity_id: z.union([
      z.literal(""),
      z.uuid(),
    ]).default(""),

    country: z
      .string()
      .trim()
      .max(3)
      .default(""),

    item_type_id:
      z.uuid(),

    rule_name: z
      .string()
      .trim()
      .min(1)
      .max(200),

    debit_account_code: z
      .string()
      .trim()
      .max(100)
      .default(""),

    credit_account_code: z
      .string()
      .trim()
      .max(100)
      .default(""),

    allocation_scope: z.enum([
      "none",
      "project",
      "employee",
      "project_employee",
    ]),

    amount_source: z.enum([
      "item",
      "employee_summary",
      "allocation",
      "manual",
    ]),

    priority: z.coerce
      .number()
      .int(),

    active: z.boolean(),

    notes: z
      .string()
      .trim()
      .max(10000)
      .default(""),
  })
    .refine(
      (value) =>
        Boolean(
          value.debit_account_code ||
          value.credit_account_code,
        ),
      {
        message:
          "Indicare almeno un conto Dare o Avere.",
        path: ["debit_account_code"],
      },
    );

const payrollManualAccountingEntrySchema =
  z.object({
    payroll_run_id:
      z.uuid(),

    account_code: z
      .string()
      .trim()
      .min(1)
      .max(100),

    description: z
      .string()
      .trim()
      .min(1)
      .max(500),

    debit: z.coerce
      .number()
      .min(0),

    credit: z.coerce
      .number()
      .min(0),

    manual_reason: z
      .string()
      .trim()
      .min(1)
      .max(10000),

    employee_id: z.union([
      z.literal(""),
      z.uuid(),
    ]).default(""),

    project_id: z.union([
      z.literal(""),
      z.uuid(),
    ]).default(""),
  })
    .refine(
      (value) =>
        (
          value.debit > 0 &&
          value.credit === 0
        ) ||
        (
          value.credit > 0 &&
          value.debit === 0
        ),
      {
        message:
          "Indicare un solo importo positivo: Dare oppure Avere.",
        path: ["debit"],
      },
    );

function payrollAccountingRedirect(
  payrollRunId: string,
  kind: "success" | "error",
  message: string,
  errorKind?: string,
): never {
  const params =
    new URLSearchParams();

  params.set(kind, message);
  params.set(
    "section",
    "accounting",
  );

  if (errorKind) {
    params.set(
      "error_kind",
      errorKind,
    );
  }

  redirect(
    `/paghe/${payrollRunId}?${params.toString()}`,
  );
}

function payrollAccountingRulesRedirect(
  kind: "success" | "error",
  message: string,
  errorKind?: string,
): never {
  const params =
    new URLSearchParams();

  params.set(kind, message);

  if (errorKind) {
    params.set(
      "error_kind",
      errorKind,
    );
  }

  redirect(
    `/paghe/configurazione?${params.toString()}`,
  );
}

export async function savePayrollAccountingRuleAction(
  form: FormData,
) {
  try {
    const values =
      payrollAccountingRuleSchema.parse({
        rule_id:
          form.get("rule_id") || "",

        legal_entity_id:
          form.get(
            "legal_entity_id",
          ) || "",

        country:
          form.get("country") || "",

        item_type_id:
          form.get("item_type_id"),

        rule_name:
          form.get("rule_name"),

        debit_account_code:
          form.get(
            "debit_account_code",
          ) || "",

        credit_account_code:
          form.get(
            "credit_account_code",
          ) || "",

        allocation_scope:
          form.get(
            "allocation_scope",
          ) || "none",

        amount_source:
          form.get(
            "amount_source",
          ) || "item",

        priority:
          form.get("priority") || 100,

        active:
          form.get("active") === "on",

        notes:
          form.get("notes") || "",
      });

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_upsert_accounting_rule",
      {
        p_id:
          values.rule_id || null,

        p_legal_entity_id:
          values.legal_entity_id ||
          null,

        p_country:
          values.country
            ? values.country.toUpperCase()
            : null,

        p_item_type_id:
          values.item_type_id,

        p_rule_name:
          values.rule_name,

        p_debit_account_code:
          values.debit_account_code ||
          null,

        p_credit_account_code:
          values.credit_account_code ||
          null,

        p_allocation_scope:
          values.allocation_scope,

        p_amount_source:
          values.amount_source,

        p_priority:
          values.priority,

        p_active:
          values.active,

        p_notes:
          values.notes || null,
      },
    );

    checkDatabase(
      result.error,
      "Salvataggio regola contabile paghe",
    );

    revalidatePath(
      "/paghe/configurazione",
    );
    revalidatePath(
      "/paghe",
      "layout",
    );

    payrollAccountingRulesRedirect(
      "success",
      values.rule_id
        ? "Regola contabile aggiornata."
        : "Regola contabile creata.",
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    payrollAccountingRulesRedirect(
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function deletePayrollAccountingRuleAction(
  form: FormData,
) {
  try {
    const ruleId =
      uuidSchema.parse(
        String(
          form.get("rule_id") || "",
        ),
      );

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_delete_accounting_rule",
      {
        p_rule_id: ruleId,
      },
    );

    checkDatabase(
      result.error,
      "Eliminazione regola contabile paghe",
    );

    revalidatePath(
      "/paghe/configurazione",
    );

    payrollAccountingRulesRedirect(
      "success",
      "Regola contabile eliminata.",
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    payrollAccountingRulesRedirect(
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function generatePayrollAccountingEntriesAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    payrollRunId =
      uuidSchema.parse(
        payrollRunId,
      );

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_generate_accounting_entries",
      {
        p_payroll_run_id:
          payrollRunId,
      },
    );

    checkDatabase(
      result.error,
      "Generazione contabilizzazione paghe",
    );

    const generated =
      numberValue(result.data);

    revalidatePath(
      `/paghe/${payrollRunId}`,
    );
    revalidatePath(
      "/paghe",
    );

    payrollAccountingRedirect(
      payrollRunId,
      "success",
      `Contabilizzazione generata: ${generated} righe automatiche.`,
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(
          parsed.message,
        )}&error_kind=${encodeURIComponent(
          parsed.kind,
        )}`,
      );
    }

    payrollAccountingRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function savePayrollManualAccountingEntryAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    const values =
      payrollManualAccountingEntrySchema.parse({
        payroll_run_id:
          form.get(
            "payroll_run_id",
          ),

        account_code:
          form.get(
            "account_code",
          ),

        description:
          form.get(
            "description",
          ),

        debit:
          form.get("debit") || 0,

        credit:
          form.get("credit") || 0,

        manual_reason:
          form.get(
            "manual_reason",
          ),

        employee_id:
          form.get(
            "employee_id",
          ) || "",

        project_id:
          form.get(
            "project_id",
          ) || "",
      });

    payrollRunId =
      values.payroll_run_id;

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_add_manual_accounting_entry",
      {
        p_payroll_run_id:
          values.payroll_run_id,

        p_account_code:
          values.account_code,

        p_description:
          values.description,

        p_debit:
          values.debit,

        p_credit:
          values.credit,

        p_manual_reason:
          values.manual_reason,

        p_employee_id:
          values.employee_id ||
          null,

        p_project_id:
          values.project_id ||
          null,
      },
    );

    checkDatabase(
      result.error,
      "Inserimento riga contabile manuale",
    );

    revalidatePath(
      `/paghe/${payrollRunId}`,
    );
    revalidatePath(
      "/paghe",
    );

    payrollAccountingRedirect(
      payrollRunId,
      "success",
      "Riga contabile manuale inserita.",
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(
          parsed.message,
        )}&error_kind=${encodeURIComponent(
          parsed.kind,
        )}`,
      );
    }

    payrollAccountingRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function deletePayrollManualAccountingEntryAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    payrollRunId =
      uuidSchema.parse(
        payrollRunId,
      );

    const entryId =
      uuidSchema.parse(
        String(
          form.get("entry_id") || "",
        ),
      );

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_delete_manual_accounting_entry",
      {
        p_entry_id:
          entryId,
      },
    );

    checkDatabase(
      result.error,
      "Eliminazione riga contabile manuale",
    );

    revalidatePath(
      `/paghe/${payrollRunId}`,
    );
    revalidatePath(
      "/paghe",
    );

    payrollAccountingRedirect(
      payrollRunId,
      "success",
      "Riga contabile manuale eliminata.",
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(
          parsed.message,
        )}&error_kind=${encodeURIComponent(
          parsed.kind,
        )}`,
      );
    }

    payrollAccountingRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function clearPayrollGeneratedAccountingEntriesAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    payrollRunId =
      uuidSchema.parse(
        payrollRunId,
      );

    const db = await authorizedClient(
      "payroll.update",
    );

    const result = await db.rpc(
      "payroll_clear_generated_accounting_entries",
      {
        p_payroll_run_id:
          payrollRunId,
      },
    );

    checkDatabase(
      result.error,
      "Rimozione contabilizzazione automatica paghe",
    );

    const deleted =
      numberValue(result.data);

    revalidatePath(
      `/paghe/${payrollRunId}`,
    );
    revalidatePath(
      "/paghe",
    );

    payrollAccountingRedirect(
      payrollRunId,
      "success",
      `Rimosse ${deleted} righe automatiche. Le righe manuali sono state mantenute.`,
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(
          parsed.message,
        )}&error_kind=${encodeURIComponent(
          parsed.kind,
        )}`,
      );
    }

    payrollAccountingRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

// ============================================================
// P1.11B — TOTALE CONTRIBUTI AZIENDA
// ============================================================

const payrollEmployerContributionsTotalSchema =
  z.object({
    payroll_run_id: z.uuid(),

    total_employer_contributions:
      z.coerce
        .number()
        .min(
          0,
          "Il totale contributi azienda non può essere negativo.",
        ),
  });

export async function savePayrollEmployerContributionsTotalAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    const values =
      payrollEmployerContributionsTotalSchema.parse({
        payroll_run_id:
          payrollRunId,

        total_employer_contributions:
          form.get(
            "total_employer_contributions",
          ),
      });

    payrollRunId =
      values.payroll_run_id;

    const db =
      await authorizedClient(
        "payroll.update",
      );

    const result = await db.rpc(
      "payroll_set_employer_contributions_total",
      {
        p_payroll_run_id:
          values.payroll_run_id,

        p_total_employer_contributions:
          values.total_employer_contributions,
      },
    );

    checkDatabase(
      result.error,
      "Aggiornamento contributi azienda",
    );

    revalidatePath(
      `/paghe/${payrollRunId}`,
    );
    revalidatePath("/paghe");

    redirect(
      `/paghe/${payrollRunId}?success=${encodeURIComponent(
        "Totale contributi azienda aggiornato e costi dipendenti ricalcolati.",
      )}`,
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(
          parsed.message,
        )}&error_kind=${encodeURIComponent(
          parsed.kind,
        )}`,
      );
    }

    redirect(
      `/paghe/${payrollRunId}?error=${encodeURIComponent(
        parsed.message,
      )}&error_kind=${encodeURIComponent(
        parsed.kind,
      )}`,
    );
  }
}


// ============================================================
// P1.12 — WORKFLOW ELABORAZIONE PAGHE
// ============================================================

const payrollRunWorkflowSchema = z.object({
  payroll_run_id: z.uuid(),
  new_status: z.enum([
    "review",
    "reconciled",
  ]),
});

const payrollRunCloseSchema = z.object({
  payroll_run_id: z.uuid(),
});

const payrollRunReopenSchema = z.object({
  payroll_run_id: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(
      1,
      "La motivazione della riapertura è obbligatoria.",
    )
    .max(10000),
});

function revalidatePayrollRunWorkflow(
  payrollRunId: string,
) {
  revalidatePath(`/paghe/${payrollRunId}`);
  revalidatePath("/paghe");
}

export async function setPayrollRunStatusAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    const values =
      payrollRunWorkflowSchema.parse({
        payroll_run_id:
          payrollRunId,

        new_status:
          form.get("new_status"),
      });

    payrollRunId =
      values.payroll_run_id;

    const db =
      await authorizedClient(
        "payroll.review",
      );

    const result = await db.rpc(
      "payroll_set_run_status",
      {
        p_payroll_run_id:
          values.payroll_run_id,

        p_new_status:
          values.new_status,
      },
    );

    checkDatabase(
      result.error,
      "Aggiornamento stato elaborazione paghe",
    );

    revalidatePayrollRunWorkflow(
      payrollRunId,
    );

    const message =
      values.new_status === "review"
        ? "Elaborazione avviata in revisione."
        : "Elaborazione segnata come riconciliata.";

    payrollRunRedirect(
      payrollRunId,
      "success",
      message,
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(
          parsed.message,
        )}&error_kind=${encodeURIComponent(
          parsed.kind,
        )}`,
      );
    }

    payrollRunRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function closePayrollRunAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    const values =
      payrollRunCloseSchema.parse({
        payroll_run_id:
          payrollRunId,
      });

    payrollRunId =
      values.payroll_run_id;

    const db =
      await authorizedClient(
        "payroll.close",
      );

    const result = await db.rpc(
      "payroll_close_run",
      {
        p_payroll_run_id:
          values.payroll_run_id,
      },
    );

    checkDatabase(
      result.error,
      "Chiusura elaborazione paghe",
    );

    revalidatePayrollRunWorkflow(
      payrollRunId,
    );

    payrollRunRedirect(
      payrollRunId,
      "success",
      "Elaborazione paghe chiusa.",
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(
          parsed.message,
        )}&error_kind=${encodeURIComponent(
          parsed.kind,
        )}`,
      );
    }

    payrollRunRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

export async function reopenPayrollRunAction(
  form: FormData,
) {
  let payrollRunId = String(
    form.get("payroll_run_id") || "",
  );

  try {
    const values =
      payrollRunReopenSchema.parse({
        payroll_run_id:
          payrollRunId,

        reason:
          form.get("reason") || "",
      });

    payrollRunId =
      values.payroll_run_id;

    const db =
      await authorizedClient(
        "payroll.reopen",
      );

    const result = await db.rpc(
      "payroll_reopen_run",
      {
        p_payroll_run_id:
          values.payroll_run_id,

        p_reason:
          values.reason,
      },
    );

    checkDatabase(
      result.error,
      "Riapertura elaborazione paghe",
    );

    revalidatePayrollRunWorkflow(
      payrollRunId,
    );

    payrollRunRedirect(
      payrollRunId,
      "success",
      "Elaborazione paghe riaperta.",
    );
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    const parsed =
      publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(
          parsed.message,
        )}&error_kind=${encodeURIComponent(
          parsed.kind,
        )}`,
      );
    }

    payrollRunRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

