-- ---------------------------------------------------------------------------
-- Velora Wears — AN ADMINISTRATOR CAN NOW PROMOTE AND DEMOTE.
--
-- 20260830000003 put roles on `profiles.role` and then closed the door on
-- changing them from either application: the column is outside the update
-- grant, and `guard_profile_role` raises on any role change made from a session
-- that has an `auth.uid()`. Roles were changed in the Supabase SQL editor.
--
-- The shop's owner has now asked for that door to be opened for one specific
-- caller: an administrator, acting on somebody ELSE, through one function. This
-- migration adds that function and teaches the guard to recognise it.
--
-- ---------------------------------------------------------------------------
-- WHAT IS AND IS NOT LOOSENED
-- ---------------------------------------------------------------------------
-- The column grant does NOT change. `role` is still absent from the `grant
-- update (full_name, phone)` allowlist, so no client — customer or admin — can
-- write it through PostgREST's table endpoints. A direct
-- `PATCH /profiles?id=eq.<someone>` carrying `{"role":"admin"}` is refused
-- exactly as it was yesterday.
--
-- What changes is that there is now ONE sanctioned path, `set_user_role()`,
-- which runs SECURITY DEFINER (so it is not bound by that grant) and refuses
-- everything the owner would not have wanted:
--
--   * a caller who is not signed in, or is not an administrator;
--   * a caller acting on THEIR OWN row, in either direction. Self-promotion is
--     the escalation the guard exists to stop, and self-demotion is an admin
--     locking themselves out of the screen they are standing on. Another
--     administrator does it for them;
--   * demoting the LAST administrator, which would leave the shop with nobody
--     who can reach the dashboard and no way back except the SQL editor;
--   * a target that does not exist.
--
-- So a stolen admin session can promote an account the attacker controls. That
-- is the unavoidable cost of the feature the owner asked for, and it is the
-- same authority every other admin write on this project already carries. What
-- it still cannot do is promote ITSELF out of an ordinary customer session,
-- which is the escalation that mattered.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. The guard learns about the sanctioned path
-- ===========================================================================
--
-- `set_user_role()` sets a transaction-local setting immediately before its
-- update, and the guard treats that setting as the difference between a role
-- change that came through the front door and one that did not. Everything else
-- it refused yesterday it still refuses.
--
-- WHY THIS IS NOT A HOLE. Three things would all have to be true for that
-- setting to help an attacker, and none of them is:
--
--   1. They would have to be able to CALL `set_config`. PostgREST exposes
--      functions in the exposed schema only; `set_config` lives in
--      `pg_catalog` and is not reachable over the API.
--   2. The setting is transaction-local (`is_local => true`). PostgREST runs
--      each request in its own transaction, so it cannot be set by one request
--      and spent by the next.
--   3. Even with the setting somehow on, the UPDATE itself still has to be
--      permitted — and `role` is not in the column grant, so a table write is
--      refused before the trigger is ever reached.
--
-- The setting is therefore a handshake between two pieces of server-side code
-- inside one transaction, not a permission any client can hold.

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and coalesce(current_setting('velora.role_change', true), '') <> 'on'
  then
    raise exception
      'A profile role can only be changed by an administrator through set_user_role().'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function public.guard_profile_role() is
  'Refuses a role change made from a signed-in session unless it arrives through set_user_role(), which sets velora.role_change for the length of its own transaction.';


-- ===========================================================================
-- 2. set_user_role — the one way an admin changes somebody's role
-- ===========================================================================
--
-- Returns the role the account ends up with, so the dashboard renders the new
-- state from the database's answer rather than from what it hoped happened.
--
-- SECURITY DEFINER, so the update runs as the function's owner and is bound by
-- neither the column grant nor row level security. That is precisely why every
-- check below lives inside it: this function IS the authorization.
--
-- The row is locked with `for update` before it is read, so two administrators
-- demoting the last two admins in the same instant cannot both pass the
-- last-administrator check and leave the shop with none.

create or replace function public.set_user_role(
  target_user uuid,
  new_role public.user_role
)
returns public.user_role
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  existing public.user_role;
  admin_count integer;
begin
  if caller is null then
    raise exception 'You must be signed in to change a role.'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.is_admin() then
    raise exception 'Only an administrator can change a role.'
      using errcode = 'insufficient_privilege';
  end if;

  -- No errcode on this one, nor on the last-administrator refusal below, and
  -- that is deliberate rather than an omission. `insufficient_privilege`
  -- (42501) is what the dashboard's `describeError` rewrites into "your account
  -- is not permitted…, an administrator has to set your profiles.role" — the
  -- right sentence for the two checks above it and precisely the wrong one
  -- here, where the caller IS an administrator and the reason is something
  -- else. Raised plainly, the message below reaches them verbatim.
  if target_user = caller then
    raise exception 'You cannot change your own role. Ask another administrator to do it.';
  end if;

  select role into existing from public.profiles where id = target_user for update;

  if not found then
    raise exception 'That account no longer exists.'
      using errcode = 'no_data_found';
  end if;

  -- Already there. Nothing to write and nothing to fail on: two administrators
  -- pressing the same button should not give the second one an error.
  if existing = new_role then
    return existing;
  end if;

  if existing = 'admin' and new_role <> 'admin' then
    select count(*) into admin_count from public.profiles where role = 'admin';
    if admin_count <= 1 then
      raise exception
        'This is the last administrator, so removing them would leave nobody able to manage the shop. Promote somebody else first.';
    end if;
  end if;

  perform set_config('velora.role_change', 'on', true);
  update public.profiles set role = new_role where id = target_user;
  perform set_config('velora.role_change', '', true);

  return new_role;
end;
$$;

comment on function public.set_user_role(uuid, public.user_role) is
  'Promote or demote another account. Callable only by an administrator, never on their own row, and never on the last remaining administrator.';

-- `authenticated` only. `anon` calling this would fail the signed-in check
-- anyway, but a function that hands out authority should not be reachable by a
-- caller who has none.
revoke all on function public.set_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;
