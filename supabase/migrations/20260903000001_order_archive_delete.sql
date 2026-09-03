-- ---------------------------------------------------------------------------
-- Velora Wears — AN ADMINISTRATOR CAN NOW CLEAR AN ORDER OFF THE LIST.
--
-- The shop's owner asked for a way to "delete" an order from the dashboard. The
-- orders table is the shop's sales record, so this migration gives them TWO
-- actions rather than one, and makes the destructive one the second step:
--
--   ARCHIVE   Files the order away. It leaves the dashboard's working list and
--             stays in the database — still counted in revenue, still in the
--             customer's own order history, still restorable in one click. This
--             is what "get it off my screen" actually means, and it is the
--             button the dashboard offers first.
--
--   DELETE    Erases the row, its line items and any reviews written from it.
--             Only reachable once an order is archived, and only through
--             `delete_order()` below.
--
--             NOTE, 2026-09-03: that precondition was LIFTED the same day, in
--             `20260903000002_delete_order_any_state.sql`, at the shop owner's
--             request — they wanted a delete button, not a two-step. This file
--             is left describing what it actually did when it ran; read the
--             follow-up for how `delete_order()` behaves now.
--
-- ---------------------------------------------------------------------------
-- WHY `orders` STILL HAS NO DELETE POLICY
-- ---------------------------------------------------------------------------
-- `developerb.md` §4: never change a row-level-security policy on `orders`
-- without treating it as a security change. The cheap way to ship this would be
-- `create policy "admins delete orders" ... for delete using (is_admin())`, and
-- that hands every admin session — including a stolen one — a single
-- `DELETE /orders?id=neq.<anything>` that erases the shop's entire sales
-- history, with nothing written down about it.
--
-- So no delete policy is added. The table stays undeletable over PostgREST for
-- every role, and deletion exists only as one SECURITY DEFINER function that
-- checks who is calling, refuses an order that has not been archived first, and
-- writes an audit row before it removes anything. Same shape as
-- `set_user_role()` in 20260901000001: one sanctioned front door, and the door
-- is where the authorization lives.
--
-- ---------------------------------------------------------------------------
-- WHAT ARCHIVING DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
--   * It does not restore stock. Neither does cancelling (see the note on
--     `ORDER_STATUS_COPY`) — an order that was called off may have pieces that
--     are damaged, lost with a courier, or already coming back, and the shop
--     decides that on the product, not here.
--   * It does not hide the order from the CUSTOMER. Archiving is the shop's own
--     filing, not a state the buyer has any business seeing change; their order
--     history reads the same row it always did.
--   * It does not change any dashboard figure. An archived order is a real
--     sale and stays in revenue, in the 14-day chart and in that customer's
--     lifetime spend. `admin_dashboard_stats()` is untouched by this migration
--     and does not need to be — see the CHECK below for why the sidebar's
--     open-orders badge cannot drift.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. The columns
-- ===========================================================================
--
-- `archived_by` is `on delete set null` for the same reason `orders.user_id`
-- is: an admin account being removed must not take the shop's records with it.

alter table public.orders
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id) on delete set null;

comment on column public.orders.archived_at is
  'When an administrator filed this order away. Null means it is on the dashboard''s working list. Set through archive_order(), cleared by restore_order().';
comment on column public.orders.archived_by is
  'Which administrator archived it. Null once that account is gone — the order outlives them.';

-- ---------------------------------------------------------------------------
-- ONLY A FINISHED ORDER CAN BE ARCHIVED, and the constraint is what makes that
-- true rather than the button.
--
-- This is the load-bearing line of the migration. `admin_dashboard_stats()`
-- counts `open` as pending + confirmed + shipped, and the sidebar badge reads
-- it. If a pending order could be archived, the badge would say "3" over a list
-- showing nothing, and the shop would have work filed away where nobody looks.
-- Because only 'delivered' and 'cancelled' can carry an `archived_at`, an
-- archived order is by definition never an open one, the badge cannot drift,
-- and the stats function needed no change at all.
--
-- It also runs in the other direction: an archived order cannot be dragged back
-- to 'pending' without being restored first, which is the correct order of
-- operations and not a thing the UI has to remember.
--
-- Existing rows all have `archived_at is null`, so this validates immediately.
-- ---------------------------------------------------------------------------
alter table public.orders
  drop constraint if exists orders_archive_requires_settled;

alter table public.orders
  add constraint orders_archive_requires_settled
  check (archived_at is null or status in ('delivered', 'cancelled'));


-- ===========================================================================
-- 2. Indexes (§19 — a filtered column gets an index, on a small table too)
-- ===========================================================================
--
-- Every list read in the dashboard now carries `archived_at is null`, so the
-- existing `orders_created` and `orders_status` indexes no longer match the
-- default query. PARTIAL indexes are the right answer rather than composite
-- ones: the working list only ever wants unarchived rows, so the archived ones
-- do not belong in the index the working list reads.

create index if not exists orders_active_created
  on public.orders (created_at desc) where archived_at is null;

create index if not exists orders_active_status
  on public.orders (status, created_at desc) where archived_at is null;

-- ...and the archive drawer, which is read with the SAME sort control as the
-- working list — newest PLACED first, not newest archived. Indexing
-- `archived_at desc` here would have been an index matching the column's name
-- rather than the query, and would never be used.
create index if not exists orders_archived_created
  on public.orders (created_at desc) where archived_at is not null;


-- ===========================================================================
-- 3. deleted_orders — what a hard delete leaves behind
-- ===========================================================================
--
-- Deleting an order rewrites the shop's revenue history. That is allowed here,
-- but it is not allowed to be SILENT: without a record, "our September total
-- dropped by 28,000 rupees and nobody knows why" is an unanswerable question.
--
-- THIS TABLE HOLDS NO PERSONAL DATA, deliberately. No name, no email, no phone,
-- no address — one honest reason to hard-delete an order is to erase exactly
-- that, and an audit table that quietly kept a copy would defeat the act it is
-- recording. What is kept is the financial fact: a number, a total, when it was
-- placed, when it went and who removed it.

create table if not exists public.deleted_orders (
  -- The order's own id, so a stale link or a receipt can still be traced.
  id uuid primary key,
  order_number text not null,
  status public.order_status not null,
  total integer not null,
  items_deleted integer not null default 0,
  reviews_deleted integer not null default 0,
  placed_at timestamptz not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references auth.users (id) on delete set null
);

comment on table public.deleted_orders is
  'One row per order removed through delete_order(). Financial record only — never any customer PII, because erasing that is a legitimate reason to delete an order.';

create index if not exists deleted_orders_when
  on public.deleted_orders (deleted_at desc);

alter table public.deleted_orders enable row level security;

-- Read-only, admins only. There is no insert, update or delete policy for any
-- client: rows appear here from inside `delete_order()` and nothing edits them.
drop policy if exists "admins read deleted orders" on public.deleted_orders;
create policy "admins read deleted orders" on public.deleted_orders for select
  using (public.is_admin());


-- ===========================================================================
-- 4. archive_order / restore_order
-- ===========================================================================
--
-- These could have ridden the existing `"admins update orders"` policy — the
-- dashboard could simply PATCH `archived_at`. They do not, for two reasons:
-- `archived_by` should say who actually did it rather than whoever the browser
-- claims, and an admin pressing archive on an order that is still being
-- fulfilled deserves the sentence below rather than a raw check-constraint
-- violation.
--
-- Both are idempotent. Two administrators pressing the same button a second
-- apart should not give the second one an error — the same rule `set_user_role`
-- follows for a role that is already set.

create or replace function public.archive_order(target_order uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_archived_at timestamptz;
  existing_status public.order_status;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can archive an order.'
      using errcode = 'insufficient_privilege';
  end if;

  select archived_at, status
    into existing_archived_at, existing_status
    from public.orders
   where id = target_order
     for update;

  if not found then
    raise exception 'That order no longer exists.'
      using errcode = 'no_data_found';
  end if;

  -- Already filed away. Return what it already says rather than moving the
  -- timestamp, so a double click does not rewrite when it happened.
  if existing_archived_at is not null then
    return existing_archived_at;
  end if;

  -- Raised plainly, with no errcode: `describeError` rewrites 42501 into "your
  -- account is not an admin", which is the wrong sentence here — the caller IS
  -- an admin and the reason is the order, not them.
  if existing_status not in ('delivered', 'cancelled') then
    raise exception
      'This order is still open (%). Mark it delivered or cancelled first — archiving work that has not finished would hide it from the orders badge.',
      existing_status;
  end if;

  update public.orders
     set archived_at = now(),
         archived_by = auth.uid()
   where id = target_order
   returning archived_at into existing_archived_at;

  return existing_archived_at;
end;
$$;

comment on function public.archive_order(uuid) is
  'File a finished order away so it leaves the dashboard''s working list. Reversible with restore_order(). Administrators only.';

revoke all on function public.archive_order(uuid) from public, anon;
grant execute on function public.archive_order(uuid) to authenticated;


create or replace function public.restore_order(target_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can restore an order.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.orders where id = target_order) then
    raise exception 'That order no longer exists.'
      using errcode = 'no_data_found';
  end if;

  -- No "is it archived?" check: restoring an order that is already on the list
  -- is a no-op, not a mistake worth an error message.
  update public.orders
     set archived_at = null,
         archived_by = null
   where id = target_order
     and archived_at is not null;
end;
$$;

comment on function public.restore_order(uuid) is
  'Put an archived order back on the dashboard''s working list. Administrators only.';

revoke all on function public.restore_order(uuid) from public, anon;
grant execute on function public.restore_order(uuid) to authenticated;


-- ===========================================================================
-- 5. delete_order — the only way an order row is ever removed
-- ===========================================================================
--
-- Returns what it actually removed, so the dashboard can tell the admin the
-- truth ("2 reviews went with it") instead of a generic "deleted".
--
-- THE REVIEWS GO TOO, and explicitly rather than by falling through the foreign
-- key. `reviews.order_id` is `on delete set null`, so doing nothing here would
-- leave a review that still claims `verified_purchase` against a purchase that
-- no longer exists — and, because `unique (order_id, product_id)` treats nulls
-- as distinct, would silently free that customer's review slot. Neither is a
-- thing to discover later. They are deleted, they are counted, and the count is
-- shown in the confirmation.
--
-- `order_items` needs no statement: `on delete cascade` already means the lines
-- cannot outlive the order.

create or replace function public.delete_order(target_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  doomed public.orders%rowtype;
  items_removed integer;
  reviews_removed integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can delete an order.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into doomed from public.orders where id = target_order for update;

  if not found then
    raise exception 'That order no longer exists.'
      using errcode = 'no_data_found';
  end if;

  -- Archiving first is the whole safety property of this feature: it makes
  -- deletion two deliberate acts on two different screens rather than one
  -- mis-click in a list, and it means nothing that is still being fulfilled can
  -- be erased (the CHECK above will not let an open order be archived at all).
  --
  -- LIFTED by 20260903000002 — see the note at the top of this file.
  if doomed.archived_at is null then
    raise exception
      'Archive this order before deleting it. Archiving already takes it off the orders list and can be undone; deleting cannot.';
  end if;

  select count(*) into items_removed
    from public.order_items where order_id = target_order;

  select count(*) into reviews_removed
    from public.reviews where order_id = target_order;

  delete from public.reviews where order_id = target_order;

  -- The record of the removal is written BEFORE the removal, inside the same
  -- transaction: if the delete fails, the audit row rolls back with it, and
  -- there is no order in the world for which one exists without the other.
  insert into public.deleted_orders (
    id, order_number, status, total, items_deleted, reviews_deleted,
    placed_at, deleted_by
  ) values (
    doomed.id, doomed.order_number, doomed.status, doomed.total,
    items_removed, reviews_removed, doomed.created_at, auth.uid()
  );

  delete from public.orders where id = target_order;

  return jsonb_build_object(
    'orderNumber', doomed.order_number,
    'itemsDeleted', items_removed,
    'reviewsDeleted', reviews_removed
  );
end;
$$;

comment on function public.delete_order(uuid) is
  'Permanently remove an ARCHIVED order, its line items and any reviews written from it, recording the fact in deleted_orders. Administrators only. There is deliberately no delete policy on public.orders — this function is the only way.';

revoke all on function public.delete_order(uuid) from public, anon;
grant execute on function public.delete_order(uuid) to authenticated;
