-- ---------------------------------------------------------------------------
-- Two rules that belong together: an order STARTS as pending, and a product
-- can only be reviewed once that order has been DELIVERED.
--
--   1. `place_order` used to finish by moving the row it had just written from
--      'pending' to 'confirmed' — so every successful checkout landed in the
--      admin's list already confirmed, and 'pending' only ever existed for the
--      instant between the insert and the totals update. That inverted what
--      the two words mean to whoever runs the shop: confirming an order is a
--      DECISION someone makes (the phone call, the address check, the stock on
--      the shelf), not something checkout does on their behalf. A new order is
--      now simply pending, and the admin dashboard's status dropdown (§8) is
--      what moves it on.
--
--   2. Review eligibility followed from "not cancelled", which included an
--      order placed ninety seconds ago. A review is meant to be about wearing
--      the piece, so the bar is now the last status in the chain: the order
--      must be 'delivered'. That is checked in THREE places, all of which have
--      to agree —
--
--        `find_order_for_review`      here, the guest's own lookup;
--        `submit-review`              the Edge Function, which re-derives
--                                     ownership itself on every write and is
--                                     the actual boundary;
--        the storefront               which only decides what to show.
--
-- Neither function is new. Both are restated in full because Postgres cannot
-- patch a function body in place — `create or replace` takes the whole thing.
-- THIS FILE IS NOW THE LIVE DEFINITION OF BOTH; the earlier migrations that
-- carry them (20260829000003 for `place_order`, 20260829000005 for
-- `find_order_for_review`) are history. Edit this one.
--
-- Existing rows are deliberately left alone. An order already marked confirmed
-- was confirmed under the old meaning, and rewriting live orders to say
-- something else about work already done is not a migration's business.
-- ---------------------------------------------------------------------------

create or replace function public.place_order(
  p_items jsonb,
  p_customer jsonb,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item            jsonb;
  v_product         public.products%rowtype;
  v_size            public.product_size;
  v_qty             integer;
  v_available       integer;
  v_thumb           text;
  v_subtotal        integer := 0;
  v_delivery        integer := 0;
  v_threshold       integer;
  v_order_id        uuid;
  v_order_number    text;
  v_review_token    uuid;
  v_line_count      integer := 0;
  -- Section 9: cash on delivery is the only method in version one, and it is
  -- decided HERE. Nothing in the request is consulted for it.
  v_payment_method  public.payment_method := 'cod';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'check_violation';
  end if;

  -- The client half of this cap is MAX_LINES in the storefront. Section 17
  -- requires the server to reject oversized input on its own account.
  if jsonb_array_length(p_items) > 20 then
    raise exception 'TOO_MANY_ITEMS' using errcode = 'check_violation';
  end if;

  v_order_id := gen_random_uuid();
  v_review_token := gen_random_uuid();

  -- A human-quotable reference. The date makes it scannable in the admin list,
  -- and the random tail keeps it unguessable enough to pair with an email.
  --
  -- The tail comes from gen_random_uuid(), which is BUILT IN. The obvious
  -- gen_random_bytes() lives in the pgcrypto extension, which is not installed
  -- on a stock Supabase database — using it made every order fail with
  -- "function does not exist", which is not a thing to discover in production.
  v_order_number := 'VW-' || to_char(now(), 'YYMMDD') || '-' ||
                    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  insert into public.orders (
    id, order_number, status,
    full_name, email, phone, address, city, postal_code, notes,
    subtotal, delivery_charge, total,
    payment_method,
    is_guest, user_id, review_token
  ) values (
    -- Where an order BEGINS, and now also where it stays until someone at the
    -- shop moves it on.
    v_order_id, v_order_number, 'pending',
    btrim(p_customer ->> 'fullName'),
    lower(btrim(p_customer ->> 'email')),
    btrim(p_customer ->> 'phone'),
    btrim(p_customer ->> 'address'),
    btrim(p_customer ->> 'city'),
    nullif(btrim(coalesce(p_customer ->> 'postalCode', '')), ''),
    nullif(btrim(coalesce(p_customer ->> 'notes', '')), ''),
    0, 0, 0,
    v_payment_method,
    p_user_id is null, p_user_id, v_review_token
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_size := (v_item ->> 'size')::public.product_size;
    v_qty  := (v_item ->> 'qty')::integer;

    if v_qty is null or v_qty < 1 or v_qty > 10 then
      raise exception 'BAD_QUANTITY' using errcode = 'check_violation';
    end if;

    -- The price comes from HERE, not from the request.
    select * into v_product
    from public.products
    where id = (v_item ->> 'productId')::uuid and active;

    if not found then
      raise exception 'PRODUCT_UNAVAILABLE:%', v_item ->> 'productId'
        using errcode = 'check_violation';
    end if;

    -- `for update` is the lock that makes the stock check meaningful: a second
    -- concurrent order for the same size blocks here until this one commits,
    -- then re-reads the decremented value and fails as it should.
    select stock into v_available
    from public.product_sizes
    where product_id = v_product.id and size = v_size
    for update;

    if v_available is null or v_available < v_qty then
      raise exception 'OUT_OF_STOCK:%:%', v_product.slug, v_size
        using errcode = 'check_violation';
    end if;

    update public.product_sizes
    set stock = stock - v_qty
    where product_id = v_product.id and size = v_size;

    select thumb_url into v_thumb
    from public.product_images
    where product_id = v_product.id
    order by position
    limit 1;

    insert into public.order_items (
      order_id, product_id, name, slug, thumb, size, qty, unit_price
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.slug,
      coalesce(v_thumb, ''), v_size, v_qty, v_product.price
    );

    v_subtotal := v_subtotal + (v_product.price * v_qty);
    v_line_count := v_line_count + 1;
  end loop;

  if v_line_count = 0 then
    raise exception 'EMPTY_CART' using errcode = 'check_violation';
  end if;

  -- Delivery is the admin-configured value (requirements section 10), read
  -- here rather than accepted from the browser.
  select delivery_charge, free_delivery_threshold
  into v_delivery, v_threshold
  from public.settings
  limit 1;

  v_delivery := coalesce(v_delivery, 0);
  if v_threshold is not null and v_subtotal >= v_threshold then
    v_delivery := 0;
  end if;

  -- The totals, and ONLY the totals. This update used to also set
  -- status = 'confirmed'; it no longer touches status at all, so the row keeps
  -- the 'pending' it was inserted with and the admin decides the rest.
  update public.orders
  set subtotal = v_subtotal,
      delivery_charge = v_delivery,
      total = v_subtotal + v_delivery
  where id = v_order_id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'reviewToken', v_review_token,
    'total', v_subtotal + v_delivery,
    'paymentMethod', v_payment_method
  );
end;
$$;

-- Unchanged from 20260829000003, restated because `create or replace` on a
-- function resets nothing else but a fresh definition deserves its grants
-- stated beside it: only trusted server code may place an order.
revoke all on function public.place_order(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.place_order(jsonb, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- find_order_for_review — the guest "order number + email" lookup (§16),
-- restated with the delivered rule.
--
-- Same name, same signature, same columns, same rate limit as the version in
-- 20260829000005 — the ONE line that differs is the status test, which was
-- `o.status <> 'cancelled'` and is now `o.status = 'delivered'`. A guest whose
-- order is still on its way gets back an empty list, which is the same answer
-- a wrong order number gives: this function has never distinguished between
-- kinds of "no", and it should not start now (that is what makes it useless
-- for probing someone else's order).
-- ---------------------------------------------------------------------------

create or replace function public.find_order_for_review(p_order_number text, p_email text)
returns table (
  order_id uuid,
  review_token uuid,
  product_id uuid,
  product_name text,
  product_slug text,
  size public.product_size,
  qty integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text;
  v_allowed boolean;
begin
  v_ip := coalesce(
    nullif(split_part(coalesce(current_setting('request.headers', true), '{}')::json->>'x-forwarded-for', ',', 1), ''),
    'unknown'
  );

  v_allowed := public.check_rate_limit('find-order-for-review:' || v_ip, 20, 900);
  if not v_allowed then
    raise exception 'Too many attempts. Please wait a few minutes and try again.' using errcode = '55000';
  end if;

  return query
  select o.id, o.review_token, oi.product_id, oi.name, oi.slug, oi.size, oi.qty
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.status = 'delivered'
    and o.order_number = btrim(p_order_number)
    and lower(o.email) = lower(btrim(p_email));
end;
$$;

grant execute on function public.find_order_for_review(text, text) to anon, authenticated;
