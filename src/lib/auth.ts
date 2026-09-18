import { ALLOWED_EMAIL_DOMAINS, PERMISSION_MATRIX } from "@/lib/constants";
export function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
export function isAllowedCorporateEmail(email: string) {
  return ALLOWED_EMAIL_DOMAINS.some(domain => normalizeEmail(email).endsWith(`@${domain}`));
}
export function hasPermission(role: string, permission: string) {
  // Admin is the platform role. New capabilities automatically belong to it;
  // authorization is still enforced by the server actions and database RLS.
  if (role === "admin") return true;
  if (role === "hr" && ["employee.create","employee.archive","employee.hr.read"].includes(permission)) return true;
  return (PERMISSION_MATRIX[role] ?? []).includes(permission);
}
export function getRoleLabel(role: string) {
  return ({ admin: "Amministratore", administration: "Amministrazione", management: "Direzione", project_manager: "Responsabile progetto", technical: "Tecnico", viewer: "Sola lettura", hr: "HR" } as Record<string, string>)[role] ?? role;
}
