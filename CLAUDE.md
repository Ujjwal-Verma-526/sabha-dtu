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
- **Live status of the newest migrations is the user's to confirm** (they paste by hand). `20260830000001_door_checkin.sql`: paste `supabase/live/20260830000001_door_checkin.sql`, then run the read-only `supabase/tests/verify_door_checkin_live.sql` (every row `ok = true`); after that, `verify_registration_tickets_live.sql`'s exact-trigger-list row reads false by design. `20260831000001_registration_closes_at_start.sql` **requires door check-in first** (it rewrites `check_in_gate`): run the read-only `supabase/tests/precheck_registration_closes_at_start_live.sql` (summary row `ok = true`), paste `supabase/live/20260831000001_registration_closes_at_start.sql`, then run `supabase/tests/verify_registration_closes_at_start_live.sql`. `20260901000001_profile_field_checks.sql` is independent of both (it only touches `public.users` and `handle_new_auth_user`): run the read-only `supabase/tests/precheck_profile_field_checks_live.sql` (first row, the summary, `ok = true`), paste `supabase/live/20260901000001_profile_field_checks.sql`, then run `supabase/tests/verify_profile_field_checks_live.sql`. `20260902000001_security_hardening.sql` is independent of all three (it needs only the original helpers, `club_members` and the event-banners bucket): run the read-only `supabase/tests/precheck_security_hardening_live.sql` (summary row `ok = true`; fix any `warning` club without an approved admin before pasting, while a plain insert still works), paste `supabase/live/20260902000001_security_hardening.sql`, then run `supabase/tests/verify_security_hardening_live.sql` (every row `ok = true`, the last is informational). Ask which are applied before assuming.
- Shipping a migration to live: put `begin;` + the migration body (byte-for-byte) + `commit;` in `supabase/live/<migration>.sql`, start it with a precondition block that fails if the previous migration is missing, if this one is already applied, or if existing rows would break a new constraint (with a message naming them), and add a read-only `supabase/tests/verify_<name>_live.sql`. When a migration adds a constraint, also add a read-only `precheck_<name>_live.sql` listing the rows that would violate it. Dry-run all of them on a clone of the local DB first (see "Local Supabase").
- **The Supabase SQL editor shows only the last statement's result.** Every live pre-check/verify file must be a single SELECT (fold checks into one `with ... union all` query), or earlier results are silently hidden.
- pgcrypto lives in the `extensions` schema on live and locally: call `extensions.gen_random_bytes`, never the unqualified name.
- New database changes require new migration files.
- RLS/security is critical. Never weaken existing policies merely to make frontend functionality work.
- Registration rules that RLS can't express (closing time, capacity) live in a `BEFORE INSERT` trigger (`enforce_registration_rules`). The server action's checks are only for friendly UI states; the DB is the authority.
- **Registration closes at `coalesce(registration_deadline, start_at)`**, refused when `now() >= ` that instant (`20260831000001`). A deadline may be as late as the effective end (CHECK `events_deadline_before_end` = `registration_deadline <= event_effective_end(start_at, end_at)`, replacing `events_deadline_before_start`), so an organiser can keep registration open while the event runs.
- **Effective end, one rule:** `end_at`, or `start_at + 4 h` when `end_at` isn't after `start_at` (`end_at` is NOT NULL and `>= start_at`, so that means `end_at = start_at`). In SQL it lives only in `public.event_effective_end(start_at, end_at)` (immutable, executable by `authenticated` because the CHECK runs as the writer, not by `anon`), used by the deadline CHECK and `check_in_gate`. In TS it lives only in `effectiveEventEnd` / `EVENT_END_FALLBACK_HOURS` in `src/lib/tickets.ts`, used by tickets, check-in display, "Happening now" and the event form. Change both together. An event has ended once `now` is past the effective end (strictly after). Only inserts are guarded: existing registrations, tickets and cancellations are unaffected. `src/lib/event-timing.ts` mirrors the rule for display (`isRegistrationClosed`, `registrationClosesAt`, `isHappeningNow`); change it together with the trigger. Any test that registers students for an event that has already started must register first, then move `start_at`/`end_at` (see `door_checkin_roles.sql`).
- **Profile limits live in the database** (`20260901000001`): CHECKs on `public.users` require a non-blank `name` of at most 100 characters, `roll_number` at most 30, `branch` at most 100, and `avatar_url` at most 500 starting with `http://` or `https://` (case-insensitive). They bind every writer, including direct API PATCHes and super_admins. `src/lib/profile-form.ts` (`PROFILE_MAX_LENGTH`, `WEB_URL_PREFIX`) mirrors them for the form; change both together. `handle_new_auth_user` (runs on auth.users INSERT only, so sign-in never touches `public.users`) trims and skips blank name candidates, cuts the name to 100 characters and falls back to `'New user'`, so no sign-up can trip a CHECK. It copies email and name only, never an avatar; if it ever starts copying one, it must store null for anything that would break `users_avatar_url_*`.
- **`is_super_admin(uid)` / `is_club_manager(uid, club)` answer only for the caller** (`20260902000001`): false for any `uid` other than `auth.uid()`, and never null. They stay executable by `anon` because the public read policies call them; this stops anyone probing who is a super admin or manager. Always pass `auth.uid()` (or a value equal to it).
- **Club admin rows** (`20260902000001`, trigger `club_members_guard_admin_changes`, binds every role including the owner): coordinators rank below admins. Only an approved admin of the club or a super admin may insert, update or delete a `club_members` row whose role is or becomes `admin`; anyone may delete their own row; `handle_new_club`'s first admin row for a new club passes. `user_id`/`club_id` never change. A club never loses its last approved admin (delete, demotion, rejection or back to pending), not even by a super admin; cascades from deleting a club or user pass. To change admins from the SQL editor, act as a super admin for the transaction: `select set_config('request.jwt.claims', json_build_object('sub', '<super admin id>')::text, true);`. The raised messages are matched by `friendlyMembershipError` in `src/lib/db-errors.ts`; change both together.
- **Club/event URL and handle CHECKs** (`20260902000001`): `clubs.instagram_handle` null or `^@?[A-Za-z0-9._]{1,30}$`; `clubs.logo_url` and `events.banner_url` null or at most 500 characters starting with `https://` (any case), with one exception for the local stack's `http://127.0.0.1|localhost:54321/storage/v1/object/public/`. Mirrored in `src/lib/club-form.ts` (handle) and `src/lib/storage-url.ts` (image URLs, which the forms also require to be public objects in our own Supabase storage, from `NEXT_PUBLIC_SUPABASE_URL`). Change both together.
- **Club creator deletion** (`20260903000001`): `prevent_club_protected_field_changes` lets `created_by` go from a value to null only when that user no longer exists in `public.users` (the `ON DELETE SET NULL` after a user delete); any API write of `created_by` is still refused for non-super-admins. Live: precheck `supabase/tests/precheck_club_creator_delete_live.sql`, paste `supabase/live/20260903000001_club_creator_delete.sql` (needs `20260902000001` first), verify `supabase/tests/verify_club_creator_delete_live.sql`; role tests `club_creator_delete_roles.sql` (23 checks). The app does not depend on it, so deploy order doesn't matter.
- **Event categories** (`20260904000001`): `events.category` is text NOT NULL DEFAULT `'other'` with CHECK `events_category_valid`: one of `technical`, `cultural`, `social`, `entrepreneurship`, `other` (lowercase keys; binds every writer, including the owner). The default exists only so inserts from an app that predates the column keep working; the event form requires an explicit pick. `src/lib/categories.ts` (`CATEGORY_KEYS`, labels) mirrors the CHECK; change both together. The migration backfilled existing events from the club's category when it matched one of the five (any case), otherwise `other`, with `events_set_updated_at` switched off so `updated_at` kept its value. Club categories stay free text. Live: precheck `supabase/tests/precheck_event_categories_live.sql` (summary row `ok = true`; `falls_back` rows list events that will get `other`), paste `supabase/live/20260904000001_event_categories.sql` (needs `20260903000001` first; stops if already applied or if a hand-added `events.category` exists), verify `supabase/tests/verify_event_categories_live.sql`. **Paste it before deploying the app** that reads `events.category`.
- The event-banners bucket is public (image URLs work for everyone; club logos live there too, under `{club_id}/logo-*.jpg`, uploaded by `LogoUpload`) but only the club's managers and super admins can list it (`event_banners_select_club_manager`). `anon` and `authenticated` have no TRUNCATE on public tables, including future tables created by `postgres`.
- Free text that goes into a PostgREST `.or()` filter goes through `toIlikeSearchTerm` (`src/lib/search.ts`) first.
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
- Rolled-back role tests, run as `postgres`: `docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/<file>.sql`. They are `registration_tickets_roles.sql` (tickets, 38 checks), `door_checkin_roles.sql` (check-in, 72 checks), `registration_closes_at_start_roles.sql` (closing time, deadline cap, effective end, 59 checks) `profile_field_checks_roles.sql` (profile CHECKs, sign-up sanitising, 47 checks) and `security_hardening_roles.sql` (helper probing, club admin rows, URL/handle CHECKs, banner listing, TRUNCATE, 135 checks), `club_creator_delete_roles.sql` (23 checks) and `event_categories_roles.sql` (event category CHECK, default, who can set it, 42 checks). Every row should say PASS.
- `door_checkin_concurrency.sql` races two dblink sessions on one registration. It commits (and then deletes) its own fixtures and must run as `supabase_admin`: `docker exec -i supabase_db_sabha psql -U supabase_admin -d postgres < supabase/tests/door_checkin_concurrency.sql`.
- Dry-running a live paste file: clone the local DB with `pg_dump -U supabase_admin -d postgres | psql -U supabase_admin -d <clone>` into a database created `owner postgres` (so `postgres` owns `public`, like live). Paste-run the file there as `postgres`, run the verify query, run it a second time (expect the "already applied" abort), run the tests, then drop the clone.
- `src/lib/supabase/types.ts` is hand-maintained. Check changes against `npx supabase gen types typescript --local`, but keep the file's existing style (the generator types every RPC result column as non-null).

## UI (Sabha v1)

- Built in four PRs (A: foundation, /events, event page; B: fixed event categories; C: tickets, profile, clubs, admin, scan, login, legal, 404 (landing untouched); D: event form behaviour). Mockups live in the gitignored `design-previews/sabha-v1/`.
- Tokens are CSS variables in `src/app/globals.css`, exposed to Tailwind via `@theme inline`. Light and dark follow `prefers-color-scheme`; there is no toggle. Use the tokens (`paper`, `surface`, `soft`, `ink`, `ink-soft`, `line`, `control`, `primary`, `on-primary`, `success`, `warning`, `danger`, ...), never raw Tailwind palette colours, or dark mode breaks. Text on `primary` is `text-on-primary` (dark text in dark mode).
- One accent: violet `primary` for buttons, links and focus. Saffron is only the wordmark dot, never a button or link.
- Festival colours (category colours, auto-posters, the When/Where/Spots tiles, rani-pink "live") are for event content only. Forms, tickets and the door scanner stay plain. Category colours come from `src/lib/categories.ts` (`categoryKey`, `categoryColor`, `categoryInk`), keyed by the event's own `events.category` (never the club's free-text category). Rani pink means "live" and nothing else.
- Fonts via `next/font/google`: Geist (UI), Bricolage Grotesque with the `wdth` axis (display headings and date numerals, `.font-display-tight`), Geist Mono (ticket references).
- Pages that hide the phone tab bar (`HIDDEN_ON` in `src/components/layout/NavLinks.tsx`: the event page and the door scanner) get the header back arrow (`BackLink`): history back after an in-app navigation, otherwise the page's fallback (`/events`, or the event's manage page for the scanner).
- `.theme-light` (globals.css) pins an element's tokens to the light values in both themes. The ticket card uses it, so it's a white card with a black QR (`src/lib/qr.ts`) in dark mode too.
- Solid status fills use `bg-success`/`bg-warning`/`bg-danger` with `text-on-success`/`text-on-warning`/`text-on-danger` (white in light, near-black in dark). The door scanner's result panels and `Button variant="dangerSolid"` use them; each result also has a written title and its own icon shape, never colour alone.
- Plain pages share `PageHeader`/`sectionHeadingClass` (`src/components/ui/PageHeader.tsx`), `EmptyState`/`NoticePage`, and the form pieces in `src/components/ui/Field.tsx` (`FieldError`, `FormNotice`, label/help classes). Geist Mono is for ticket references and the scanner's token field only.
- There's no tailwind-merge: a className that conflicts with a component's own classes wins or loses by CSS order. Wrap the element or add a variant instead.
- Every text pair must pass WCAG AA in both themes; control borders 3:1.

## Accepted limitations

Known and accepted by the user (2026-10-12). Don't "fix" these without being asked.

- **Open sign-up.** Any email can sign up (no @dtu.ac.in lock), so throwaway accounts can register for events and take capacity seats. The branding stays DTU-first; the copy must not claim sign-up needs a DTU email.
- **Managers can rename their club**, including a verified one. Only `slug`, `created_by` and `verified` are protected (`prevent_club_protected_field_changes`).
- **Five dev-only npm "high" advisories** (`braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`). They only affect linting on developer machines; `npm audit --omit=dev` reports 0. The only fix offered, `npm audit fix --force`, downgrades `eslint-config-next` to 14.2.35, which breaks linting for this Next version. Don't run it.
- **CSP `script-src` allows `'unsafe-inline'`** (Next.js inline RSC scripts). Safe while no user content is rendered as HTML. Revisit with nonces via `proxy.ts` if `dangerouslySetInnerHTML` or rich-text/markdown rendering is ever added.
  The CSP is the same in every environment. The Vercel Toolbar is turned off for previews in the Vercel project settings (2026-10-14) because the CSP blocks its `vercel.live` script; if it's ever turned back on, previews log a CSP console error and DevTools issue on every page.

## Working style

- Before modifying existing functionality, inspect the current implementation.
- Prefer small, incremental changes and test after each major feature.
- Run lint (`npm run lint`), typecheck (`npx tsc --noEmit`) and `npm run build` before declaring a feature complete.
- Never commit directly to `main`: work on a feature branch and open a PR. Commit meaningful completed milestones.
- No `Co-Authored-By: Claude` trailer on commits, and no attribution line (e.g. "Generated with Claude Code") in PR bodies.
- If the project state is ambiguous, inspect the repository, migrations, git history, and existing code rather than guessing.

## Current Project State (as of 2026-10-15)

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
- Registration closes at `start_at` (PR #13; or a later deadline up to the effective end): migration `20260831000001` (needs door check-in on live first; adds `event_effective_end`, used by the CHECK and `check_in_gate`), "Registration closed" on the event page and `RegisterCTA`, deadline validated beside the field in the event form, and a "Happening now" section on `/events`.

- `/profile` save with field errors and a "Saved" confirmation, `npm audit fix`, and migration `20260901000001_profile_field_checks` (PR #14).

- Security hardening (PR #15), migration `20260902000001_security_hardening`: helpers answer only for the caller, club admin rows protected, URL/handle CHECKs with mirrored form checks (club details form now keeps input and shows field errors), no anonymous banner listing, TRUNCATE revoked, `/clubs` search neutralised, landing copy no longer claims sign-up needs a @dtu.ac.in email.
- Security headers and club logo upload (PR #16), `/privacy` and `/terms` (PR #17).

- Sabha v1 PR A (PR #18): tokens, fonts, light/dark, shared components, header with phone tab bar, `/events` and the event page.

- Sabha v1 PR B (PR #19): fixed event categories, migration `20260904000001_event_categories`, required category chips in the event form, posters/dots/filter on `/events` and the event page from the event's own category.

- Sabha v1 PR C (PR #20): visual restyle of tickets (white ticket card with the attendee's own name), `/profile`, `/clubs`, club page, manage pages, door scanner, login, privacy, terms, 404. Header "Admin" renamed "Manage".

**In review (branch `feat/event-form`):**
- Sabha v1 PR D: event form behaviour. One date plus start and end time, with "Ends on a different day" revealing an end date (still saved as `start_at`/`end_at` in IST; the form now requires end strictly after start). "Registration closes: when the event starts / at a custom time" (same deadline rules). Recent-venue chips from the club's own events (newest `start_at` first, distinct, at most 5, under the existing SELECT policy). "Publish" and "Save draft" on create and on drafts; a published event's "Save changes" keeps it published (also on Enter), and "Move to draft" asks first. "Move to draft" is refused once anyone has registered: disabled in the form, and `updateEvent` counts with `get_event_registration_count` before the update and again after (the registration trigger's `FOR UPDATE` on the event row makes the second count catch any race), publishing again if one slipped in. Only the app path is guarded; a direct API PATCH of `status` would need a trigger (migration). The separate Publish button on the manage page (and the `publishEvent` action) is gone. No data, RLS or migration changes.

The deferrals on RSVP/registration, QR tickets and door check-in are all lifted (user's explicit instructions, 2026-10-08 and 2026-10-11).

**Explicitly deferred (do not build until instructed):**
- Payments
- Notifications
- Social features
