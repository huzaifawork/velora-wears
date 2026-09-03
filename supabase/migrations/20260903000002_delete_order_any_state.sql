-- ---------------------------------------------------------------------------
-- Velora Wears — DELETE NO LONGER MEANS "ARCHIVE, THEN DELETE".
--
-- `20260903000001` shipped `delete_order()` with a precondition: the order had
-- to be archived first. The reasoning was that erasing a sale should take two
-- deliberate acts on two screens.
--
-- The shop's owner asked for a delete button, and a delete button is what this
-- gives them. The precondition is removed. An administrator can delete any
-- order, in any state, from the orders list or from the order itself, and the
-- database no longer has an opinion about the order of operations.
--
-- ---------------------------------------------------------------------------
-- WHAT IS AND IS NOT LOOSENED
-- ---------------------------------------------------------------------------
-- Only the archive check goes. Everything else that made deletion safe to offer
-- at all is untouched, and is worth restating because this is the migration
-- someone will read when they want to know what a delete can do here:
--
--   * `orders` STILL HAS NO DELETE POLICY, for any role. That is the property
--     that matters. A policy would make `DELETE /orders?id=neq.<anything>` a
--     valid request from any admin session, including a stolen one; this
--     function takes one uuid and can only ever unmake ONE sale.
--   * It is still `is_admin()`-gated inside the function, so authority comes
--     from `profiles.role` and not from which client made the call.
--   * It still writes to `deleted_orders` in the same transaction, BEFORE the
--     delete, so the shop can always account for a gap in its takings — the
--     order number, its total, its status, and who removed it. That record
--     matters MORE now, not less: an order can now be deleted while it is still
--     pending, so the audit row may be the only trace that it ever existed.
--   * The order's reviews still go with it, explicitly, rather than being
--     orphaned by `reviews.order_id`'s `on delete set null`.
--
-- WHAT NOW HAS NO DATABASE-SIDE GUARD is deleting an order that has not been
-- fulfilled. That is the shop owner's call to make and they have made it, so
-- the warning lives where a person can actually read it — the confirmation
-- dialog in `admin/src/pages/OrdersPage.tsx` says, for an order that is still
-- open, that deleting is not the same as cancelling: no stock comes back, and
-- the customer is left with nothing to point at if they ask what happened.
--
-- ARCHIVING IS UNCHANGED. `orders_archive_requires_settled` still allows an
-- `archived_at` only on a delivered or cancelled order, which is what keeps the
-- sidebar's open-orders badge from counting work that has been hidden from the
-- list. Archive remains the reversible option beside delete, not a step in
-- front of it.
-- ---------------------------------------------------------------------------

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

  -- Locked before it is read, so two administrators deleting the same order in
  -- the same instant cannot both get past the existence check and write two
  -- audit rows for one removal.
  select * into doomed from public.orders where id = target_order for update;

  if not found then
    raise exception 'That order no longer exists.'
      using errcode = 'no_data_found';
  end if;

  -- No archive check. That is the whole change.

  select count(*) into items_removed
    from public.order_items where order_id = target_order;

  select count(*) into reviews_removed
    from public.reviews where order_id = target_order;

  delete from public.reviews where order_id = target_order;

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
  'Permanently remove one order in any state, its line items and any reviews written from it, recording the fact in deleted_orders. Administrators only. There is deliberately no delete policy on public.orders — this function is the only way, and it can only ever remove the single order named by its id.';

revoke all on function public.delete_order(uuid) from public, anon;
grant execute on function public.delete_order(uuid) to authenticated;
