import { hasPermission, isAllowedCorporateEmail } from "@/lib/auth";
import { DEFAULT_ROLES } from "@/lib/constants";
import { getSessionUser } from "@/lib/session";

export type AccessScope = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canUpload: boolean;
  isAdmin: boolean;
  role: string;
};

export async function getAccessScope(): Promise<AccessScope> {
  const sessionUser = await getSessionUser();
  const role = sessionUser?.role ?? "viewer";

  const canRead = hasPermission(role, "project.read") || hasPermission(role, "document.read") || hasPermission(role, "company.read");
  const canCreate = hasPermission(role, "project.create") || hasPermission(role, "document.upload") || hasPermission(role, "invoice.create");
  const canUpdate = hasPermission(role, "project.update") || hasPermission(role, "document.update") || hasPermission(role, "company.update");
  const canDelete = hasPermission(role, "project.delete") || hasPermission(role, "document.delete") || hasPermission(role, "invoice.delete");
  const canUpload = hasPermission(role, "document.upload");
  const isAdmin = role === "admin" || DEFAULT_ROLES.includes(role as (typeof DEFAULT_ROLES)[number]);

  return {
    canRead,
    canCreate,
    canUpdate,
    canDelete,
    canUpload,
    isAdmin,
    role,
  };
}

export async function canAccessPage(page: string): Promise<boolean> {
  const sessionUser = await getSessionUser();
  if (!sessionUser || !isAllowedCorporateEmail(sessionUser.email)) {
    return false;
  }

  const role = sessionUser.role ?? "viewer";
  const permissionMap: Record<string, string> = {
    "/dashboard": "project.read",
    "/commesse": "project.read",
    "/documenti": "document.read",
    "/fatture": "invoice.read",
    "/clienti": "company.read",
    "/fornitori": "company.read",
    "/scadenze": "project.read",
    "/personale": "employee.read",
    "/impostazioni": "admin.settings",
    "/aziende": "company.read",
    "/report": "project.read",
  };

  const required = permissionMap[page] ?? "project.read";
  return hasPermission(role, required as any) || role === "admin";
}
