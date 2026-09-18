import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Origine non consentita" }, { status: 403 });
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase non configurato" }, { status: 503 });
  const { error } = await supabase.auth.signOut();
  if (error) return NextResponse.json({ error: "Logout non riuscito. Riprova." }, { status: 503 });
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete("simi-demo-session");
  return response;
}
