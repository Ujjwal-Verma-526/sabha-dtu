@AGENTS.md

# Sabha — Project Context

Sabha is a DTU-first society/event management web app.

**Stack:** Next.js (App Router), TypeScript, Tailwind, Supabase/PostgreSQL, Vercel.
**GitHub repository:** sabha-dtu.
**Supabase project:** sabha-dtu.

## Secrets

- `.env.local` contains secrets and must NEVER be committed or exposed.
- Never request or use the Supabase service-role/secret key unless explicitly required and approved.
- Never commit `.env.local`, API keys, passwords, tokens, or other secrets.

## Database & migrations

- **The live project has no CLI migration history.** Migrations are applied by hand in the Supabase SQL editor, and `supabase_migrations.schema_migrations` does not exist on live. Never assume CLI history and never suggest `supabase db push` against live. To ship a migration, hand the user one SQL file to paste plus a verification query; never apply anything to live yourself.
- Applied on live: `20260825000001` through `20260828000001` (the user applied the registration guards migration by hand on 2026-10-08). Treat them as applied; never recreate or modify them.
- `20260829000001_registration_tickets.sql` (QR ticket tokens) is in the `feat/qr-tickets` PR and must be applied to live by the user.
- pgcrypto lives in the `extensions` schema on live and locally: call `extensions.gen_random_bytes`, never the unqualified name.
- New database changes require new migration files.
- RLS/security is critical. Never weaken existing policies merely to make frontend functionality work.
- Registration rules that RLS can't express (deadline, capacity) live in a `BEFORE INSERT` trigger. The server action's checks are only for friendly UI states; the DB is the authority.
- QR ticket tokens live in `registration_tickets`, readable only by the registrant (not club managers, not super-admins). No API role can insert/update/delete them; the `issue_registration_ticket` trigger creates them. Tokens and `ticket_code` are immutable (BEFORE UPDATE triggers). `ticket_code` is a short, non-secret, manager-visible reference; the door check-in must accept only the token, via a SECURITY DEFINER RPC.

## Local development

- `next dev` must talk to the **local** Supabase stack, never live. `.env.local` holds the LIVE project's URL and anon key; leave it as it is.
- `.env.development.local` points `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at the local stack. Next loads it ahead of `.env.local`, but only under `next dev`. It is gitignored (by `.env*`); never commit it. If it's missing, recreate it from `npx supabase status -o env` (`API_URL`, `ANON_KEY`).
- Shell environment variables beat both files. Never set `NEXT_PUBLIC_SUPABASE_*` in the shell you run `next dev` from.
- On startup `next dev` prints `[sabha] Supabase: http://127.0.0.1:54321 (local stack)`. The check runs from `next.config.ts` using `src/lib/supabase/dev-env-check.ts`. If you see a `!!!!` banner instead (URL not `localhost`/`127.0.0.1`, missing, or invalid), stop the server before opening any page.
- After changing any Supabase env value, stop the server and delete `.next/dev` before restarting. Turbopack's dev cache can keep modules compiled with the old `NEXT_PUBLIC_*` values; on 2026-10-10 a "local" server sent some queries to live this way. `docker logs supabase_kong_sabha` shows whether requests reach the local stack.
- `next build` and `next start` don't read `.env.development.local`. They use `.env.local` (live) and print no check. Every route is currently dynamic, so a build makes no Supabase calls, but a local `next start` serves live data. Don't use `next start` for local testing.
- Run `next dev` from PowerShell; it crashes under Git Bash (Turbopack PostCSS worker, `0xc0000142`).

## Local Supabase (testing only)

- `supabase/config.toml` is for a local, **unlinked** stack. Never `supabase link` to the live project.
- `npx supabase start` applies every migration plus `seed.sql` to a throwaway local DB in Docker.
- `supabase/tests/registration_tickets_roles.sql` is a rolled-back role test for the ticket migration; run it with `docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/registration_tickets_roles.sql`.
- `src/lib/supabase/types.ts` is hand-maintained. Check changes against `npx supabase gen types typescript --local`, but keep the file's existing style (the generator types every RPC result column as non-null).

## Working style

- Before modifying existing functionality, inspect the current implementation.
- Prefer small, incremental changes and test after each major feature.
- Run lint (`npm run lint`), typecheck (`npx tsc --noEmit`) and `npm run build` before declaring a feature complete.
- Never commit directly to `main`: work on a feature branch and open a PR. Commit meaningful completed milestones.
- No `Co-Authored-By: Claude` trailer on commits.
- If the project state is ambiguous, inspect the repository, migrations, git history, and existing code rather than guessing.

## Current Project State (as of 2026-10-08)

**Completed (on `main`):**
- Authentication (Supabase Auth) and user profiles
- Club directory, public club pages, membership requests/approval
- Super-admin club management
- Club-admin event create/edit/cancel, with banner upload (Supabase Storage)
- Public event discovery (`/events`) and event detail pages (`/events/[slug]`)
- Event registration (RSVP): DB trigger enforcing published status, deadline and capacity (row-locked), aggregate-only count RPC, `registerForEvent` server action, `RegisterCTA`

**In review (branch `feat/qr-tickets`):**
- QR tickets: `registration_tickets` table + migration, "My tickets" page at `/tickets` (server-rendered SVG QR via `qrcode`, encoding only the token), links from the header, `/profile` and the post-registration CTA.

**The deferral on RSVP/registration and QR tickets is lifted** (user's explicit instruction, 2026-10-08).

**Next to build (only when instructed):**
- Admin door scanner / check-in: a SECURITY DEFINER RPC that takes a token and sets `checked_in_at` for a manager of that event's club. Managers never read tokens directly.

**Explicitly deferred (do not build until instructed):**
- Payments
- Notifications
- Social features
