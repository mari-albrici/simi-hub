import type { PayrollImportNormalizedRow } from "../types";
import { detectMonthYear, findAmountAfterLabel } from "../normalize";

function extractEmployeeName(text: string): string | null {
  const patterns = [
    /(?:SALARI[ÉE]|EMPLOY[ÉE]|NOM)\s*[:\-]?\s*([A-ZÀ-ÖØ-Ý' -]{5,})/i,
    /\b([A-ZÀ-ÖØ-Ý'-]{2,}\s+[A-ZÀ-ÖØ-Ý'-]{2,})\b(?=[\s\S]{0,120}N[°º]?\s*CCSS)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().split(/\n/)[0].trim();
  }
  return null;
}

function extractCcss(text: string): string | null {
  const match = text.match(/N[°º]?\s*CCSS\s*[:\-]?\s*([0-9 .\/-]{6,})/i);
  return match?.[1]?.trim() ?? null;
}

export function parseLuxembourgPayrollPage(text: string, pageNumber: number): PayrollImportNormalizedRow {
  const period = detectMonthYear(text);
  const gross = findAmountAfterLabel(text, [/TOTAL\s+BRUT[^\n]*?([^\n]*)/i]);
  const employeeContrib = findAmountAfterLabel(text, [/TOTAL\s+COTISATIONS[^\n]*?([^\n]*)/i]);
  const net = findAmountAfterLabel(text, [/SALAIRE\s+NET[^\n]*?([^\n]*)/i]);
  const reimbursements = findAmountAfterLabel(text, [/\b(?:FR\s+)?TRASFERTE\b[^\n]*?([^\n]*)/i]);
  const incomeTax = findAmountAfterLabel(text, [/\bIMP[ÔO]T\b[^\n]*?([^\n]*)/i]);
  const workedHours = findAmountAfterLabel(text, [/\bH\s+HEURES\s+NORMALES\b[^\n]*?([^\n]*)/i]);

  const warnings: PayrollImportNormalizedRow["warnings"] = [];
  if (gross === null) warnings.push({ code: "MISSING_GROSS", message: "Total Brut non rilevato." });
  if (net === null) warnings.push({ code: "MISSING_NET", message: "Salaire Net non rilevato." });
  warnings.push({
    code: "MISSING_EMPLOYER_CONTRIBUTIONS",
    message: "Le cotisations employeur non sono ricavate dal cedolino LUX se non esposte esplicitamente.",
  });
  warnings.push({
    code: "MISSING_COMPANY_COST",
    message: "Il costo azienda LUX deve essere verificato/integrato da fonte datore.",
  });

  return {
    page_number: pageNumber,
    country: "LUX",
    detected_year: period.year,
    detected_month: period.month,
    employee_id: null,
    employee_code: null,
    employee_name: extractEmployeeName(text),
    employee_identifier: extractCcss(text),
    gross_salary: gross ?? 0,
    other_salary_items: 0,
    social_security_base: 0,
    net_salary: net ?? 0,
    employer_contributions: 0,
    employee_contributions: employeeContrib ?? 0,
    tfr_accrual: 0,
    tfr_inps: 0,
    tfr_recovery: 0,
    reimbursements: reimbursements ?? 0,
    sickness: 0,
    accident: 0,
    holidays: 0,
    leave_amount: 0,
    income_tax: incomeTax ?? 0,
    tax_adjustments: 0,
    tax_refund_730: 0,
    supplementary_treatment: 0,
    pension_fund_employee: 0,
    pension_fund_employer: 0,
    loan_deductions: 0,
    fifth_assignment_deductions: 0,
    other_earnings: 0,
    other_deductions: 0,
    company_cost: 0,
    worked_hours: workedHours ?? 0,
    allocation_hours: 0,
    notes: null,
    items: [],
    warnings,
    raw_text: text,
  };
}
