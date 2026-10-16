# Sabha

Every DTU event, one place. Register in a tap, walk in with a QR.

**Live:** [sabha-dtu.vercel.app](https://sabha-dtu.vercel.app)

## Features

- **Event feed with categories:** every published event in one place, filterable by technical, cultural, social, entrepreneurship or other, with a "Happening now" section.
- **One-tap registration:** the database enforces the closing time and capacity, so the rules hold even under a rush.
- **QR tickets:** every registration gets its own ticket, readable only by the person who registered.
- **Door check-in:** society organisers scan tickets at the door with a phone camera, or enter a code or search by name. A ticket that has already been scanned is caught and shown with the time it was first used, and a mistaken check-in can be undone.
- **Club management:** a directory of societies, membership requests and approval, and event creation with banners, drafts and publishing.
- **Share and link previews:** share or send to WhatsApp, with an auto-generated poster as the link-preview image when an event has no banner.
- **Calendar export:** add any event to Google Calendar or download an `.ics` file.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) with TypeScript and React 19
- [Supabase](https://supabase.com): Postgres with Row Level Security, Auth and Storage
- [Tailwind CSS](https://tailwindcss.com) v4
- Deployed on [Vercel](https://vercel.com)

Access rules live in the database: RLS policies, triggers and `SECURITY DEFINER` functions in `supabase/migrations/`. The app's own checks are there for friendly messages, not as the source of truth.

## Running it locally

Local development runs against a **local Supabase stack in Docker**, never a hosted project.

### Prerequisites

- Node.js 20 or newer, and npm
- Docker (Docker Desktop on Windows and macOS)

### Setup

```bash
git clone https://github.com/Ujjwal-Verma-526/sabha-dtu.git
cd sabha-dtu
npm install

# Start the local stack. This applies every migration in supabase/migrations
# and supabase/seed.sql (a few placeholder clubs) to a throwaway local database.
npx supabase start

# Print the local API URL and anon key.
npx supabase status -o env
```

Create `.env.development.local` in the repo root with the values from `API_URL` and `ANON_KEY`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from supabase status>
```

`.env.example` lists every variable. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is optional and isn't needed locally.

Then start the app:

```bash
npm run dev
```

- On startup the dev server prints `[sabha] Supabase: http://127.0.0.1:54321 (local stack)`. If you see a `!!!!` warning banner instead, it is not pointing at the local stack: stop it and check your env file.
- Use `npm run dev`, not `npx next dev`. It first copies the QR scanner's fallback files into `public/`.
- On Windows, run it from PowerShell. It crashes under Git Bash.
- Open [http://localhost:3000](http://localhost:3000), not `127.0.0.1:3000`, or pages won't hydrate.

`.env.development.local` is read only by `next dev`. Use `npm run dev` for local testing, not `next build` / `next start`.

### Signing in locally

1. On `/login`, use the email magic link. Google sign-in isn't configured on the local stack.
2. The email doesn't really get sent. Open the local inbox at [http://127.0.0.1:54324](http://127.0.0.1:54324).
3. The link lands on `http://127.0.0.1:3000/?code=…`. To finish signing in, open `http://localhost:3000/auth/callback?code=…` (same code) in the same browser.

### Making yourself a super admin

No one can become a super admin through the app or the API. The `users_prevent_privilege_escalation` trigger only lets an existing super admin change a role, so the first one is set directly in the database. Sign in once so your `public.users` row exists, then run:

```bash
docker exec -i supabase_db_sabha psql -U postgres -d postgres <<'SQL'
alter table public.users disable trigger users_prevent_privilege_escalation;
update public.users set role = 'super_admin' where email = 'you@example.com';
alter table public.users enable trigger users_prevent_privilege_escalation;
SQL
```

### Database tests

`supabase/tests/*_roles.sql` are rolled-back tests that act as each role (anonymous, student, organiser, super admin) against the policies and triggers. Every row should say `PASS`:

```bash
docker exec -i supabase_db_sabha psql -U postgres -d postgres < supabase/tests/door_checkin_roles.sql
```

To start over with a fresh local database, run `npx supabase db reset`.

### Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Project structure

```
src/
  app/          Routes: /events, /clubs, /tickets, /profile, /admin (club and event
                management, door scanner), /login, /privacy, /terms
  components/   Layout chrome, shared UI and feature components
  lib/          Domain logic (IST times, registration timing, tickets, sharing,
                form validation) and the Supabase clients and types
  proxy.ts      Refreshes the Supabase session on each request
supabase/
  migrations/   Schema, RLS policies, triggers and functions, applied in order
  tests/        Rolled-back SQL role tests
  seed.sql      Placeholder clubs for local development (no real data, no users)
  config.toml   Local stack configuration
```

## Security

Please report security issues privately to the contact email on the [privacy page](https://sabha-dtu.vercel.app/privacy), not as public GitHub issues.
