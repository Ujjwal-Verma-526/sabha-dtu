import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components. Reads and writes the
 * auth session via browser cookies, kept in sync with the server by
 * middleware.ts.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
