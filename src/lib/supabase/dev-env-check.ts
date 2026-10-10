// `.env.local` points at the LIVE Supabase project. `next dev` also loads the
// gitignored `.env.development.local`, which points at the local Docker stack
// and wins over `.env.local`. This check reports which project a dev server
// actually ended up with, so a local run can't read or write live data
// without anyone noticing. See "Local development" in CLAUDE.md.

const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1"];

export type SupabaseUrlCheck =
  | { kind: "local"; url: string }
  | { kind: "not_local"; url: string }
  | { kind: "invalid"; url: string }
  | { kind: "missing" };

export function checkSupabaseUrl(url: string | undefined): SupabaseUrlCheck {
  if (!url) return { kind: "missing" };

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { kind: "invalid", url };
  }

  if (LOCAL_HOSTNAMES.includes(hostname)) return { kind: "local", url };
  return { kind: "not_local", url };
}

const BANNER = "!".repeat(72);

const FIX_STEPS = [
  "Fix: put the local stack's API_URL and ANON_KEY (npx supabase status -o env)",
  "into .env.development.local as NEXT_PUBLIC_SUPABASE_URL and",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY, make sure neither is set in your shell,",
  "then stop the server, delete .next/dev and start it again.",
];

// Returns the console lines for a check result. Anything other than a local
// URL is an error: it's either live data at risk or a server that can't work.
export function describeSupabaseUrlCheck(check: SupabaseUrlCheck): {
  isError: boolean;
  lines: string[];
} {
  if (check.kind === "local") {
    return {
      isError: false,
      lines: [`[sabha] Supabase: ${check.url} (local stack)`],
    };
  }

  let problem: string[];
  if (check.kind === "not_local") {
    problem = [
      "[sabha] THIS DEV SERVER IS USING A NON-LOCAL SUPABASE PROJECT:",
      `[sabha]   ${check.url}`,
      "[sabha] Every read and write goes to that database. It is probably LIVE.",
    ];
  } else if (check.kind === "invalid") {
    problem = [`[sabha] NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${check.url}`];
  } else {
    problem = ["[sabha] NEXT_PUBLIC_SUPABASE_URL is not set."];
  }

  return {
    isError: true,
    lines: [
      BANNER,
      ...problem,
      ...FIX_STEPS.map((line) => `[sabha] ${line}`),
      BANNER,
    ],
  };
}
