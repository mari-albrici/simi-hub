"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowedCorporateEmail, hasPermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations";
import { AppError, checkDatabase, publicError } from "@/lib/errors";

export async function loginAction(formData: FormData) {
  let destination = "/dashboard";
  try {
    const { email, password } = loginSchema.parse(Object.fromEntries(formData));
    if (!isAllowedCorporateEmail(email)) throw new AppError("authentication", "Credenziali non valide.");
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new AppError("configuration", "Connessione Supabase non configurata.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new AppError("authentication", "Credenziali non valide o servizio di accesso non disponibile.");
    // Database RPC inserts a missing viewer profile only; never updates an existing one.
    const sync = await supabase.rpc("ensure_my_profile");
    checkDatabase(sync.error, "Verifica profilo");
    const { data: authData } = await supabase.auth.getUser();
    const profile = await supabase.from("profiles").select("active, role").eq("id", authData.user!.id).single();
    checkDatabase(profile.error, "Lettura profilo");
    if (!profile.data?.active) {
      const result = await supabase.auth.signOut();
      if (result.error) throw new AppError("authentication", "Accesso non consentito; impossibile terminare la sessione. Riprova il logout.");
      throw new AppError("forbidden", "Profilo non attivo. Contatta l’amministratore.");
    }
    destination = hasPermission(profile.data.role, "dashboard.read") ? "/dashboard" : "/commesse";
    (await cookies()).delete("simi-demo-session");
  } catch (error) {
    const failure = publicError(error);
    redirect(`/login?error=${encodeURIComponent(failure.message)}`);
  }
  redirect(destination);
}
export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new AppError("configuration", "Connessione Supabase non configurata.");
  const { error } = await supabase.auth.signOut();
  if (error) throw new AppError("authentication", "Logout non riuscito. Riprova.");
  (await cookies()).delete("simi-demo-session");
  redirect("/login");
}
