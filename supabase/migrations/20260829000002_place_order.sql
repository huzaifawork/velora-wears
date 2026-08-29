-- ---------------------------------------------------------------------------
-- place_order — the only way an order is ever written.
--
-- This replaces the Firebase `placeOrder` Cloud Function, and it lives in SQL
-- rather than in the Edge Function for one reason: ATOMICITY. Requirements
-- section 17 demands that stock be re-checked "at the moment of confirmation",
-- and section 11 that a size which sold out mid-checkout cannot be ordered.
-- Reading stock in TypeScript and then writing it back leaves a window where
-- two customers both pass the check and both buy the last shirt. A single SQL
-- function runs in one transaction, and `for update` locks the stock rows for
-- the duration, so the second caller waits and then correctly fails.
--
-- The Edge Function in supabase/functions/place-order does the field
-- validation and shapes the response; everything that touches money or stock
-- happens here.
--
-- WHAT THE CLIENT SENDS: product ids, sizes and quantities. Nothing else.
-- Prices, the delivery charge and the total are read from the database, never
-- from the request (requirements section 17).
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
    is_guest, user_id, review_token
  ) values (
    v_order_id, v_order_number, 'pending',
    btrim(p_customer ->> 'fullName'),
    lower(btrim(p_customer ->> 'email')),
    btrim(p_customer ->> 'phone'),
    btrim(p_customer ->> 'address'),
    btrim(p_customer ->> 'city'),
    nullif(btrim(coalesce(p_customer ->> 'postalCode', '')), ''),
    nullif(btrim(coalesce(p_customer ->> 'notes', '')), ''),
    0, 0, 0,
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

  update public.orders
  set subtotal = v_subtotal,
      delivery_charge = v_delivery,
      total = v_subtotal + v_delivery,
      status = 'confirmed'
  where id = v_order_id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'reviewToken', v_review_token,
    'total', v_subtotal + v_delivery
  );
end;
$$;

-- Only trusted server code may call this. The Edge Function uses the service
-- role key; the browser's anon key is deliberately not granted execute, so the
-- storefront cannot reach past its own validation (requirements section 17).
revoke all on function public.place_order(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.place_order(jsonb, jsonb, uuid) to service_role;
