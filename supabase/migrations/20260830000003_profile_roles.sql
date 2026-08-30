-- ---------------------------------------------------------------------------
-- Velora Wears — ROLES ON THE PROFILE.
--
-- Being an administrator used to mean "has a row in `public.admins`". This
-- replaces that with a `role` column on `public.profiles`, defaulting to
-- `'user'`, which is what every account gets at sign-up and what the shop's
-- owner flips to `'admin'` when they want somebody to manage the store.
--
-- WHY THIS IS BETTER THAN THE TABLE IT REPLACES. A person had two records —
-- their profile, and possibly a row in a second table — and nothing tied them
-- together except a uuid. Answering "is this customer an admin?" meant a join,
-- listing administrators meant reading a table that held no names, and the
-- shop's owner had to think in terms of inserting and deleting rows rather than
-- in terms of what somebody is. One column on the record that already describes
-- the person says the same thing in the place you would look for it.
--
-- ---------------------------------------------------------------------------
-- THE DANGEROUS PART, AND HOW IT IS CLOSED
-- ---------------------------------------------------------------------------
-- A role column on a table the user can update is the classic privilege
-- escalation hole: a customer calls PostgREST, sets their own row's role to
-- 'admin', and owns the shop. `profiles` HAS an update policy for the row's
-- owner, so this is a live risk here and not a hypothetical.
--
-- It is closed twice, deliberately:
--
--   1. COLUMN-LEVEL GRANTS. 20260830000002 revoked update on `profiles` and
--      granted it back on `full_name` and `phone` ONLY. That grant is an
--      allowlist, so `role` is not writable through the API by anyone,
--      whatever the row policy says. This is the real protection.
--
--   2. A TRIGGER, because grants are one careless `grant update on
--      public.profiles to authenticated` away from being undone by somebody
--      fixing an unrelated bug — and that mistake would be silent, instant,
--      and total. The trigger refuses any role change made from a session that
--      has an `auth.uid()`, which means roles can only be changed by someone
--      operating on the database directly: the Supabase SQL editor, the table
--      editor, or the service role.
--
-- So an admin session cannot mint another admin, exactly as before. Gaining
-- control of an administrator's browser must not be the same as gaining the
-- ability to create administrators.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. The column
-- ===========================================================================
--
-- An enum rather than free text, like `order_status` and `payment_method`
-- before it: 'admn' is then a database error at the moment somebody types it,
-- rather than an account that silently never gains access and takes an hour to
-- explain.

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
  'What this account may do. Every sign-up is ''user''. Change to ''admin'' from the Supabase SQL or table editor — an API session cannot change it (see guard_profile_role).';

-- The one query `is_admin()` makes, and the admin list on the account screen.
-- Partial, because almost every row is a 'user' and indexing those would make
-- the index bigger without answering anything.
create index if not exists profiles_admins
  on public.profiles (id)
  where role = 'admin';


-- ===========================================================================
-- 2. Carry the existing administrators across
-- ===========================================================================
--
-- Before the `admins` table is dropped, everyone in it becomes an admin on
-- their profile. Guarded on the table existing so this migration is safe on a
-- database built from scratch, where `admins` may already be gone.
--
-- An admin who somehow has no profile row is given one first. That should be
-- impossible — 20260830000002 backfills every `auth.users` row — but losing the
-- shop's only administrator to a missing row is not a risk worth taking to save
-- three lines.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admins'
  ) then
    insert into public.profiles (id, email)
    select a.user_id, a.email
    from public.admins a
    on conflict (id) do nothing;

    update public.profiles p
    set role = 'admin'
    where exists (select 1 from public.admins a where a.user_id = p.id);
  end if;
end
$$;


-- ===========================================================================
-- 3. is_admin() — the same question, asked of the new column
-- ===========================================================================
--
-- EVERY admin policy in this schema calls this function, and none of them
-- changes. That is the whole reason authorization was put behind one function
-- in the first place: moving where the answer is stored is a rewrite of six
-- lines rather than of thirty policies, and there is no possibility of updating
-- some of them and missing others.
--
-- Same name, same signature, same STABLE / SECURITY DEFINER properties, so
-- every existing policy keeps working untouched. SECURITY DEFINER is what lets
-- it read `profiles` while the caller's own row-level security is what decides
-- whether the CALLER may read that table — the function runs as its owner,
-- which owns the table and therefore bypasses RLS.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;


-- ===========================================================================
-- 4. The guard
-- ===========================================================================
--
-- See the note at the top. This is the second lock, not the first — the column
-- grants are what actually stop an API caller today. It exists because the
-- consequence of those grants being loosened by accident is somebody promoting
-- themselves to administrator of a live shop, and a defence that depends on
-- nobody ever running the wrong `grant` is not much of a defence.
--
-- `auth.uid()` is null for the SQL editor, the table editor, a migration, and
-- the service role — the ways the shop's owner actually changes a role — and
-- non-null for every request that arrives with a user's JWT.

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception
      'A profile role cannot be changed from a signed-in session. Change it in the Supabase SQL editor or table editor.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update of role on public.profiles
  for each row execute function public.guard_profile_role();


-- ===========================================================================
-- 5. customer_summaries carries the role
-- ===========================================================================
--
-- So the dashboard's Customers screen can show who manages the shop without a
-- second query. Restated rather than altered: `create or replace view` may
-- APPEND a column but not rename, reorder or retype the existing ones, so
-- everything above the last line is exactly as 20260830000002 left it.

create or replace view public.customer_summaries
with (security_invoker = on)
as
select
  p.id,
  p.email,
  p.full_name,
  p.phone,
  p.created_at,
  p.search_text,
  coalesce(o.order_count, 0) as order_count,
  coalesce(o.total_spent, 0) as total_spent,
  o.last_order_at,
  -- Appended 2026-08-30.
  p.role
from public.profiles p
left join lateral (
  select
    count(*) as order_count,
    sum(ord.total) filter (where ord.status <> 'cancelled') as total_spent,
    max(ord.created_at) as last_order_at
  from public.orders ord
  where ord.user_id = p.id
) o on true;


-- ===========================================================================
-- 6. Retire the admins table
-- ===========================================================================
--
-- Dropped rather than left in place. A table that still looks authoritative but
-- no longer decides anything is worse than no table at all: the next person to
-- grant somebody access will insert a row into it, watch nothing happen, and
-- have no way to tell why. Everything it held moved to `profiles.role` in
-- step 2 above, so nothing is lost.
--
-- `is_admin()` was repointed in step 3, BEFORE this runs — the order matters,
-- and a `cascade` here would have quietly dropped the function instead.

drop table if exists public.admins;
