-- ---------------------------------------------------------------------------
-- Section 18/19 audit (2026-08-29) — one real gap found: `orders.user_id` had
-- no index, but `listMyOrders()` (storefront/src/lib/myOrders.ts) reads
-- `orders` filtered by the RLS policy `user_id = auth.uid()` and ordered by
-- `created_at desc`. Every other column a query filters or sorts on already
-- has one (`orders_created`, `orders_status`, `orders_email`); this one was
-- missed because the query is expressed entirely in the RLS policy rather
-- than in application code, so it never showed up in a grep for `.eq(` or
-- `.order(`. Requirements section 19: "Any column used for filtering or
-- ordering needs an index in the migration that introduces the query."
--
-- `where user_id is not null` matches how the column is actually used: a
-- guest order always has a null user_id and is never matched by this policy,
-- so there is nothing useful to index for those rows.
-- ---------------------------------------------------------------------------

create index orders_user on public.orders (user_id, created_at desc) where user_id is not null;
