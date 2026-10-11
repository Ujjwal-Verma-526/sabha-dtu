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
- **Live status of the newest migrations is the user's to confirm** (they paste by hand). `20260830000001_door_checkin.sql`: paste `supabase/live/20260830000001_door_checkin.sql`, then run the read-only `supabase/tests/verify_door_checkin_live.sql` (every row `ok = true`); after that, `verify_registration_tickets_live.sql`'s exact-trigger-list row reads false by design. `20260831000001_registration_closes_at_start.sql` **requires door check-in first** (it rewrites `check_in_gate`): run the read-only `supabase/tests/precheck_registration_closes_at_start_live.sql` (summary row `ok = true`), paste `supabase/live/20260831000001_registration_closes_at_start.sql`, then run `supabase/tests/verify_registration_closes_at_start_live.sql`. Ask which are applied before assuming.
- Shipping a migration to live: put `begin;` + the migration body (byte-for-byte) + `commit;` in `supabase/live/<migration>.sql`, start it with a precondition block that fails if the previous migration is missing, if this one is already applied, or if existing rows would break a new constraint (with a message naming them), and add a read-only `supabase/tests/verify_<name>_live.sql`. When a migration adds a constraint, also add a read-only `precheck_<name>_live.sql` listing the rows that would violate it. Dry-run all of them on a clone of the local DB first (see "Local Supabase").
- **The Supabase SQL editor shows only the last statement's result.** Every live pre-check/verify file must be a single SELECT (fold checks into one `with ... union all` query), or earlier results are silently hidden.
- pgcrypto lives in the `extensions` schema on live and locally: call `extensions.gen_random_bytes`, never the unqualified name.
- New database changes require new migration files.
- RLS/security is critical. Never weaken existing policies merely to make frontend functionality work.
- Registration rules that RLS can't express (closing time, capacity) live in a `BEFORE INSERT` trigger (`enforce_registration_rules`). The server action's checks are only for friendly UI states; the DB is the authority.
- **Registration closes at `coalesce(registration_deadline, start_at)`**, refused when `now() >= ` that instant (`20260831000001`). A deadline may be as late as the effective end (CHECK `events_deadline_before_end` = `registration_deadline <= event_effective_end(start_at, end_at)`, replacing `events_deadline_before_start`), so an organiser can keep registration open while the event runs.
- **Effective end, one rule:** `end_at`, or `start_at + 4 h` when `end_at` isn't after `start_at` (`end_at` is NOT NULL and `>= start_at`, so that means `end_at = start_at`). In SQL it lives only in `public.event_effective_end(start_at, end_at)` (immutable, executable by `authenticated` because the CHECK runs as the writer, not by `anon`), used by the deadline CHECK and `check_in_gate`. In TS it lives only in `effectiveEventEnd` / `EVENT_END_FALLBACK_HOURS` in `src/lib/tickets.ts`, used by tickets, check-in display, "Happening now" and the event form. Change both together. An event has ended once `now` is past the effective end (strictly after). Only inserts are guarded: existing registrations, tickets and cancellations are unaffected. `src/lib/event-timing.ts` mirrors the rule for display (`isRegistrationClosed`, `registrationClosesAt`, `isHappeningNow`); change it together with the trigger. Any test that registers students for an event that has already started must register first, then move `start_at`/`end_at` (see `door_checkin_roles.sql`).
- QR ticket tokens live in `registration_tickets`, readable only by the registrant (not club managers, not super-admins). No API role can insert/update/delete them; the `issue_registration_ticket` trigger creates them. Tokens and `ticket_code` are immutable (BEFORE UPDATE triggers). `ticket_code` is a short, non-secret, manager-visible reference; the door check-in accepts only the token.
- **Door check-in** changes only through `check_in_by_token`, `manual_check_in` and `undo_check_in` (SECURITY DEFINER). Every rule lives in one place, `check_in_gate`: manager of the event's club or super_admin, event published, window from 2 h before `start_at` to 1 h after the effective end (from `event_effective_end`, since `20260831000001`). `src/lib/check-in.ts` mirrors the offsets for display only; change both together. No API role can execute the gate.
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
- Rolled-back role tests, run as `postgres`: `docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/<file>.sql`. They are `registration_tickets_roles.sql` (tickets, 38 checks), `door_checkin_roles.sql` (check-in, 72 checks) and `registration_closes_at_start_roles.sql` (closing time, deadline cap, effective end, 59 checks). Every row should say PASS.
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
- Event registration (RSVP): DB trigger enforcing published status, closing time and capacity (row-locked), aggregate-only count RPC, `registerForEvent` server action, `RegisterCTA`
- QR tickets: `registration_tickets`, "My tickets" at `/tickets` (server-rendered SVG QR encoding only the token)
- Admin navigation, friendly form errors, and the local-dev env guard
- All event times parsed and shown in IST via `src/lib/ist.ts`; never format an event time without it

- Door check-in (PR #11, migration `20260830000001`): scan page at `/admin/clubs/[clubId]/events/[eventId]/scan` with these parts:
  - camera scanner: native `BarcodeDetector`, or the self-hosted `barcode-detector` ponyfill
  - code entry, name search with manual check-in and undo
  - live counter
- Links to it from the event pages, and "Checked in at …" on `/tickets`.
- `next` 16.3.8 (PR #12)

**In review (branch `feat/registration-closes-at-start`):**
- Registration closes at `start_at` (or a later deadline up to the effective end): migration `20260831000001` (needs door check-in on live first; adds `event_effective_end`, used by the CHECK and `check_in_gate`), "Registration closed" on the event page and `RegisterCTA`, deadline validated beside the field in the event form, and a "Happening now" section on `/events`.

The deferrals on RSVP/registration, QR tickets and door check-in are all lifted (user's explicit instructions, 2026-10-08 and 2026-10-11).

**Explicitly deferred (do not build until instructed):**
- Payments
- Notifications
- Social features
