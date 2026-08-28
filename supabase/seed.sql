-- Development-only seed data. Run via `supabase db reset` (local dev) or
-- pasted manually into a *non-production* project's SQL editor.
--
-- No real DTU society information here — these are clearly fictional
-- placeholders so nothing here could be mistaken for verified data. When
-- real society details are supplied, add them separately.
--
-- No dev users are seeded: auth.users rows can only be created through
-- Supabase Auth itself (sign up, magic link, OAuth) — this file has no
-- access to auth and doesn't attempt to fake it. Create a dev user by
-- signing in through the app once against your local/dev project; the
-- handle_new_auth_user trigger will create their public.users row.
-- Promoting that user to super_admin is a separate manual step — see
-- README.md.

insert into public.clubs (name, slug, description, category, verified)
values
  ('Sample Robotics Club', 'sample-robotics-club', 'Placeholder seed club for local development.', 'Technical', true),
  ('Sample Photography Society', 'sample-photography-society', 'Placeholder seed club for local development.', 'Cultural', true),
  ('Sample Debate Circle', 'sample-debate-circle', 'Placeholder seed club for local development, unverified on purpose.', 'Literary', false)
on conflict (slug) do nothing;
