export type PayrollImportCountry = "ITA" | "FRA" | "LUX";

export type PayrollImportWarningCode =
  | "COUNTRY_NOT_DETECTED"
  | "PERIOD_NOT_DETECTED"
  | "PERIOD_MISMATCH"
  | "EMPLOYEE_NOT_DETECTED"
  | "EMPLOYEE_NOT_MATCHED"
  | "EMPLOYEE_MATCH_AMBIGUOUS"
  | "MISSING_GROSS"
  | "MISSING_NET"
  | "MISSING_EMPLOYER_CONTRIBUTIONS"
  | "MISSING_COMPANY_COST"
  | "OCR_USED"
  | "UNSUPPORTED_PAGE";

export type PayrollImportWarning = {
  code: PayrollImportWarningCode;
  message: string;
};

export type PayrollImportItem = {
  code: string | null;
  description: string;
  quantity: number | null;
  base: number | null;
  earnings: number | null;
  deductions: number | null;
  amount: number | null;
  raw: string;
};

export type PayrollImportNormalizedRow = {
  page_number: number;
  country: PayrollImportCountry;
  detected_year: number | null;
  detected_month: number | null;

  employee_id: string | null;
  employee_code: string | null;
  employee_name: string | null;
  employee_identifier: string | null;

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
  items: PayrollImportItem[];
  warnings: PayrollImportWarning[];
  raw_text: string;
};

export type PayrollImportPage = {
  page_number: number;
  text: string;
  used_ocr: boolean;
};

export type PayrollImportEmployeeCandidate = {
  id: string;
  employee_code: string | null;
  first_name: string;
  last_name: string;
};

export type PayrollImportRunContext = {
  id: string;
  legal_entity_id: string;
  year: number;
  month: number;
  country: string;
};

export type PayrollImportPreview = {
  payroll_import_id: string;
  source_filename: string;
  detected_countries: PayrollImportCountry[];
  pages_total: number;
  pages_imported: number;
  pages_skipped: number;
  rows: PayrollImportNormalizedRow[];
};
