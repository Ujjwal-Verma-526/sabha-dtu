import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the auth code from a magic-link or OAuth redirect for a
// session, then sends the user on to their profile. The corresponding
// public.users row already exists by this point — it's created by the
// handle_new_auth_user trigger the moment auth.users gets the new row,
// not by anything in this route.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/profile`);
}
