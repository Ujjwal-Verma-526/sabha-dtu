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
- Applied on live: `20260825000001` through `20260829000001` (registration guards and QR tickets were applied by hand on 2026-10-08). Treat them as applied; never recreate or modify them.
- **Not yet on live:** `20260830000001_door_checkin.sql`. The user pastes `supabase/live/20260830000001_door_checkin.sql`, then runs the read-only `supabase/tests/verify_door_checkin_live.sql` (every row `ok = true`). After that, `verify_registration_tickets_live.sql`'s exact-trigger-list row reads false by design; use the door check-in verify query instead.
- Shipping a migration to live: put `begin;` + the migration body (byte-for-byte) + `commit;` in `supabase/live/<migration>.sql`, start it with a precondition block that fails if the previous migration is missing or this one is already applied, and add a read-only `supabase/tests/verify_<name>_live.sql`. Dry-run both on a clone of the local DB first (see "Local Supabase").
- pgcrypto lives in the `extensions` schema on live and locally: call `extensions.gen_random_bytes`, never the unqualified name.
- New database changes require new migration files.
- RLS/security is critical. Never weaken existing policies merely to make frontend functionality work.
- Registration rules that RLS can't express (deadline, capacity) live in a `BEFORE INSERT` trigger. The server action's checks are only for friendly UI states; the DB is the authority.
- QR ticket tokens live in `registration_tickets`, readable only by the registrant (not club managers, not super-admins). No API role can insert/update/delete them; the `issue_registration_ticket` trigger creates them. Tokens and `ticket_code` are immutable (BEFORE UPDATE triggers). `ticket_code` is a short, non-secret, manager-visible reference; the door check-in accepts only the token.
- **Door check-in** changes only through `check_in_by_token`, `manual_check_in` and `undo_check_in` (SECURITY DEFINER). Every rule lives in one place, `check_in_gate`: manager of the event's club or super_admin, event published, window from 2 h before `start_at` to 1 h after the effective end (`end_at`, or `start_at + 4 h`, matching `EVENT_END_FALLBACK_HOURS`). `src/lib/check-in.ts` mirrors the offsets for display only; change both together. No API role can execute the gate.
- The `event_registrations_guard_check_in` trigger refuses any change to `checked_in_at`/`checked_in_by`/`check_in_method` outside those RPCs, for every role including the owner. It also refuses registering as already checked in, and moving a registration to another event or person. The RPCs pass it by setting the transaction-local flag `sabha.check_in_rpc` while running as the function owner. The `users ON DELETE SET NULL` action on `checked_in_by` is exempt.
- `event_registrations_guard_checked_in_delete` stops a student from cancelling their own registration once checked in. Managers and super_admins still can, and cascades (deleting a user, event or club) always pass.
- `get_event_check_in_list` gives that event's managers names and check-in state only (no token, email or user id). Event check-in counts come from head-only queries under the existing SELECT policy.

## Local development

- `next dev` must talk to the **local** Supabase stack, never live. `.env.local` holds the LIVE project's URL and anon key; leave it as it is.
- `.env.development.local` points `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at the local stack. Next loads it ahead of `.env.local`, but only under `next dev`. It is gitignored (by `.env*`); never commit it. If it's missing, recreate it from `npx supabase status -o env` (`API_URL`, `ANON_KEY`).
- Shell environment variables beat both files. Never set `NEXT_PUBLIC_SUPABASE_*` in the shell you run `next dev` from.
- On startup `next dev` prints `[sabha] Supabase: http://127.0.0.1:54321 (local stack)`. The check runs from `next.config.ts` using `src/lib/supabase/dev-env-check.ts`. If you see a `!!!!` banner instead (URL not `localhost`/`127.0.0.1`, missing, or invalid), stop the server before opening any page.
- After changing any Supabase env value, stop the server and delete `.next/dev` before restarting. Turbopack's dev cache can keep modules compiled with the old `NEXT_PUBLIC_*` values; on 2026-10-10 a "local" server sent some queries to live this way. `docker logs supabase_kong_sabha` shows whether requests reach the local stack.
- `next build` and `next start` don't read `.env.development.local`. They use `.env.local` (live) and print no check. Every route is currently dynamic, so a build makes no Supabase calls, but a local `next start` serves live data. Don't use `next start` for local testing.
- Run `next dev` from PowerShell; it crashes under Git Bash (Turbopack PostCSS worker, `0xc0000142`).
- Start it with `npm run dev`, not `npx next dev`. `predev` (and `prebuild`) run `scripts/copy-zxing-wasm.mjs`, which copies the door scanner's QR fallback wasm into `public/vendor/zxing/<version>/` (gitignored). Without it, browsers lacking native QR support (iOS Safari, desktop Chrome on Windows) can't start the camera scanner.

## Local Supabase (testing only)

- `supabase/config.toml` is for a local, **unlinked** stack. Never `supabase link` to the live project.
- `npx supabase start` applies every migration plus `seed.sql` to a throwaway local DB in Docker.
- Rolled-back role tests, run as `postgres`: `docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/<file>.sql`. They are `registration_tickets_roles.sql` (tickets) and `door_checkin_roles.sql` (check-in, 72 checks). Every row should say PASS.
- `door_checkin_concurrency.sql` races two dblink sessions on one registration. It commits (and then deletes) its own fixtures and must run as `supabase_admin`: `docker exec -i supabase_db_sabha psql -U supabase_admin -d postgres < supabase/tests/door_checkin_concurrency.sql`.
- Dry-running a live paste file: clone the local DB with `pg_dump -U supabase_admin -d postgres | psql -U supabase_admin -d <clone>` into a database created `owner postgres` (so `postgres` owns `public`, like live). Paste-run the file there as `postgres`, run the verify query, run it a second time (expect the "already applied" abort), run the tests, then drop the clone.
- `src/lib/supabase/types.ts` is hand-maintained. Check changes against `npx supabase gen types typescript --local`, but keep the file's existing style (the generator types every RPC result column as non-null).

## Working style

- Before modifying existing functionality, inspect the current implementation.
- Prefer small, incremental changes and test after each major feature.
- Run lint (`npm run lint`), typecheck (`npx tsc --noEmit`) and `npm run build` before declaring a feature complete.
- Never commit directly to `main`: work on a feature branch and open a PR. Commit meaningful completed milestones.
- No `Co-Authored-By: Claude` trailer on commits.
- If the project state is ambiguous, inspect the repository, migrations, git history, and existing code rather than guessing.

## Current Project State (as of 2026-10-11)

**Completed (on `main`):**
- Authentication (Supabase Auth) and user profiles
- Club directory, public club pages, membership requests/approval
- Super-admin club management
- Club-admin event create/edit/cancel, with banner upload (Supabase Storage)
- Public event discovery (`/events`) and event detail pages (`/events/[slug]`)
- Event registration (RSVP): DB trigger enforcing published status, deadline and capacity (row-locked), aggregate-only count RPC, `registerForEvent` server action, `RegisterCTA`
- QR tickets: `registration_tickets`, "My tickets" at `/tickets` (server-rendered SVG QR encoding only the token)
- Admin navigation, friendly form errors, and the local-dev env guard
- All event times parsed and shown in IST via `src/lib/ist.ts`; never format an event time without it

**In review (branch `feat/door-checkin`):**
- Door check-in: migration `20260830000001` (not yet on live), scan page at `/admin/clubs/[clubId]/events/[eventId]/scan` with these parts:
  - camera scanner: native `BarcodeDetector`, or the self-hosted `barcode-detector` ponyfill
  - code entry, name search with manual check-in and undo
  - live counter
- Links to it from the event pages, and "Checked in at …" on `/tickets`.

The deferrals on RSVP/registration, QR tickets and door check-in are all lifted (user's explicit instructions, 2026-10-08 and 2026-10-11).

**Explicitly deferred (do not build until instructed):**
- Payments
- Notifications
- Social features
