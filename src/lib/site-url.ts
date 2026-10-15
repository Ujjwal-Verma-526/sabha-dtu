// The origin ("https://sabha.example") this request was made to, for links
// that leave the page: share text, WhatsApp, calendar files and the Open
// Graph tags. It comes from the request, so production, a Vercel preview and
// `next dev` each link to themselves with no per-environment setting.
//
// The host header is client-controlled, so it is only trusted when it looks
// like a host name; anything else falls back to the local dev origin rather
// than ending up in a link.

const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i;
const FALLBACK_ORIGIN = "http://localhost:3000";

type HeaderReader = { get(name: string): string | null };

function firstValue(value: string | null): string {
  return (value ?? "").split(",")[0].trim();
}

export function siteOrigin(requestHeaders: HeaderReader): string {
  const host = firstValue(requestHeaders.get("x-forwarded-host")) || firstValue(requestHeaders.get("host"));
  if (!HOST_PATTERN.test(host)) return FALLBACK_ORIGIN;

  const forwardedProto = firstValue(requestHeaders.get("x-forwarded-proto"));
  const hostname = host.replace(/:\d+$/, "");
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : local
        ? "http"
        : "https";
  return `${protocol}://${host}`;
}
