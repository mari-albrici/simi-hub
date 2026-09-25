import { ALLOWED_EMAIL_DOMAINS, PERMISSION_MATRIX } from "@/lib/constants";
export function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
export function isAllowedCorporateEmail(email: string) {
  return ALLOWED_EMAIL_DOMAINS.some(domain => normalizeEmail(email).endsWith(`@${domain}`));
}

export function hasPermission(role: string, permission: string) {
  // Admin ha accesso a tutte le capability della piattaforma.
  if (role === "admin") return true;

  // Management allocations: same role grants as migration 026.
  if (permission === "management.read" && ["administration", "management"].includes(role)) return true;
  if (permission === "management.update" && role === "administration") return true;

  // Permessi HR già esistenti.
  if (
    role === "hr" &&
    [
      "employee.create",
      "employee.archive",
      "employee.hr.read",
    ].includes(permission)
  ) {
    return true;
  }

  // Payroll: riepiloghi aggregati.
  //
  // Management può vedere i riepiloghi economici,
  // ma NON gli importi individuali dei dipendenti.
  if (
    permission === "payroll.summary.read" &&
    ["administration", "management", "hr"].includes(role)
  ) {
    return true;
  }

  // Payroll: dati individuali e gestione operativa.
  if (
    [
      "payroll.employee.read",
      "payroll.read",
      "payroll.create",
      "payroll.update",
      "payroll.import",
      "payroll.review",
      "payroll.close",
      "payroll.reopen",
      "payroll.tfr.read",
      "payroll.tfr.manage",
      "payroll.loans.read",
      "payroll.loans.manage",
      "payroll.accounting.read",
      "payroll.accounting.export",
    ].includes(permission) &&
    ["administration", "hr"].includes(role)
  ) {
    return true;
  }

  if (
    ["task.read", "anomaly.read"].includes(permission) &&
    Object.hasOwn(PERMISSION_MATRIX, role)
  ) {
    return true;
  }

  if (
    [
      "task.create",
      "task.update",
      "task.archive",
      "anomaly.update",
    ].includes(permission) &&
    ["administration", "project_manager", "technical", "hr"].includes(role)
  ) {
    return true;
  }

  if (
    [
      "task.assign",
      "anomaly.assign",
      "anomaly.ignore",
    ].includes(permission) &&
    ["administration", "project_manager", "hr"].includes(role)
  ) {
    return true;
  }

  return (PERMISSION_MATRIX[role] ?? []).includes(permission);
}

export function getRoleLabel(role: string) {
  return ({ admin: "Amministratore", administration: "Amministrazione", management: "Direzione", project_manager: "Responsabile progetto", technical: "Tecnico", viewer: "Sola lettura", hr: "HR" } as Record<string, string>)[role] ?? role;
}
