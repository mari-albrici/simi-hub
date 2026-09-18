import { cache } from "react";
import { isAllowedCorporateEmail } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AppError, checkDatabase } from "@/lib/errors";
import { DEFAULT_ROLES } from "@/lib/constants";
import type { RoleName } from "@/types";

export type SessionUser = { id: string; email: string; name: string; role: RoleName };
export function formatDisplayName(localPart: string) {
  return localPart.split(/[.\-_]+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new AppError("configuration", "Connessione Supabase non configurata.");
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403) return null;
    throw new AppError("authentication", "Impossibile verificare la sessione. Riprova.");
  }
  const user = data.user;
  if (!user?.email || !isAllowedCorporateEmail(user.email)) return null;
  const result = await supabase.from("profiles").select("role, active, first_name, last_name").eq("id", user.id).maybeSingle();
  checkDatabase(result.error, "Lettura profilo");
  if (!result.data?.active || !DEFAULT_ROLES.includes(result.data.role)) return null;
  return { id: user.id, email: user.email, name: [result.data.first_name, result.data.last_name].filter(Boolean).join(" ") || formatDisplayName(user.email.split("@")[0]), role: result.data.role as RoleName };
});
export async function isAuthenticated() { return Boolean(await getSessionUser()); }
