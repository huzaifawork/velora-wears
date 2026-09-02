-- ---------------------------------------------------------------------------
-- SIZE SCALES — a shoe is not a Medium.
--
-- The shop shipped with one global size enum:
--
--     create type public.product_size as enum ('S', 'M', 'L');
--
-- That is a description of the first few products, not of a clothing shop. It
-- meant three things, all wrong:
--
--   * a sneaker was sold in Small, Medium and Large;
--   * a trouser had no waist measurement anywhere in the system;
--   * nothing could be sold in XL, XXL or 3XL at all, so the size a great many
--     customers actually wear was unreachable — not "out of stock", but
--     literally unrepresentable.
--
-- After this migration a product names a SIZE SCALE, and its stock rows carry
-- codes from that scale. `shared/sizes.ts` is the matching definition on the
-- application side and carries the full reasoning; this file is the storage.
--
-- ---------------------------------------------------------------------------
-- WHY NO STOCK ROW IS TOUCHED BY THE CONVERSION
-- ---------------------------------------------------------------------------
-- The default scale is `alpha`, and `alpha` CONTAINS S, M and L. So every row
-- that exists today is already a valid code on the scale it lands on: the enum
-- becomes text, every product defaults to `alpha`, and the shop keeps selling
-- exactly what it sold a minute earlier. The only rows this migration rewrites
-- are the ones section 6 below deliberately re-scales, and that section says so
-- loudly.
--
-- ---------------------------------------------------------------------------
-- ORDER OF OPERATIONS
-- ---------------------------------------------------------------------------
-- The enum cannot be dropped while anything depends on it, and one thing does
-- in a way that is easy to miss: `find_order_for_review()` names it in a
-- RETURNS TABLE clause, which is a hard catalogued dependency. `place_order()`
-- only names it inside a plpgsql body, which Postgres does NOT track — so
-- dropping the type would leave that function syntactically fine and broken at
-- the first checkout. Both are restated below for that reason.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. The scale columns
-- ===========================================================================

alter table public.products
  add column if not exists size_scale text not null default 'alpha';

-- THIS LIST IS MIRRORED BY `SizeScaleId` IN `shared/sizes.ts`. Adding a scale
-- means adding it in both places; there is no third copy.
alter table public.products
  drop constraint if exists products_size_scale_known;

alter table public.products
  add constraint products_size_scale_known check (
    size_scale in ('alpha', 'waist-in', 'shoe-eu', 'shoe-uk', 'one-size')
  );

comment on column public.products.size_scale is
  'Which set of sizes this product is sold in. Decides the order and wording of '
  'the codes in product_sizes; see shared/sizes.ts.';

-- A category's SUGGESTION for new products in it — the product editor
-- pre-selects it so nobody has to remember that shoes are EU-sized. It is a
-- default and nothing more: a product's own `size_scale` is the authority, and
-- changing a category's suggestion never rewrites products already in it.
alter table public.categories
  add column if not exists default_size_scale text;

alter table public.categories
  drop constraint if exists categories_default_size_scale_known;

alter table public.categories
  add constraint categories_default_size_scale_known check (
    default_size_scale is null
    or default_size_scale in ('alpha', 'waist-in', 'shoe-eu', 'shoe-uk', 'one-size')
  );

comment on column public.categories.default_size_scale is
  'Pre-selected size scale for NEW products in this category. A suggestion for '
  'the editor, never applied retroactively.';


-- ===========================================================================
-- 2. The enum becomes text
-- ===========================================================================
--
-- `using size::text` is lossless: the enum labels are already the strings the
-- application uses.

alter table public.product_sizes
  alter column size type text using size::text;

alter table public.product_sizes
  drop constraint if exists product_sizes_size_shape;

-- The shape check, not a whitelist. WHICH codes a given product accepts is
-- decided by which rows exist for it — that is the whole point of scales, and a
-- global whitelist here would put the old enum back under a new name. This only
-- keeps junk and empty strings out of a primary key column.
alter table public.product_sizes
  add constraint product_sizes_size_shape check (
    length(size) between 1 and 16 and size ~ '^[A-Za-z0-9][A-Za-z0-9. /-]*$'
  );

alter table public.order_items
  alter column size type text using size::text;

-- How the size was WORDED when the order was placed, snapshotted beside the
-- name, slug, thumbnail and unit price for exactly the same reason: an order is
-- a record of what someone bought and has to keep reading correctly after the
-- product is edited. Re-deriving it later is not possible — the wording lives
-- on the product's current scale, so a sneaker moved from EU to UK sizing would
-- retroactively turn a stored '42' into 'UK 42', a shoe that does not exist.
alter table public.order_items
  add column if not exists size_label text;

-- Backfill what can be known for certain. Every order that exists today was
-- placed under the old enum, so its codes are S, M and L and their wording was
-- never in doubt.
update public.order_items
set size_label = case size
                   when 'S' then 'Small'
                   when 'M' then 'Medium'
                   when 'L' then 'Large'
                   else size
                 end
where size_label is null;


-- ===========================================================================
-- 3. The two functions that named the enum
-- ===========================================================================

-- `find_order_for_review` returns the enum in its signature, so its return type
-- has to change — and a return type cannot be changed by `create or replace`.
-- Dropping and recreating is the only route. The body is unchanged from
-- 20260831000002 apart from the two size columns.
drop function if exists public.find_order_for_review(text, text);

create function public.find_order_for_review(p_order_number text, p_email text)
returns table (
  order_id uuid,
  review_token uuid,
  product_id uuid,
  product_name text,
  product_slug text,
  size text,
  size_label text,
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
  select o.id, o.review_token, oi.product_id, oi.name, oi.slug,
         oi.size, coalesce(oi.size_label, oi.size), oi.qty
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.status = 'delivered'
    and o.order_number = btrim(p_order_number)
    and lower(o.email) = lower(btrim(p_email));
end;
$$;

grant execute on function public.find_order_for_review(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- place_order — restated in full.
--
-- THIS FILE IS NOW THE LIVE DEFINITION; 20260831000002 is history. Three things
-- differ from that version and nothing else does:
--
--   1. `v_size` is text rather than the enum.
--   2. The size is shape-checked before use, so a malformed code fails as bad
--      input instead of as a cast error nobody can read.
--   3. The order line records `size_label`, resolved from the product's scale
--      at the moment of purchase.
--
-- The stock check itself is UNCHANGED and is still the real validation of a
-- size: `select stock ... where product_id = ... and size = v_size for update`
-- finds no row for a size the product is not sold in, and OUT_OF_STOCK is
-- exactly the right answer to "I would like a shoe in Medium".
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
  v_size            text;
  v_size_label      text;
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
  v_order_number := 'VW-' || to_char(now(), 'YYMMDD') || '-' ||
                    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  insert into public.orders (
    id, order_number, status,
    full_name, email, phone, address, city, postal_code, notes,
    subtotal, delivery_charge, total,
    payment_method,
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
    v_payment_method,
    p_user_id is null, p_user_id, v_review_token
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_size := btrim(coalesce(v_item ->> 'size', ''));
    v_qty  := (v_item ->> 'qty')::integer;

    -- Shape only. The product's own stock rows decide whether this is a size it
    -- comes in, a few lines below.
    if v_size = '' or length(v_size) > 16 or v_size !~ '^[A-Za-z0-9][A-Za-z0-9. /-]*$' then
      raise exception 'BAD_SIZE' using errcode = 'check_violation';
    end if;

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
    --
    -- It is ALSO the size check. No row means this product is not sold in this
    -- size at all, and "out of stock" is the honest answer to that.
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

    -- The wording, resolved once, here, and then frozen onto the line. Kept in
    -- step with `sizeLabel()` in shared/sizes.ts.
    v_size_label := case v_product.size_scale
      when 'alpha' then case v_size
        when 'XS' then 'Extra small'
        when 'S'  then 'Small'
        when 'M'  then 'Medium'
        when 'L'  then 'Large'
        when 'XL' then 'Extra large'
        when 'XXL' then 'Double extra large'
        when '3XL' then 'Triple extra large'
        else v_size end
      when 'waist-in'  then v_size || ' inch waist'
      when 'shoe-eu'   then 'EU ' || v_size
      when 'shoe-uk'   then 'UK ' || v_size
      when 'one-size'  then 'One size'
      else v_size
    end;

    insert into public.order_items (
      order_id, product_id, name, slug, thumb, size, size_label, qty, unit_price
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.slug,
      coalesce(v_thumb, ''), v_size, v_size_label, v_qty, v_product.price
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

revoke all on function public.place_order(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.place_order(jsonb, jsonb, uuid) to service_role;


-- ===========================================================================
-- 4. The enum goes
-- ===========================================================================

drop type if exists public.product_size;


-- ===========================================================================
-- 5. The product summary view carries the scale
-- ===========================================================================
--
-- The inventory screen labels a stock column per product and reads its rows
-- from this view. Without the scale here it would need a second query against
-- `products` for every page of results purely to find out how to word "42".
--
-- `create or replace view` can APPEND a column, which is all this needs and is
-- exactly how `featured` was added in 20260830000001. Dropping and recreating
-- would work too, and would silently discard the view's grants along the way.
-- Everything above the marked line is character-for-character that version.

create or replace view public.product_summaries
with (security_invoker = on)
as
select
  p.id,
  p.slug,
  p.name,
  p.price,
  p.category_slug,
  p.active,
  p.created_at,
  p.search_text,
  coalesce(img.thumb_url, '') as thumb,
  coalesce(stock.total, 0) > 0 as in_stock,
  (
    coalesce(stock.total, 0) > 0
    and coalesce(stock.total, 0) <= coalesce((select low_stock_threshold from public.settings limit 1), 4)
  ) as low_stock,
  coalesce(stock.total, 0) as total_stock,
  coalesce(rating.avg_rating, 0)::numeric(3, 1) as rating_avg,
  coalesce(rating.review_count, 0) as rating_count,
  p.featured,
  p.featured_position,
  -- Appended 2026-09-02. Everything above this line is unchanged.
  p.size_scale
from public.products p
left join lateral (
  select i.thumb_url
  from public.product_images i
  where i.product_id = p.id
  order by i.position
  limit 1
) img on true
left join lateral (
  select sum(s.stock) as total
  from public.product_sizes s
  where s.product_id = p.id
) stock on true
left join lateral (
  select avg(r.rating) as avg_rating, count(*) as review_count
  from public.reviews r
  where r.product_id = p.id and not r.hidden
) rating on true;


-- ===========================================================================
-- 6. Point the existing catalogue at the right scales
-- ===========================================================================
--
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE RUNNING — THIS SECTION CHANGES STOCK.
-- ---------------------------------------------------------------------------
-- Sections 1–5 are pure structure and lose nothing. This one is a judgement
-- call about YOUR catalogue, and it is separated out so it can be skipped.
--
-- A shoe currently carrying `S / M / L` stock rows has numbers in it that mean
-- nothing — nobody counted "large sneakers", because that is not a thing the
-- stockroom contains. Re-scaling the product to EU sizes and keeping those rows
-- would leave three unsellable phantom sizes hanging off the end of the size
-- selector forever.
--
-- So for products whose scale actually CHANGES here, the old alpha rows are
-- deleted and the new scale is seeded at zero. Those products show as sold out
-- until somebody counts them, which is the truthful state: the shop does not
-- know how many EU 42s it has. Nothing is deleted for a product that stays on
-- `alpha` — which is everything except shoes and trousers.
--
-- If you would rather set the scales by hand in the dashboard, delete this
-- section before running the file. Everything above it still applies.
-- ---------------------------------------------------------------------------

-- The category suggestion, so new products land on the right scale on their own.
update public.categories
set default_size_scale = case
  when slug ~ '(shoe|sneaker|footwear|boot|sandal)' then 'shoe-eu'
  when slug ~ '(trouser|pant|jean|short|denim|cargo)' then 'waist-in'
  when slug ~ '(cap|hat|belt|bag|scarf|sock|accessor)' then 'one-size'
  else 'alpha'
end
where default_size_scale is null;

-- ---------------------------------------------------------------------------
-- NO TEMPORARY TABLE HERE, DELIBERATELY.
-- ---------------------------------------------------------------------------
-- The obvious way to write this is to capture the affected products into a
-- `create temporary table` and then join against it three times. That FAILS in
-- the Supabase SQL editor with `relation "_rescaled" does not exist`: the
-- editor runs statements over a pooled connection, so the next statement can
-- land on a different backend session and a temp table is per-session.
--
-- So the three statements below each re-derive the same set from the catalogue
-- itself, using `p.size_scale = 'alpha'` as the marker for "not yet moved".
-- THE ORDER MATTERS: the update that clears that marker runs LAST, so the two
-- statements before it can still find their rows. Written this way the section
-- is also re-runnable — a second pass matches nothing and changes nothing.
-- ---------------------------------------------------------------------------

-- The phantom rows described above, cleared before the products move.
delete from public.product_sizes s
using public.products p
join public.categories c on c.slug = p.category_slug
where s.product_id = p.id
  and p.size_scale = 'alpha'
  and c.default_size_scale is not null
  and c.default_size_scale <> 'alpha';

-- Seed the middle of each new scale at zero stock, so the product editor opens
-- with the sizes the shop most likely stocks already listed and waiting for a
-- count, rather than an empty panel. An admin adds or removes from there.
insert into public.product_sizes (product_id, size, stock)
select p.id, seeded.size, 0
from public.products p
join public.categories c on c.slug = p.category_slug
cross join lateral (
  select unnest(case c.default_size_scale
    when 'shoe-eu'  then array['40', '41', '42', '43', '44']
    when 'shoe-uk'  then array['7', '8', '9', '10']
    when 'waist-in' then array['30', '32', '34', '36']
    when 'one-size' then array['OS']
    else array[]::text[]
  end) as size
) seeded
where p.size_scale = 'alpha'
  and c.default_size_scale is not null
  and c.default_size_scale <> 'alpha'
on conflict (product_id, size) do nothing;

-- LAST. This is what clears the `size_scale = 'alpha'` marker the two
-- statements above select on, so it cannot run before them.
update public.products p
set size_scale = c.default_size_scale
from public.categories c
where c.slug = p.category_slug
  and p.size_scale = 'alpha'
  and c.default_size_scale is not null
  and c.default_size_scale <> 'alpha';
