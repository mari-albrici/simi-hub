import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { PermissionName } from "@/types";

export async function requirePermission(permission: PermissionName) {
  const user = await getSessionUser();
  if (!user) throw new AppError("authentication", "Sessione assente o utente non attivo. Accedi nuovamente.");
  if (!hasPermission(user.role, permission)) throw new AppError("forbidden", "Accesso negato per questa operazione.");
  return user;
}
export async function authorizedClient(permission: PermissionName) {
  await requirePermission(permission);
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new AppError("configuration", "Connessione Supabase non configurata.");
  return supabase;
}
export async function requirePagePermission(permission: PermissionName) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, permission)) redirect("/accesso-negato");
  return user;
}
export const PAGE_PERMISSIONS: Record<string, PermissionName> = {
  "/dashboard": "dashboard.read", "/commesse": "project.read", "/documenti": "document.read", "/fatture": "invoice.read", "/offerte": "offer.read", "/contratti": "contract.read",
  "/clienti": "company.read", "/fornitori": "company.read", "/scadenze": "deadline.read", "/personale": "employee.read",
  "/impostazioni": "admin.settings", "/aziende": "legal_entity.read", "/report": "report.read", "/pagamenti": "invoice.read", "/ordini": "order.read", "/ddt": "delivery_note.read",
};
export async function canAccessPage(page: string) {
  const user = await getSessionUser();
  return Boolean(user && PAGE_PERMISSIONS[page] && hasPermission(user.role, PAGE_PERMISSIONS[page]));
}
export async function getAccessScope(domain: "project" | "document" | "invoice" | "company" = "project") {
  const user = await getSessionUser();
  const check = (permission: PermissionName) => Boolean(user && hasPermission(user.role, permission));
  return { canRead: check(`${domain}.read`), canCreate: domain === "document" ? check("document.upload") : check(`${domain}.create`),
    canUpdate: check(`${domain}.update`), canDelete: check(`${domain}.delete`), canUpload: check("document.upload"), isAdmin: user?.role === "admin", role: user?.role ?? null };
}
