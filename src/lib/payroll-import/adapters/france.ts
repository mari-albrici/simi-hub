import type { PayrollImportNormalizedRow } from "../types";
import { detectMonthYear, findAmountAfterLabel } from "../normalize";

function extractEmployeeName(text: string): string | null {
  const patterns = [
    /(?:SALARI[ÉE]|NOM\s+DU\s+SALARI[ÉE]|NOM)\s*[:\-]?\s*([A-ZÀ-ÖØ-Ý' -]{5,})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().split(/\n/)[0].trim();
  }
  return null;
}

function extractIdentifier(text: string): string | null {
  const match = text.match(/(?:N[°º]?\s*(?:DE\s+)?S[ÉE]CURIT[ÉE]\s+SOCIALE|NIR)\s*[:\-]?\s*([0-9 A-Z.-]{8,})/i);
  return match?.[1]?.trim() ?? null;
}

export function parseFrenchPayrollPage(text: string, pageNumber: number): PayrollImportNormalizedRow {
  const period = detectMonthYear(text);
  const gross = findAmountAfterLabel(text, [
    /SALAIRE\s+BRUT[^\n]*?([^\n]*)/i,
    /TOTAL\s+BRUT[^\n]*?([^\n]*)/i,
  ]);
  const net = findAmountAfterLabel(text, [
    /NET\s+[ÀA]\s+PAYER(?:\s+AVANT\s+IMP[ÔO]T)?[^\n]*?([^\n]*)/i,
    /NET\s+PAY[ÉE][^\n]*?([^\n]*)/i,
  ]);
  const socialBase = findAmountAfterLabel(text, [
    /ASSIETTE\s+DE\s+COTISATIONS[^\n]*?([^\n]*)/i,
    /BASE\s+S[ÉE]CURIT[ÉE]\s+SOCIALE[^\n]*?([^\n]*)/i,
  ]);
  const incomeTax = findAmountAfterLabel(text, [
    /IMP[ÔO]T\s+SUR\s+LE\s+REVENU\s+PR[ÉE]LEV[ÉE]\s+[ÀA]\s+LA\s+SOURCE[^\n]*?([^\n]*)/i,
    /PR[ÉE]L[ÈE]VEMENT\s+[ÀA]\s+LA\s+SOURCE[^\n]*?([^\n]*)/i,
  ]);
  const employeeContrib = findAmountAfterLabel(text, [
    /TOTAL\s+(?:DES\s+)?COTISATIONS\s+SALARIALES[^\n]*?([^\n]*)/i,
  ]);
  const employerContrib = findAmountAfterLabel(text, [
    /TOTAL\s+(?:DES\s+)?COTISATIONS\s+PATRONALES[^\n]*?([^\n]*)/i,
  ]);

  const warnings: PayrollImportNormalizedRow["warnings"] = [];
  if (gross === null) warnings.push({ code: "MISSING_GROSS", message: "Salaire brut non rilevato." });
  if (net === null) warnings.push({ code: "MISSING_NET", message: "Net à payer non rilevato." });
  if (employerContrib === null) {
    warnings.push({
      code: "MISSING_EMPLOYER_CONTRIBUTIONS",
      message: "Cotisations patronales non rilevate: verificare il bulletin de paie.",
    });
  }
  warnings.push({
    code: "MISSING_COMPANY_COST",
    message: "Il costo azienda non viene dedotto se non è esposto esplicitamente nel bulletin.",
  });

  return {
    page_number: pageNumber,
    country: "FRA",
    detected_year: period.year,
    detected_month: period.month,
    employee_id: null,
    employee_code: null,
    employee_name: extractEmployeeName(text),
    employee_identifier: extractIdentifier(text),
    gross_salary: gross ?? 0,
    other_salary_items: 0,
    social_security_base: socialBase ?? 0,
    net_salary: net ?? 0,
    employer_contributions: employerContrib ?? 0,
    employee_contributions: employeeContrib ?? 0,
    tfr_accrual: 0,
    tfr_inps: 0,
    tfr_recovery: 0,
    reimbursements: 0,
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
    worked_hours: 0,
    allocation_hours: 0,
    notes: null,
    items: [],
    warnings,
    raw_text: text,
  };
}
