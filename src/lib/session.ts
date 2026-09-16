import { cookies } from "next/headers";
import { isAllowedCorporateEmail } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const DEMO_SESSION_COOKIE = "simi-demo-session";

export type DemoSessionUser = {
  email: string;
  name: string;
  role: string;
};

export async function getSessionUser(): Promise<DemoSessionUser | null> {
  const cookieStore = await cookies();
  const demoValue = cookieStore.get(DEMO_SESSION_COOKIE)?.value;

  if (demoValue) {
    try {
      const parsed = JSON.parse(demoValue) as DemoSessionUser;
      if (parsed.email && isAllowedCorporateEmail(parsed.email)) return parsed;
    } catch {
      return null;
    }
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data: userData, error } = await supabase.auth.getUser();
  const email = userData.user?.email;

  if (error || !email || !isAllowedCorporateEmail(email)) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name")
    .eq("id", userData.user.id)
    .maybeSingle();

  return {
    email,
    name:
      profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile?.first_name ?? userData.user.user_metadata?.full_name ?? email.split("@")[0],
    role: profile?.role ?? "viewer",
  };
}

export async function isAuthenticated(): Promise<boolean> {
  return Boolean((await getSessionUser())?.email);
}
