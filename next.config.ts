import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import {
  checkSupabaseUrl,
  describeSupabaseUrlCheck,
} from "./src/lib/supabase/dev-env-check";

// Security headers for every route. The policy is static (no per-request
// nonce), so script-src has to allow 'unsafe-inline' for the inline scripts
// Next.js emits; see "Accepted limitations" in CLAUDE.md. Everything else is
// tight: our own origin plus our own Supabase project, nothing else.
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

// Vercel preview deployments inject the Vercel Toolbar (comments, feedback)
// for signed-in team members, loaded from vercel.live. Without these the
// CSP blocks its script and every preview page logs a console error. Only
// previews get them: VERCEL_ENV is "preview" there, "production" on the
// live site, and unset locally.
const vercelToolbar =
  process.env.VERCEL_ENV === "preview"
    ? {
        script: ["https://vercel.live"],
        style: ["https://vercel.live"],
        img: ["https://vercel.live", "https://vercel.com"],
        font: ["https://vercel.live", "https://assets.vercel.com"],
        connect: ["https://vercel.live", "wss://ws-us3.pusher.com"],
        frame: ["https://vercel.live"],
      }
    : { script: [], style: [], img: [], font: [], connect: [], frame: [] };

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
      ...(isDev ? ["'unsafe-eval'"] : []),
      ...vercelToolbar.script,
    ],
    "style-src": ["'self'", "'unsafe-inline'", ...vercelToolbar.style],
    // blob: and data: for the client-side image preview and canvas upload.
    "img-src": ["'self'", "data:", "blob:", ...supabase.http, ...vercelToolbar.img],
    "font-src": ["'self'", ...vercelToolbar.font],
    "media-src": ["'self'", "blob:"],
    "connect-src": [
      "'self'",
      ...supabase.http,
      ...supabase.socket,
      ...(isDev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
      ...vercelToolbar.connect,
    ],
    ...(vercelToolbar.frame.length ? { "frame-src": vercelToolbar.frame } : {}),
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
