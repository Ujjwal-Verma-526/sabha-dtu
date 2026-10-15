# Sabha

DTU-first society and event management app. Core loop:

Society admin creates an event → it's publicly discoverable → a DTU student
registers → they get a unique QR ticket → the admin scans it at the event →
the registration becomes checked-in.

This repo currently holds the application foundation (layout, primitives,
Supabase wiring) — the core loop itself isn't built yet.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres + Auth)
· deploys to Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
  app/            App Router routes, layout, loading/error/404 states
    login/        Email magic-link + Google OAuth sign-in
    auth/callback/  Exchanges the auth code for a session, redirects to /profile
    profile/      View/edit your own profile (name, roll no, branch, batch, avatar)
  components/
    layout/       Header, nav — structural chrome
    ui/           Reusable primitives (Button, Card, Badge, Spinner)
  lib/
    supabase/     Browser, server, and proxy Supabase clients + DB types
    utils.ts      Small shared helpers
  proxy.ts        Refreshes the Supabase auth session on every request;
                  sends signed-in visitors from / to /events
supabase/
  migrations/     Numbered, reproducible SQL migrations (schema, auth sync,
                  helper functions/guard triggers, RLS policies)
  seed.sql        Dev-only placeholder clubs — no real DTU data, no users
```

## Environment variables

See `.env.example`. Both are the public Supabase project URL and anon key —
safe to expose client-side, required for the browser and server clients in
`src/lib/supabase/`.

## Database

Schema and RLS live in `supabase/migrations/`, applied in filename order.
Run them against a fresh project via the Supabase SQL editor, or
`supabase db push` if you have the CLI linked. See the migration files
themselves for the authorization model — every policy has a comment
explaining who it lets through and why.

### Promoting the first super_admin

There is deliberately no way to become `super_admin` through the app or the
API — not even for the first one. A user's `role` can only be changed by an
existing `super_admin` (enforced by the `users_prevent_privilege_escalation`
trigger), which means the very first super_admin has to be created directly
against the database, once, by whoever holds the Supabase project:

1. Have that person sign in through the app at least once, so their
   `public.users` row exists.
2. In the Supabase SQL editor (or `psql`), run:
   ```sql
   alter table public.users disable trigger users_prevent_privilege_escalation;
   update public.users set role = 'super_admin' where email = 'their-email@example.com';
   alter table public.users enable trigger users_prevent_privilege_escalation;
   ```
   Disabling the trigger only for this one statement, then immediately
   re-enabling it, is intentional — it's the one sanctioned bypass, done by
   a human with direct database access, not something the app ever does on
   its own. From then on, that super_admin can promote others by the same
   route without needing to touch triggers, since `is_super_admin()` will
   let their own UPDATEs through the normal RLS/trigger checks.
