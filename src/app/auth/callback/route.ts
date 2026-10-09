import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { POST_LOGIN_COOKIE, safeNextPath } from "@/lib/auth-redirect";

// Exchanges the auth code from a magic-link or OAuth redirect for a
// session, then sends the user on to where they were headed (the login form
// stores that in a cookie), or to their profile. The corresponding
// public.users row already exists by this point — it's created by the
// handle_new_auth_user trigger the moment auth.users gets the new row,
// not by anything in this route.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Auth callback: code exchange failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const cookieStore = await cookies();
  const next = safeNextPath(
    decodeCookieValue(cookieStore.get(POST_LOGIN_COOKIE)?.value),
  );
  cookieStore.delete(POST_LOGIN_COOKIE);

  return NextResponse.redirect(`${origin}${next ?? "/profile"}`);
}

function decodeCookieValue(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
