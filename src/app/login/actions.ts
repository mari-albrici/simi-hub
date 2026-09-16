"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowedCorporateEmail, normalizeEmail, syncSupabaseUserProfile } from "@/lib/auth";
import { DEMO_SESSION_COOKIE } from "@/lib/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function loginAction(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!isAllowedCorporateEmail(email) || password.length < 8) {
    throw new Error("Credenziali non valide");
  }

  const supabase = await createServerSupabaseClient();

  if (supabase) {
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw new Error("Credenziali non valide");
    }

    if (signInData.user?.email) {
      await syncSupabaseUserProfile();
      redirect("/dashboard");
    }
  }

  const cookieStore = await cookies();
  cookieStore.set(
    DEMO_SESSION_COOKIE,
    JSON.stringify({
      email,
      name: email.split("@")[0],
      role: "admin",
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  );

  redirect("/dashboard");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  cookieStore.delete(DEMO_SESSION_COOKIE);
  redirect("/login");
}
