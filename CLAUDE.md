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

- Migrations `20260825000001` through `20260827000001` are applied to the live Supabase project. Treat them as applied; never recreate or modify them.
- `20260828000001_event_registration_guards.sql` (registration deadline/capacity trigger + `get_event_registration_count` RPC) is in PR #1. Live status is unconfirmed: the Supabase host failed DNS on 2026-10-07, so the project may be paused. Check the dashboard before assuming it is applied.
- New database changes require new migration files. Never run `supabase db push` or apply SQL to the live project without the user's explicit go-ahead.
- RLS/security is critical. Never weaken existing policies merely to make frontend functionality work.
- Registration rules that RLS can't express (deadline, capacity) live in a `BEFORE INSERT` trigger. The server action's checks are only for friendly UI states; the DB is the authority.

## Working style

- Before modifying existing functionality, inspect the current implementation.
- Prefer small, incremental changes and test after each major feature.
- Run lint (`npm run lint`), typecheck (`npx tsc --noEmit`) and `npm run build` before declaring a feature complete.
- Never commit directly to `main`: work on a feature branch and open a PR. Commit meaningful completed milestones.
- No `Co-Authored-By: Claude` trailer on commits.
- If the project state is ambiguous, inspect the repository, migrations, git history, and existing code rather than guessing.

## Current Project State (as of 2026-10-07)

**Completed (on `main`):**
- Authentication (Supabase Auth) and user profiles
- Club directory, public club pages, membership requests/approval
- Super-admin club management
- Club-admin event create/edit/cancel, with banner upload (Supabase Storage)
- Public event discovery (`/events`) and event detail pages (`/events/[slug]`)

**In review (PR #1, branch `feat/registration-guards`):**
- Event registration: DB trigger enforcing published status, deadline and capacity (row-locked), aggregate-only count RPC, `registerForEvent` server action, `RegisterCTA`. Lint, typecheck and build pass.

**Next to build (only when instructed):**
- QR ticket display ("my tickets"; each registration already has a unique `ticket_code`)
- Admin door scanner that sets `checked_in_at` (only club managers/super-admins may update registrations)

**Explicitly deferred (do not build until instructed):**
- Payments
- Notifications
- Social features
