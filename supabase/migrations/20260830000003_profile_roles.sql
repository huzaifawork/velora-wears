-- ---------------------------------------------------------------------------
-- Velora Wears — admin access moves from a separate `admins` table onto
-- `profiles.role`.
--
-- Written 2026-08-30. `20260829000001_init.sql` made "who can manage the
-- shop" a row in its own `public.admins` table, reachable only by a direct
-- database write — nobody could see or grant it from inside either
-- application. In practice granting access for testing was done by hand
-- against the live project (a `user_role` enum, `profiles.role`, and
-- `is_admin()` re-pointed at it) without ever landing in a migration, which
-- is exactly the drift `developerb.md` §4 warns about: a schema change that
-- exists in the database and nowhere in git.
--
-- THIS MIGRATION IS THAT CHANGE, WRITTEN DOWN, AND MADE IDEMPOTENT so it is
-- a no-op against a project (like the live one) where it already happened by
-- hand, and a real change against a fresh database that only has 0001-0002
-- applied.
--
-- Why `profiles.role` instead of the `admins` table:
--
--   1. `profiles` already exists, one row per account, and is already the
--      thing an operator looks at in the Supabase Table Editor to find a
--      customer. Flipping `role` there to promote someone to admin is a
--      single visible edit on a row that is already in front of you; adding
--      a row to a second, unrelated table is not.
--   2. It removes a join. `is_admin()` runs on every RLS-protected read and
--      write in the schema — one table lookup by primary key is what it was
--      before this file and what it still is after.
--
-- What does NOT change: `is_admin()` is still `SECURITY DEFINER` and
-- `STABLE`, still takes no arguments, and every existing policy calls it by
-- name — none of them need to change, because none of them know or care how
-- "admin" is decided.
--
-- Granting access is still not something either application can do to
-- itself: `role` is deliberately left out of the column-level `UPDATE` grant
-- `20260830000002_customer_profiles.sql` gave `authenticated` (`full_name`,
-- `phone` only), so a customer account cannot promote itself by calling
-- `supabase.from('profiles').update({ role: 'admin' })` — that RLS policy
-- exists, but the column grant refuses the write before RLS is ever
-- evaluated. Promotion stays a direct database edit, exactly as `admins`
-- required — it is just a column now, not a table.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. The role itself
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('user', 'admin');
  end if;
end
$$;

alter table public.profiles
  add column if not exists role public.user_role not null default 'user';

comment on column public.profiles.role is
  'Set only by a direct database edit (Table Editor or SQL) — never writable through either application. ''admin'' is what is_admin() checks.';

-- Column-level grants are restated here, not just left to 0002, so this file
-- is correct on its own if ever replayed against a database that somehow has
-- the column but not the earlier grant. `role` is intentionally absent from
-- the UPDATE grant: see the note above.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;


-- ===========================================================================
-- 2. is_admin(), re-pointed
-- ===========================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;


-- ===========================================================================
-- 3. Retire `admins`, carrying its rows forward first
-- ===========================================================================
--
-- On a database where 0001 ran and nothing else has touched this since: copy
-- every existing admin over to `profiles.role` before the table holding that
-- fact disappears. On the live project this block finds no `admins` table at
-- all (already dropped by hand) and does nothing — that is the point of
-- checking `to_regclass` first.

do $$
begin
  if to_regclass('public.admins') is not null then
    update public.profiles p
    set role = 'admin'
    from public.admins a
    where a.user_id = p.id
      and p.role <> 'admin';

    drop policy if exists "admins read admins" on public.admins;
    drop table public.admins;
  end if;
end
$$;
