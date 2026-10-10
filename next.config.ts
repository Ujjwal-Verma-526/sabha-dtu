import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import {
  checkSupabaseUrl,
  describeSupabaseUrlCheck,
} from "./src/lib/supabase/dev-env-check";

const nextConfig: NextConfig = {
  /* config options here */
};

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
  return nextConfig;
}
