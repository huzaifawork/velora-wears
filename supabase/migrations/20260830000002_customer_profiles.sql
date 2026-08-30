-- ---------------------------------------------------------------------------
-- Velora Wears — CUSTOMER PROFILES.
--
-- Written 2026-08-30. Signing up created a row in `auth.users` and nothing
-- else, and that left three real gaps:
--
--   1. NOTHING IN `public` RECORDED THE CUSTOMER. `auth.users` is not exposed
--      over PostgREST and never should be — it holds password hashes, recovery
--      tokens and confirmation state. So a customer who created an account
--      existed only inside Supabase Auth, where no query in this project could
--      reach them.
--
--   2. THE ONLY THING WE KEPT ABOUT THEM WAS UNTRUSTWORTHY. The sign-up form
--      puts the customer's name in `raw_user_meta_data.full_name`, and user
--      metadata is WRITABLE BY THE USER — `auth.updateUser({ data: ... })` is
--      an ordinary client call. That is fine for "what shall we greet you as"
--      and worthless as a record of who someone is.
--
--   3. THE ADMIN DASHBOARD COULD NOT SEE CUSTOMERS AT ALL, and `orders.user_id`
--      could not be resolved to a person. An order carries a snapshot of the
--      name and address it was placed with (deliberately — see `order_items`),
--      but there was no way to go the other way and ask "who is this, and what
--      else have they bought?"
--
-- So: one row per account in `public.profiles`, written by a DATABASE TRIGGER
-- rather than by the application. The client is not asked to create it and
-- therefore cannot forget to, cannot fail to, and cannot lie about it.
--
-- WHAT THIS IS NOT. It is not where an order's customer details live. An order
-- keeps its own copy of the name, phone and address it was placed with, because
-- what was true at the moment of sale must stay true afterwards — editing a
-- profile must never rewrite a delivery address on an order already dispatched.
-- Guest checkout (requirements section 7) is untouched: a guest has no account,
-- no profile, and still checks out exactly as before.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. The table
-- ===========================================================================
--
-- `id` IS the auth user's id rather than a key of its own, so there is exactly
-- one profile per account by construction — no join key to get wrong, and no
-- possibility of two. `on delete cascade` means deleting an account takes the
-- profile with it (their ORDERS survive, by `on delete set null` on
-- `orders.user_id` — a deleted account must not erase the shop's sales record).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Mirrored from `auth.users`, kept in step by the triggers below. It is here
  -- so that a customer list can be read and searched in ONE query instead of
  -- being impossible; `auth.users` remains the authority on what it is.
  email text,

  full_name text,
  phone text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Denormalised for the admin's customer search, generated so it can never
  -- disagree with the row it describes. Same pattern as `products.search_text`
  -- and `orders.search_text`.
  search_text text generated always as (
    lower(coalesce(email, '') || ' ' || coalesce(full_name, '') || ' ' || coalesce(phone, ''))
  ) stored
);

comment on table public.profiles is
  'One row per customer account, created automatically at sign-up. NOT the source of an order''s delivery details — an order keeps its own snapshot.';

create index if not exists profiles_created on public.profiles (created_at desc);
create index if not exists profiles_search_trgm
  on public.profiles using gin (search_text gin_trgm_ops);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();


-- ===========================================================================
-- 2. The trigger that fills it — the whole point of this migration
-- ===========================================================================
--
-- The profile is created by the DATABASE, at the instant the account is
-- created, in the same transaction. Not by the sign-up form.
--
-- The alternative — have the client insert its own profile after `signUp()`
-- resolves — fails in every way that matters: the tab can be closed between
-- the two calls, the second request can fail on a flaky connection, and a
-- client that writes its own profile row is a client that can write someone
-- else's. A trigger has none of those failure modes.
--
-- SECURITY DEFINER because the inserting role at that moment is Supabase's
-- auth admin, which has no rights on `public`.
--
-- ---------------------------------------------------------------------------
-- IT MUST NEVER BE ABLE TO BREAK SIGN-UP.
-- ---------------------------------------------------------------------------
-- An exception raised in an `after insert` trigger on `auth.users` aborts the
-- transaction, which means NOBODY CAN CREATE AN ACCOUNT. A missing profile row
-- is a small, repairable problem (the backfill at the bottom of this file fixes
-- it, and can be re-run); a shop that cannot take registrations is not. So the
-- body swallows anything unexpected and logs a warning instead.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    -- The name the customer typed at sign-up. It is user-supplied metadata and
    -- is treated as exactly that: a starting value for a field they own, not a
    -- fact. Blank and whitespace-only both become null.
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;

  return new;
exception
  when others then
    raise warning 'handle_new_user: could not create profile for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Keeping the mirrored email honest.
--
-- Supabase lets an account change its email address. Without this, `profiles.
-- email` would be a snapshot that silently rots — and the admin's customer
-- search reads it, so the search would start failing to find real people.
--
-- Guarded on the value actually changing, so the ordinary auth writes (a
-- sign-in updating `last_sign_in_at`, a token refresh) do no work at all.
-- ---------------------------------------------------------------------------

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
exception
  when others then
    raise warning 'handle_user_email_change: could not update profile %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();


-- ===========================================================================
-- 3. Row level security
-- ===========================================================================

alter table public.profiles enable row level security;

-- A customer sees their own profile and nobody else's. There is deliberately
-- no public read of ANY kind: a profile carries an email address and a phone
-- number, which is precisely the customer personal data requirements section 17
-- says must never be publicly readable.
drop policy if exists "customers read their own profile" on public.profiles;
create policy "customers read their own profile" on public.profiles for select
  using (id = auth.uid());

drop policy if exists "customers update their own profile" on public.profiles;
create policy "customers update their own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "admins read profiles" on public.profiles;
create policy "admins read profiles" on public.profiles for select
  using (public.is_admin());

-- NO INSERT POLICY FOR ANYONE, and no delete. A profile comes into existence
-- with its account and leaves with it — both by trigger and cascade, neither by
-- request. The same shape as `orders`, and for the same reason: a row a client
-- can create is a row a client can forge.

-- ---------------------------------------------------------------------------
-- Column-level grants: WHICH columns a customer may write.
--
-- Row level security answers "which rows"; it cannot answer "which columns".
-- Without this, the update policy above would let a customer set their own
-- `email` — diverging the mirror from `auth.users` and letting them appear in
-- an admin search as somebody else. Postgres has the right tool for this, so
-- use it rather than approximating it with a trigger.
--
-- `id` is excluded too: the primary key of a row you are allowed to update is
-- not a field, it is the identity of the row.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;


-- ===========================================================================
-- 4. customer_summaries — the admin's customer list, in one query
-- ===========================================================================
--
-- A customers screen that cannot say what anyone has bought is an address book.
-- The obvious way to add that is a query per row for their orders, which is the
-- N+1 requirements section 19 rules out — twenty customers would be twenty-one
-- round trips.
--
-- So Postgres does it: a lateral aggregate per profile, answered by the
-- existing `orders_user (user_id, created_at desc)` index from
-- 20260829000006. One statement, one page of rows.
--
-- `security_invoker = on` for the same reason `product_summaries` has it: the
-- view must run with the CALLER's permissions, so the policies above actually
-- apply to it. Without it the view would run as its owner and become a way to
-- read every customer's email without being an admin.

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
  -- What they have actually spent. Cancelled orders are excluded, exactly as
  -- they are from the revenue figures on the dashboard home.
  coalesce(o.total_spent, 0) as total_spent,
  o.last_order_at
from public.profiles p
left join lateral (
  select
    count(*) as order_count,
    sum(ord.total) filter (where ord.status <> 'cancelled') as total_spent,
    max(ord.created_at) as last_order_at
  from public.orders ord
  where ord.user_id = p.id
) o on true;

comment on view public.customer_summaries is
  'Profiles with their order count and spend. Admin-facing; RLS applies (security_invoker).';


-- ===========================================================================
-- 5. Backfill
-- ===========================================================================
--
-- Everyone who signed up BEFORE this migration existed has an account and no
-- profile. This gives them one.
--
-- THIS IS NOT SEEDING. `developerb.md` §4 forbids writing mock or demo data to
-- this database, and nothing invented is written here: every value is copied
-- from a real `auth.users` row that a real person created. Re-running it is
-- safe and is the documented repair if the trigger ever warns.

insert into public.profiles (id, email, full_name, created_at)
select
  u.id,
  u.email,
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  u.created_at
from auth.users u
on conflict (id) do nothing;
