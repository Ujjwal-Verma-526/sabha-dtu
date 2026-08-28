@AGENTS.md

# Sabha — Project Context

Sabha is a DTU-first society/event management web app.

**Stack:** Next.js, TypeScript, Tailwind, Supabase/PostgreSQL, Vercel.
**GitHub repository:** sabha-dtu.
**Supabase project:** sabha-dtu.

## Secrets

- `.env.local` contains secrets and must NEVER be committed or exposed.
- Never request or use the Supabase service-role/secret key unless explicitly required and approved.
- Never commit `.env.local`, API keys, passwords, tokens, or other secrets.

## Database & migrations

- The database/auth/RLS foundation is already implemented and applied to the live Supabase project.
- All current migrations must be treated as already applied; never recreate or modify old migrations. New database changes require new migration files.
- RLS/security is critical. Never weaken existing policies merely to make frontend functionality work.

## Working style

- Before modifying existing functionality, inspect the current implementation.
- Prefer small, incremental changes and test after each major feature.
- Run lint/typecheck/build before declaring a feature complete.
- Commit meaningful completed milestones to Git.
- If the project state is ambiguous, inspect the repository, migrations, git history, and existing code rather than guessing.

## Feature scope

- Current completed features: authentication, user profiles, club directory, public club pages, membership requests/approval, super-admin club management.
- Current next feature: event creation and event discovery.
- Do not implement RSVP, QR tickets, QR scanning, payments, notifications, or social features until explicitly instructed.

## Current Project State

**Completed:**
- Authentication (Supabase Auth)
- User profiles
- Club directory
- Public club pages
- Membership requests/approval
- Super-admin club management

**Next to build:**
- Event creation and event discovery

**Explicitly deferred (do not build until instructed):**
- RSVP
- QR tickets
- QR scanning
- Payments
- Notifications
- Social features
