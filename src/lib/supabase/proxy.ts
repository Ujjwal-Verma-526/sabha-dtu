import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request, so server-side
 * reads see a valid (non-expired) session and the refreshed cookies reach
 * the browser. Called from src/proxy.ts. This is the @supabase/ssr Next.js
 * pattern; it is not access control. Every protected page and server action
 * still checks the user itself.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  let noCacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // No-cache headers, so a CDN never serves one user's fresh
          // session cookies to someone else.
          noCacheHeaders = headers;
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Nothing between createServerClient and getClaims(): this call is what
  // refreshes an expired session (and writes the new cookies via setAll).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  // Signed-in visitors skip the landing page and go straight to the feed.
  // A redirect is a new response, so it carries over the refreshed
  // cookies and headers.
  if (signedIn && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/events";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    Object.entries(noCacheHeaders).forEach(([key, value]) => redirect.headers.set(key, value));
    return redirect;
  }

  return supabaseResponse;
}
