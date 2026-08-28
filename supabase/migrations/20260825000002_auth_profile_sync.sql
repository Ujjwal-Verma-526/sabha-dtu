-- Creates a public.users row automatically whenever a new auth.users row
-- appears (email signup, OAuth, magic link — all go through auth.users).
-- Runs as the function owner (postgres), so it bypasses RLS by design —
-- this is the ONE sanctioned path for row creation in public.users.
-- No client-side insert policy exists on public.users; profile rows are
-- only ever created here.

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
