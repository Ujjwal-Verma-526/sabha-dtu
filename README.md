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
  components/
    layout/       Header, nav — structural chrome
    ui/           Reusable primitives (Button, Card, Badge, Spinner)
  lib/
    supabase/     Browser, server, and middleware Supabase clients
    utils.ts      Small shared helpers
middleware.ts     Refreshes the Supabase auth session on every request
```

## Environment variables

See `.env.example`. Both are the public Supabase project URL and anon key —
safe to expose client-side, required for the browser and server clients in
`src/lib/supabase/`.
