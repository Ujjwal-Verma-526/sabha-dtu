/**
 * Helpers for "send the visitor back where they were headed after sign-in".
 *
 * The destination travels as `/login?next=<path>`, is stashed in a short-lived
 * cookie by the login form, and is read back by /auth/callback. A cookie is
 * used instead of a query string on the magic-link redirect URL so we don't
 * depend on how Supabase's redirect allow-list matches query strings.
 */

export const POST_LOGIN_COOKIE = "sabha_next";
export const POST_LOGIN_COOKIE_MAX_AGE_SECONDS = 60 * 60;

const PARSE_BASE = "http://sabha.invalid";

/**
 * Returns `raw` only if it is a safe same-site path (e.g. "/tickets"),
 * otherwise null. Rejects absolute URLs, protocol-relative "//host" paths,
 * backslashes (some browsers treat "/\host" as "//host"), control characters,
 * and the auth routes themselves (would loop).
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw, PARSE_BASE);
  } catch {
    return null;
  }
  if (parsed.origin !== PARSE_BASE) return null;
  if (parsed.pathname === "/login" || parsed.pathname.startsWith("/auth/")) {
    return null;
  }
  return raw;
}

/** Login URL that returns the visitor to `next` after sign-in. */
export function loginPathFor(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}
