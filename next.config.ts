import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import {
  checkSupabaseUrl,
  describeSupabaseUrlCheck,
} from "./src/lib/supabase/dev-env-check";

// Security headers for every route. The policy is static (no per-request
// nonce), so script-src has to allow 'unsafe-inline' for the inline scripts
// Next.js emits; see "Accepted limitations" in CLAUDE.md. Everything else is
// tight: our own origin plus our own Supabase project, and Google Identity
// Services for the sign-in button (src/lib/google-identity.ts).
function supabaseOrigins(): { http: string[]; socket: string[] } {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const socketProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return {
      http: [url.origin],
      socket: [`${socketProtocol}//${url.host}`],
    };
  } catch {
    return { http: [], socket: [] };
  }
}

// Google Identity Services, exactly as Google's CSP guide lists it: the
// script, its stylesheet, and the button iframe and its requests under /gsi/.
const GOOGLE_GSI = "https://accounts.google.com/gsi/";

function contentSecurityPolicy(isDev: boolean): string {
  const supabase = supabaseOrigins();
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'wasm-unsafe-eval': the door scanner's QR fallback compiles a wasm
    // module. 'unsafe-eval' is dev-only (React's debugging in `next dev`).
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      `${GOOGLE_GSI}client`,
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'", `${GOOGLE_GSI}style`],
    // blob: and data: for the client-side image preview and canvas upload.
    "img-src": ["'self'", "data:", "blob:", ...supabase.http],
    "font-src": ["'self'"],
    "media-src": ["'self'", "blob:"],
    "connect-src": [
      "'self'",
      ...supabase.http,
      ...supabase.socket,
      GOOGLE_GSI,
      ...(isDev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
    ],
    "frame-src": ["'self'", GOOGLE_GSI],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

function securityHeaders(isDev: boolean) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // The camera is for the door scan page, on our own origin only.
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(), payment=()",
    },
  ];
}

function buildConfig(isDev: boolean): NextConfig {
  return {
    async headers() {
      return [{ source: "/:path*", headers: securityHeaders(isDev) }];
    },
  };
}

// Runs when `next dev` starts, after Next has loaded the .env files: print
// which Supabase project this dev server talks to, and shout if it isn't the
// local stack. Builds and `next start` skip it.
function warnIfDevServerIsNotLocal() {
  const check = checkSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const { isError, lines } = describeSupabaseUrlCheck(check);
  const message = lines.join("\n");
  if (isError) {
    console.error(message);
  } else {
    console.log(message);
  }
}

export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    warnIfDevServerIsNotLocal();
  }
  return buildConfig(phase === PHASE_DEVELOPMENT_SERVER);
}
