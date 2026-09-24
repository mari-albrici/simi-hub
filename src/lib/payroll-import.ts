"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorizedClient } from "@/lib/permissions";
import { checkDatabase, publicError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validations";

import { detectPayrollCountry } from "./payroll-import/detect";
import { extractPayrollPdfPages } from "./payroll-import/pdf";
import { matchEmployee } from "./payroll-import/normalize";

import { parseItalianPayrollPage } from "./payroll-import/adapters/italy";
import { parseFrenchPayrollPage } from "./payroll-import/adapters/france";
import { parseLuxembourgPayrollPage } from "./payroll-import/adapters/luxembourg";

import type {
  PayrollImportCountry,
  PayrollImportEmployeeCandidate,
  PayrollImportNormalizedRow,
  PayrollImportPreview,
  PayrollImportRunContext,
} from "./payroll-import/types";
// ============================================================
// TIPI
// ============================================================

export type PayrollImportStatus =
  | "draft"
  | "validated"
  | "invalid"
  | "applied"
  | "cancelled";

export type PayrollImportRecord = {
  id: string;
  payroll_run_id: string;
  status: PayrollImportStatus;
  source_filename: string | null;
  source_format: string | null;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  notes: string | null;
  created_by: string;
  validated_by: string | null;
  applied_by: string | null;
  created_at: string;
  updated_at: string;
  validated_at: string | null;
  applied_at: string | null;
};

export type PayrollImportRowRecord = {
  id: string;
  payroll_import_id: string;
  row_number: number;
  employee_id: string | null;
  employee_code: string | null;
  employee_name: string | null;
  gross_salary: number;
  other_salary_items: number;
  social_security_base: number;
  net_salary: number;
  employer_contributions: number;
  employee_contributions: number;
  tfr_accrual: number;
  tfr_inps: number;
  tfr_recovery: number;
  reimbursements: number;
  sickness: number;
  accident: number;
  holidays: number;
  leave_amount: number;
  income_tax: number;
  tax_adjustments: number;
  tax_refund_730: number;
  supplementary_treatment: number;
  pension_fund_employee: number;
  pension_fund_employer: number;
  loan_deductions: number;
  fifth_assignment_deductions: number;
  other_earnings: number;
  other_deductions: number;
  company_cost: number;
  worked_hours: number;
  allocation_hours: number;
  notes: string | null;
  raw_data: Record<string, unknown>;
  validation_status: string;
  validation_errors: unknown[];
  created_at: string;
  updated_at: string;
};

export type PayrollImportDetail = PayrollImportRecord & {
  rows: PayrollImportRowRecord[];
};

export type PayrollImportValidationResult = {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  is_valid: boolean;
};

export type PayrollPdfImportResult =
  | { success: true; data: PayrollImportPreview }
  | { success: false; error: string };

// ============================================================
// HELPERS
// ============================================================

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isNextRedirect(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT"),
  );
}

function payrollImportRedirect(
  payrollRunId: string,
  kind: "success" | "error",
  message: string,
  errorKind?: string,
): never {
  const params = new URLSearchParams();
  params.set(kind, message);
  if (errorKind) params.set("error_kind", errorKind);
  redirect(`/paghe/${payrollRunId}?${params.toString()}`);
}

function payrollPeriodBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextStart = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, nextStart };
}

function normalizeCountry(value: string): PayrollImportCountry | null {
  const country = value.trim().toUpperCase();
  if (country === "IT" || country === "ITA" || country === "ITALY" || country === "ITALIA") return "ITA";
  if (country === "FR" || country === "FRA" || country === "FRANCE") return "FRA";
  if (country === "LU" || country === "LUX" || country === "LUXEMBOURG") return "LUX";
  return null;
}

function parsePayrollPage(
  country: PayrollImportCountry,
  text: string,
  pageNumber: number,
): PayrollImportNormalizedRow {
  if (country === "ITA") return parseItalianPayrollPage(text, pageNumber);
  if (country === "FRA") return parseFrenchPayrollPage(text, pageNumber);
  return parseLuxembourgPayrollPage(text, pageNumber);
}

function normalizedRowRawData(row: PayrollImportNormalizedRow): Record<string, unknown> {
  return {
    source: "payroll_pdf",
    page_number: row.page_number,
    country: row.country,
    detected_year: row.detected_year,
    detected_month: row.detected_month,
    employee_identifier: row.employee_identifier,
    items: row.items,
    warnings: row.warnings,
    raw_text: row.raw_text,
    field_presence: {
      gross_salary: row.warnings.every((warning: { code: string; }) => warning.code !== "MISSING_GROSS"),
      net_salary: row.warnings.every((warning: { code: string; }) => warning.code !== "MISSING_NET"),
      employer_contributions: row.warnings.every(
        (warning: { code: string; }) => warning.code !== "MISSING_EMPLOYER_CONTRIBUTIONS",
      ),
      company_cost: row.warnings.every((warning: { code: string; }) => warning.code !== "MISSING_COMPANY_COST"),
    },
  };
}

function payrollImportRecord(row: Record<string, unknown>): PayrollImportRecord {
  return {
    id: String(row.id),
    payroll_run_id: String(row.payroll_run_id),
    status: row.status as PayrollImportStatus,
    source_filename: stringOrNull(row.source_filename),
    source_format: stringOrNull(row.source_format),
    total_rows: numberValue(row.total_rows),
    valid_rows: numberValue(row.valid_rows),
    invalid_rows: numberValue(row.invalid_rows),
    notes: stringOrNull(row.notes),
    created_by: String(row.created_by),
    validated_by: stringOrNull(row.validated_by),
    applied_by: stringOrNull(row.applied_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    validated_at: stringOrNull(row.validated_at),
    applied_at: stringOrNull(row.applied_at),
  };
}

function payrollImportRowRecord(row: Record<string, unknown>): PayrollImportRowRecord {
  return {
    id: String(row.id),
    payroll_import_id: String(row.payroll_import_id),
    row_number: numberValue(row.row_number),
    employee_id: stringOrNull(row.employee_id),
    employee_code: stringOrNull(row.employee_code),
    employee_name: stringOrNull(row.employee_name),
    gross_salary: numberValue(row.gross_salary),
    other_salary_items: numberValue(row.other_salary_items),
    social_security_base: numberValue(row.social_security_base),
    net_salary: numberValue(row.net_salary),
    employer_contributions: numberValue(row.employer_contributions),
    employee_contributions: numberValue(row.employee_contributions),
    tfr_accrual: numberValue(row.tfr_accrual),
    tfr_inps: numberValue(row.tfr_inps),
    tfr_recovery: numberValue(row.tfr_recovery),
    reimbursements: numberValue(row.reimbursements),
    sickness: numberValue(row.sickness),
    accident: numberValue(row.accident),
    holidays: numberValue(row.holidays),
    leave_amount: numberValue(row.leave_amount),
    income_tax: numberValue(row.income_tax),
    tax_adjustments: numberValue(row.tax_adjustments),
    tax_refund_730: numberValue(row.tax_refund_730),
    supplementary_treatment: numberValue(row.supplementary_treatment),
    pension_fund_employee: numberValue(row.pension_fund_employee),
    pension_fund_employer: numberValue(row.pension_fund_employer),
    loan_deductions: numberValue(row.loan_deductions),
    fifth_assignment_deductions: numberValue(row.fifth_assignment_deductions),
    other_earnings: numberValue(row.other_earnings),
    other_deductions: numberValue(row.other_deductions),
    company_cost: numberValue(row.company_cost),
    worked_hours: numberValue(row.worked_hours),
    allocation_hours: numberValue(row.allocation_hours),
    notes: stringOrNull(row.notes),
    raw_data: objectValue(row.raw_data),
    validation_status: String(row.validation_status ?? "pending"),
    validation_errors: arrayValue(row.validation_errors),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

// ============================================================
// SELECT
// ============================================================

const payrollImportSelect = `
  id,
  payroll_run_id,
  status,
  source_filename,
  source_format,
  total_rows,
  valid_rows,
  invalid_rows,
  notes,
  created_by,
  validated_by,
  applied_by,
  created_at,
  updated_at,
  validated_at,
  applied_at
`;

const payrollImportRowSelect = `
  id,
  payroll_import_id,
  row_number,
  employee_id,
  employee_code,
  employee_name,
  gross_salary,
  other_salary_items,
  social_security_base,
  net_salary,
  employer_contributions,
  employee_contributions,
  tfr_accrual,
  tfr_inps,
  tfr_recovery,
  reimbursements,
  sickness,
  accident,
  holidays,
  leave_amount,
  income_tax,
  tax_adjustments,
  tax_refund_730,
  supplementary_treatment,
  pension_fund_employee,
  pension_fund_employer,
  loan_deductions,
  fifth_assignment_deductions,
  other_earnings,
  other_deductions,
  company_cost,
  worked_hours,
  allocation_hours,
  notes,
  raw_data,
  validation_status,
  validation_errors,
  created_at,
  updated_at
`;

// ============================================================
// CONTESTO RUN + DIPENDENTI
// ============================================================

async function getPayrollImportContext(
  payrollRunId: string,
): Promise<{
  run: PayrollImportRunContext;
  candidates: PayrollImportEmployeeCandidate[];
}> {
  const runId = uuidSchema.parse(payrollRunId);
  const db = await authorizedClient("payroll.import");

  const runResult = await db
    .from("payroll_runs")
    .select("id,legal_entity_id,year,month,country")
    .eq("id", runId)
    .maybeSingle();

  checkDatabase(runResult.error, "Lettura elaborazione per import paghe");

  if (!runResult.data) {
    throw new Error("Elaborazione paghe non trovata.");
  }

  const run: PayrollImportRunContext = {
    id: String(runResult.data.id),
    legal_entity_id: String(runResult.data.legal_entity_id),
    year: Number(runResult.data.year),
    month: Number(runResult.data.month),
    country: String(runResult.data.country ?? ""),
  };

  const { start, nextStart } = payrollPeriodBounds(run.year, run.month);

  const employeesResult = await db
    .from("employees")
    .select("id,employee_code,first_name,last_name")
    .eq("legal_entity_id", run.legal_entity_id)
    .is("archived_at", null)
    .or(`hire_date.is.null,hire_date.lt.${nextStart}`)
    .or(`termination_date.is.null,termination_date.gte.${start}`)
    .order("last_name")
    .order("first_name");

  checkDatabase(employeesResult.error, "Lettura dipendenti per import paghe");

  const candidates: PayrollImportEmployeeCandidate[] = (employeesResult.data ?? []).map(
    (employee) => ({
      id: String(employee.id),
      employee_code: stringOrNull(employee.employee_code),
      first_name: String(employee.first_name ?? ""),
      last_name: String(employee.last_name ?? ""),
    }),
  );

  return { run, candidates };
}

// ============================================================
// LETTURA IMPORT
// ============================================================

export async function getPayrollImports(
  payrollRunId: string,
): Promise<PayrollImportRecord[]> {
  const runId = uuidSchema.parse(payrollRunId);
  const db = await authorizedClient("payroll.import");

  const result = await db
    .from("payroll_imports")
    .select(payrollImportSelect)
    .eq("payroll_run_id", runId)
    .order("created_at", { ascending: false });

  checkDatabase(result.error, "Lettura import paghe");

  return (result.data ?? []).map((row) =>
    payrollImportRecord(row as Record<string, unknown>),
  );
}

export async function getPayrollImportById(
  payrollImportId: string,
): Promise<PayrollImportDetail | null> {
  const importId = uuidSchema.parse(payrollImportId);
  const db = await authorizedClient("payroll.import");

  const [importResult, rowsResult] = await Promise.all([
    db
      .from("payroll_imports")
      .select(payrollImportSelect)
      .eq("id", importId)
      .maybeSingle(),

    db
      .from("payroll_import_rows")
      .select(payrollImportRowSelect)
      .eq("payroll_import_id", importId)
      .order("row_number", { ascending: true }),
  ]);

  checkDatabase(importResult.error, "Lettura import paghe");
  checkDatabase(rowsResult.error, "Lettura righe import paghe");

  if (!importResult.data) return null;

  return {
    ...payrollImportRecord(importResult.data as Record<string, unknown>),
    rows: (rowsResult.data ?? []).map((row) =>
      payrollImportRowRecord(row as Record<string, unknown>),
    ),
  };
}

// ============================================================
// CREAZIONE SESSIONE IMPORT
// ============================================================

const createImportSchema = z.object({
  payroll_run_id: z.uuid(),
  source_filename: z.string().trim().min(1).max(500),
  source_format: z.enum(["csv", "xlsx", "pdf", "manual"]),
  notes: z.string().trim().max(10000).default(""),
});

export async function createPayrollImport(input: {
  payroll_run_id: string;
  source_filename: string;
  source_format: "csv" | "xlsx" | "pdf" | "manual";
  notes?: string | null;
}): Promise<string> {
  const values = createImportSchema.parse({
    payroll_run_id: input.payroll_run_id,
    source_filename: input.source_filename,
    source_format: input.source_format,
    notes: input.notes ?? "",
  });

  const db = await authorizedClient("payroll.import");

  const result = await db.rpc("payroll_create_import", {
    p_payroll_run_id: values.payroll_run_id,
    p_source_filename: values.source_filename,
    p_source_format: values.source_format,
    p_notes: values.notes || null,
  });

  checkDatabase(result.error, "Creazione import paghe");

  if (!result.data) {
    throw new Error("Creazione import paghe non confermata.");
  }

  return String(result.data);
}

// ============================================================
// STAGING RIGA NORMALIZZATA
// ============================================================

export async function upsertPayrollImportNormalizedRow(
  payrollImportId: string,
  rowNumber: number,
  row: PayrollImportNormalizedRow,
): Promise<string> {
  const importId = uuidSchema.parse(payrollImportId);
  const parsedRowNumber = z.coerce.number().int().min(1).parse(rowNumber);
  const db = await authorizedClient("payroll.import");

  const result = await db.rpc("payroll_upsert_import_row", {
    p_payroll_import_id: importId,
    p_row_number: parsedRowNumber,
    p_employee_id: row.employee_id,
    p_employee_code: row.employee_code,
    p_employee_name: row.employee_name,
    p_gross_salary: row.gross_salary,
    p_other_salary_items: row.other_salary_items,
    p_social_security_base: row.social_security_base,
    p_net_salary: row.net_salary,
    p_employer_contributions: row.employer_contributions,
    p_employee_contributions: row.employee_contributions,
    p_tfr_accrual: row.tfr_accrual,
    p_tfr_inps: row.tfr_inps,
    p_tfr_recovery: row.tfr_recovery,
    p_reimbursements: row.reimbursements,
    p_sickness: row.sickness,
    p_accident: row.accident,
    p_holidays: row.holidays,
    p_leave_amount: row.leave_amount,
    p_income_tax: row.income_tax,
    p_tax_adjustments: row.tax_adjustments,
    p_tax_refund_730: row.tax_refund_730,
    p_supplementary_treatment: row.supplementary_treatment,
    p_pension_fund_employee: row.pension_fund_employee,
    p_pension_fund_employer: row.pension_fund_employer,
    p_loan_deductions: row.loan_deductions,
    p_fifth_assignment_deductions: row.fifth_assignment_deductions,
    p_other_earnings: row.other_earnings,
    p_other_deductions: row.other_deductions,
    p_company_cost: row.company_cost,
    p_worked_hours: row.worked_hours,
    p_allocation_hours: row.allocation_hours,
    p_notes: row.notes,
    p_raw_data: normalizedRowRawData(row),
  });

  checkDatabase(result.error, "Salvataggio riga import paghe");

  if (!result.data) {
    throw new Error("Salvataggio riga import paghe non confermato.");
  }

  return String(result.data);
}

// ============================================================
// P1.11C — PDF -> ADAPTER -> MATCH -> STAGING
// ============================================================

export async function importPayrollPdf(
  payrollRunId: string,
  file: File,
): Promise<PayrollImportPreview> {
  const runId = uuidSchema.parse(payrollRunId);

  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("Seleziona un file PDF valido.");
  }

  const [{ run, candidates }, pages] = await Promise.all([
    getPayrollImportContext(runId),
    extractPayrollPdfPages(file),
  ]);

  const runCountry = normalizeCountry(run.country);
  const rows: PayrollImportNormalizedRow[] = [];
  const detectedCountries = new Set<PayrollImportCountry>();
  let pagesSkipped = 0;

  for (const page of pages) {
    console.log(
      `===== PAYROLL PDF PAGE ${page.page_number} | OCR: ${page.used_ocr} =====`,
    );
    console.log(page.text);
    console.log("===== END PAYROLL PDF PAGE =====");
    const detectedCountry = detectPayrollCountry(page.text);

    if (!detectedCountry) {
      pagesSkipped += 1;
      continue;
    }

    detectedCountries.add(detectedCountry);

    /*
     * Non importiamo silenziosamente una pagina appartenente a un'altra
     * giurisdizione rispetto all'elaborazione. Se il country del run non è
     * riconoscibile, lasciamo invece che sia il documento a determinare
     * l'adapter e la revisione mostrerà il paese rilevato.
     */
    if (runCountry && detectedCountry !== runCountry) {
      pagesSkipped += 1;
      continue;
    }

    const row = parsePayrollPage(
      detectedCountry,
      page.text,
      page.page_number,
    );

    if (page.used_ocr) {
      row.warnings.push({
        code: "OCR_USED",
        message: `Pagina ${page.page_number}: testo ottenuto tramite OCR, verificare i valori estratti.`,
      });
    }

    if (row.detected_year === null || row.detected_month === null) {
      row.warnings.push({
        code: "PERIOD_NOT_DETECTED",
        message: `Pagina ${page.page_number}: periodo del cedolino non rilevato.`,
      });
    } else if (
      row.detected_year !== run.year ||
      row.detected_month !== run.month
    ) {
      /*
       * I PDF LUX possono contenere più mesi dello stesso dipendente:
       * le pagine di un periodo diverso non devono entrare nello staging
       * del run corrente.
       */
      pagesSkipped += 1;
      continue;
    }

    if (!row.employee_name && !row.employee_code && !row.employee_identifier) {
      row.warnings.push({
        code: "EMPLOYEE_NOT_DETECTED",
        message: `Pagina ${page.page_number}: dipendente non rilevato.`,
      });
    }

    const match = matchEmployee(
      row.employee_code,
      row.employee_name,
      candidates,
    );

    row.employee_id = match.employeeId;

    if (match.ambiguous) {
      row.warnings.push({
        code: "EMPLOYEE_MATCH_AMBIGUOUS",
        message: `Pagina ${page.page_number}: più dipendenti compatibili; selezionare manualmente il dipendente.`,
      });
    } else if (!match.employeeId) {
      row.warnings.push({
        code: "EMPLOYEE_NOT_MATCHED",
        message: `Pagina ${page.page_number}: dipendente non associato automaticamente all'anagrafica SIMI.`,
      });
    }

    rows.push(row);
  }

  if (rows.length === 0) {
    const countries = [...detectedCountries];

    if (countries.length === 0) {
      throw new Error(
        "Nessun cedolino ITA, FRA o LUX riconosciuto nel PDF. Verifica il documento o il layout.",
      );
    }

    throw new Error(
      `Nessuna pagina compatibile con l'elaborazione ${String(run.month).padStart(2, "0")}/${run.year}. ` +
      "Controlla il periodo e la società del PDF.",
    );
  }

  const importId = await createPayrollImport({
    payroll_run_id: runId,
    source_filename: file.name,
    source_format: "pdf",
    notes: `Import PDF automatico: ${rows.length} pagine in staging, ${pagesSkipped} escluse.`,
  });

  try {
    for (let index = 0; index < rows.length; index += 1) {
      await upsertPayrollImportNormalizedRow(
        importId,
        index + 1,
        rows[index],
      );
    }
  } catch (error) {
    /*
     * Evitiamo di lasciare una sessione di import parziale utilizzabile.
     * payroll_cancel_import mantiene comunque la traccia/audit della sessione.
     */
    try {
      await cancelPayrollImport(importId);
    } catch (cancelError) {
      console.error("Errore annullamento import paghe parziale:", cancelError);
    }
    throw error;
  }

  revalidatePath(`/paghe/${runId}`);

  return {
    payroll_import_id: importId,
    source_filename: file.name,
    detected_countries: [...detectedCountries],
    pages_total: pages.length,
    pages_imported: rows.length,
    pages_skipped: pagesSkipped,
    rows,
  };
}

export async function importPayrollPdfAction(
  form: FormData,
): Promise<PayrollPdfImportResult> {
  try {
    const payrollRunId = uuidSchema.parse(
      String(form.get("payroll_run_id") || ""),
    );
    const file = form.get("file");

    if (!(file instanceof File)) {
      return {
        success: false,
        error: "Seleziona un file PDF valido.",
      };
    }

    const preview = await importPayrollPdf(payrollRunId, file);

    return {
      success: true,
      data: preview,
    };
  } catch (error) {
    console.error("Errore import PDF paghe:", error);
    return {
      success: false,
      error: publicError(error).message,
    };
  }
}

// ============================================================
// VALIDAZIONE IMPORT
// ============================================================

export async function validatePayrollImport(
  payrollImportId: string,
): Promise<PayrollImportValidationResult> {
  const importId = uuidSchema.parse(payrollImportId);
  const db = await authorizedClient("payroll.import");

  const result = await db.rpc("payroll_validate_import", {
    p_payroll_import_id: importId,
  });

  checkDatabase(result.error, "Validazione import paghe");

  const raw = Array.isArray(result.data) ? result.data[0] : result.data;
  const row = (raw ?? {}) as Record<string, unknown>;

  return {
    total_rows: numberValue(row.total_rows),
    valid_rows: numberValue(row.valid_rows),
    invalid_rows: numberValue(row.invalid_rows),
    is_valid: row.is_valid === true,
  };
}

// ============================================================
// APPLICAZIONE / ANNULLAMENTO / ELIMINAZIONE
// ============================================================

export async function applyPayrollImport(
  payrollImportId: string,
): Promise<number> {
  const importId = uuidSchema.parse(payrollImportId);
  const db = await authorizedClient("payroll.import");

  const result = await db.rpc("payroll_apply_import", {
    p_payroll_import_id: importId,
  });

  checkDatabase(result.error, "Applicazione import paghe");
  return numberValue(result.data);
}

export async function cancelPayrollImport(
  payrollImportId: string,
): Promise<void> {
  const importId = uuidSchema.parse(payrollImportId);
  const db = await authorizedClient("payroll.import");

  const result = await db.rpc("payroll_cancel_import", {
    p_payroll_import_id: importId,
  });

  checkDatabase(result.error, "Annullamento import paghe");
}

export async function deletePayrollImportRow(
  payrollImportRowId: string,
): Promise<void> {
  const rowId = uuidSchema.parse(payrollImportRowId);
  const db = await authorizedClient("payroll.import");

  const result = await db.rpc("payroll_delete_import_row", {
    p_import_row_id: rowId,
  });

  checkDatabase(result.error, "Eliminazione riga import paghe");
}

// ============================================================
// SERVER ACTION — VALIDAZIONE
// ============================================================

export async function validatePayrollImportAction(form: FormData) {
  let payrollRunId = String(form.get("payroll_run_id") || "");

  try {
    payrollRunId = uuidSchema.parse(payrollRunId);
    const payrollImportId = uuidSchema.parse(
      String(form.get("payroll_import_id") || ""),
    );

    const validation = await validatePayrollImport(payrollImportId);

    revalidatePath(`/paghe/${payrollRunId}`);

    if (!validation.is_valid) {
      payrollImportRedirect(
        payrollRunId,
        "error",
        `Import verificato: ${validation.invalid_rows} righe richiedono correzione.`,
      );
    }

    payrollImportRedirect(
      payrollRunId,
      "success",
      `Import verificato: ${validation.valid_rows} righe valide.`,
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(parsed.message)}&error_kind=${encodeURIComponent(parsed.kind)}`,
      );
    }

    payrollImportRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

// ============================================================
// SERVER ACTION — APPLICAZIONE DEFINITIVA
// ============================================================

export async function applyPayrollImportAction(form: FormData) {
  let payrollRunId = String(form.get("payroll_run_id") || "");

  try {
    payrollRunId = uuidSchema.parse(payrollRunId);
    const payrollImportId = uuidSchema.parse(
      String(form.get("payroll_import_id") || ""),
    );

    const appliedRows = await applyPayrollImport(payrollImportId);

    revalidatePath(`/paghe/${payrollRunId}`);
    revalidatePath("/paghe");

    payrollImportRedirect(
      payrollRunId,
      "success",
      `Import applicato: ${appliedRows} dipendenti aggiornati.`,
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(parsed.message)}&error_kind=${encodeURIComponent(parsed.kind)}`,
      );
    }

    payrollImportRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

// ============================================================
// SERVER ACTION — ANNULLAMENTO
// ============================================================

export async function cancelPayrollImportAction(form: FormData) {
  let payrollRunId = String(form.get("payroll_run_id") || "");

  try {
    payrollRunId = uuidSchema.parse(payrollRunId);
    const payrollImportId = uuidSchema.parse(
      String(form.get("payroll_import_id") || ""),
    );

    await cancelPayrollImport(payrollImportId);

    revalidatePath(`/paghe/${payrollRunId}`);

    payrollImportRedirect(
      payrollRunId,
      "success",
      "Import annullato.",
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(parsed.message)}&error_kind=${encodeURIComponent(parsed.kind)}`,
      );
    }

    payrollImportRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}

// ============================================================
// SERVER ACTION — ELIMINAZIONE RIGA
// ============================================================

export async function deletePayrollImportRowAction(form: FormData) {
  let payrollRunId = String(form.get("payroll_run_id") || "");

  try {
    payrollRunId = uuidSchema.parse(payrollRunId);
    const rowId = uuidSchema.parse(
      String(form.get("payroll_import_row_id") || ""),
    );

    await deletePayrollImportRow(rowId);

    revalidatePath(`/paghe/${payrollRunId}`);

    payrollImportRedirect(
      payrollRunId,
      "success",
      "Riga import rimossa.",
    );
  } catch (error) {
    if (isNextRedirect(error)) throw error;

    const parsed = publicError(error);

    if (!payrollRunId) {
      redirect(
        `/paghe?error=${encodeURIComponent(parsed.message)}&error_kind=${encodeURIComponent(parsed.kind)}`,
      );
    }

    payrollImportRedirect(
      payrollRunId,
      "error",
      parsed.message,
      parsed.kind,
    );
  }
}
