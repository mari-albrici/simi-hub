import { ALLOWED_EMAIL_DOMAINS, PERMISSION_MATRIX } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PermissionName, RoleName } from "@/types";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedCorporateEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain.toLowerCase()}`));
}

export async function syncSupabaseUserProfile(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user || !user.email) return;

  const payload = {
    id: user.id,
    email: user.email,
    first_name: user.user_metadata?.first_name ?? null,
    last_name: user.user_metadata?.last_name ?? null,
    role: "viewer",
    active: true,
    updated_at: new Date().toISOString(),
  };

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });

  if (error) {
    console.warn("Unable to sync Supabase profile:", error.message);
    return;
  }

  if (existingProfile?.role) {
    await supabase
      .from("profiles")
      .update({
        email: user.email,
        first_name: payload.first_name,
        last_name: payload.last_name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
  }
}

export function hasPermission(role: RoleName | string, permission: PermissionName): boolean {
  const permissions = PERMISSION_MATRIX[role] ?? [];
  return permissions.includes(permission);
}

export function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Amministratore",
    administration: "Amministrazione",
    management: "Direzione",
    project_manager: "Responsabile progetto",
    technical: "Tecnico",
    viewer: "Visione",
  };

  return map[role] ?? role;
}
