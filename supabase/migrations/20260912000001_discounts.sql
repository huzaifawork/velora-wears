-- ---------------------------------------------------------------------------
-- Velora Wears — DISCOUNTS.
--
-- The client's request: put a whole category on offer ("every shirt is 10%
-- off"), put one particular piece on offer ("this shirt is half price"), run
-- each for a stated number of days, and have it stop by itself.
--
-- `shared/discounts.ts` is the companion to this file and carries the full
-- reasoning — what a discount is, why offers do not stack, and how a price is
-- rounded. Read it first. What follows is the same rules in SQL, and the two
-- MUST be changed together.
--
-- ---------------------------------------------------------------------------
-- WHY THE DATABASE COMPUTES THE SALE PRICE AND THE BROWSER DOES NOT
-- ---------------------------------------------------------------------------
-- The same reason the base price and the delivery charge are read here rather
-- than accepted from a request (requirements section 17). A browser that could
-- name its own discount could order the catalogue for nothing. So:
--
--   product_summaries   computes the sale price for every LISTING, which is
--                       also what lets Postgres sort and filter by it — "price:
--                       low to high" has to mean the price on the label.
--
--   place_order()       resolves it AGAIN at the moment of purchase, from the
--                       discounts live at that instant. A sale that ended while
--                       a bag sat open charges full price, which is the honest
--                       answer and the one the shop can defend.
--
-- The storefront reads the computed figure off the summary and renders it. It
-- never resolves a discount itself; the one thing it decides on its own is
-- whether the clock has run out since the page was loaded.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. The table
-- ===========================================================================

create type public.discount_scope as enum ('all', 'category', 'product');
create type public.discount_kind  as enum ('percent', 'amount');

create table public.discounts (
  id uuid primary key default gen_random_uuid(),

  -- The admin's own label. Never shown to a customer — the shop window says
  -- "10% off", not "Winter clearance FINAL v2".
  name text not null check (length(btrim(name)) between 2 and 80),

  scope public.discount_scope not null,

  -- Exactly one of these is set, and which one is decided by `scope`. The
  -- constraint below is what makes that true rather than conventional.
  --
  -- `on delete cascade` on both: a discount on a category that no longer exists
  -- is not a discount, it is a row that would quietly never match anything.
  category_slug text references public.categories (slug)
    on update cascade on delete cascade,
  product_id uuid references public.products (id) on delete cascade,

  kind public.discount_kind not null,
  value integer not null check (value > 0),

  -- Null start means "already running"; null end means "until switched off".
  -- `ends_at` is EXCLUSIVE, so a sale ending "Friday" set to Friday 00:00 is
  -- over when Friday begins — which is what the admin form's date picker means
  -- by an end date, and it never leaves a half-day of ambiguity.
  starts_at timestamptz,
  ends_at timestamptz,

  -- The switch. A finished sale is worth keeping: it is how the same offer runs
  -- again next season without being typed out from scratch.
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The target matches the scope, always.
  constraint discounts_target_matches_scope check (
    (scope = 'all'      and category_slug is null and product_id is null)
    or (scope = 'category' and category_slug is not null and product_id is null)
    or (scope = 'product'  and category_slug is null and product_id is not null)
  ),

  -- A percentage has to leave something behind — MAX_DISCOUNT_PERCENT in
  -- shared/discounts.ts, and the reasoning is there.
  constraint discounts_percent_in_range check (
    kind <> 'percent' or value between 1 and 90
  ),

  constraint discounts_ends_after_start check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

-- The lookup every listing makes, once per product: "is there a live discount
-- for this id, this category, or the whole shop?" Partial on `active`, because
-- a switched-off discount is never a candidate.
create index discounts_live on public.discounts (scope, starts_at, ends_at) where active;
create index discounts_product on public.discounts (product_id) where active and product_id is not null;
create index discounts_category on public.discounts (category_slug) where active and category_slug is not null;

create trigger discounts_touch
  before update on public.discounts
  for each row execute function public.touch_updated_at();


-- ===========================================================================
-- 2. The arithmetic
-- ===========================================================================

-- What one discount does to one price. The REDUCTION is what gets rounded, not
-- the resulting price — see `priceAfter()` in shared/discounts.ts.
--
-- IMMUTABLE, so Postgres may use it inside an index or fold it in a plan; it
-- reads nothing but its arguments.
create or replace function public.discounted_price(
  p_price integer,
  p_kind public.discount_kind,
  p_value integer
)
returns integer
language sql
immutable
as $$
  select greatest(
    0,
    p_price - case
      when p_kind = 'percent' then round(p_price * p_value / 100.0)::integer
      else p_value
    end
  );
$$;

-- ---------------------------------------------------------------------------
-- THE BEST LIVE OFFER ON ONE PRODUCT.
--
-- One function, called by the summaries view AND by place_order(), so a price
-- on a card and the price on the invoice are computed by the same code. This is
-- the single most important line in this file: the alternative — the view doing
-- it one way and the order function another — is a shop that charges something
-- other than what it advertised.
--
-- STABLE rather than IMMUTABLE: it reads tables and calls now().
--
-- "Best" is the LOWEST resulting price, ties broken toward the offer that runs
-- longest. Offers never stack; shared/discounts.ts explains why at length.
-- ---------------------------------------------------------------------------
create or replace function public.best_discount(
  p_product_id uuid,
  p_price integer,
  p_category_slug text
)
returns table (
  discount_id uuid,
  sale_price integer,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    public.discounted_price(p_price, d.kind, d.value),
    d.ends_at
  from public.discounts d
  where d.active
    and (d.starts_at is null or d.starts_at <= now())
    and (d.ends_at is null or d.ends_at > now())
    and (
      d.scope = 'all'
      or (d.scope = 'product' and d.product_id = p_product_id)
      or (
        d.scope = 'category'
        and d.category_slug in (
          -- The category itself AND its parent: browsing "Shirts" already shows
          -- everything filed under it (requirements section 5), so an offer on
          -- Shirts that skipped the Oxford shirts inside it would be a sale
          -- with an invisible hole in it.
          select p_category_slug
          union all
          select c.parent_slug from public.categories c
           where c.slug = p_category_slug and c.parent_slug is not null
        )
      )
    )
    -- A discount that takes nothing off is not an offer, and must never put a
    -- struck-through price on a card that reads the same on both sides.
    and public.discounted_price(p_price, d.kind, d.value) < p_price
  order by
    public.discounted_price(p_price, d.kind, d.value) asc,
    d.ends_at desc nulls first,
    d.created_at desc
  limit 1;
$$;

-- SECURITY DEFINER because the storefront reads the summaries view as `anon`,
-- and `discounts` is only partly readable to it (see the policies below). The
-- function answers one narrow question about one product and returns no row
-- from the table, so it leaks nothing a price tag does not already say.
revoke all on function public.best_discount(uuid, integer, text) from public;
grant execute on function public.best_discount(uuid, integer, text) to anon, authenticated, service_role;


-- ===========================================================================
-- 3. Row level security
-- ===========================================================================

alter table public.discounts enable row level security;

-- A LIVE discount is public information: it is printed on the product card.
-- A scheduled one is not — next Friday's sale is the shop's own business until
-- it starts, and the anon key is readable by anyone who opens the network tab.
create policy "live discounts are public" on public.discounts for select
  using (
    active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

create policy "admins see every discount" on public.discounts for select
  using (public.is_admin());

create policy "admins manage discounts" on public.discounts for all
  using (public.is_admin()) with check (public.is_admin());


-- ===========================================================================
-- 4. Realtime
-- ===========================================================================
--
-- So an admin starting a sale updates every open shop tab, exactly as a price
-- edit already does. Guarded the same way `site_images` was, so re-running this
-- migration on a database that already has it does not error.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'discounts'
  ) then
    alter publication supabase_realtime add table public.discounts;
  end if;
end $$;


-- ===========================================================================
-- 5. product_summaries — restated with the offer on it
-- ===========================================================================
--
-- `create or replace view` can APPEND columns, which is all this needs; the
-- last full definition is in 20260902000002_size_scales.sql and everything
-- above the marked line below is character-for-character that version.
--
-- The lateral is the same shape as the three already here. It is one call per
-- row over a table with a handful of rows in it, on a page of at most a few
-- dozen products.

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
  p.size_scale,
  -- Appended 2026-09-12. Everything above this line is unchanged.
  --
  -- NULL when nothing is on offer, and that is deliberate: `price` stays the
  -- one field a surface can render without asking any questions, so a card with
  -- no discount is unchanged from the day before this existed.
  offer.sale_price,
  offer.ends_at as discount_ends_at,
  -- What the customer PAYS. Sorting and filtering read this, because "price:
  -- low to high" has to mean the price on the label.
  coalesce(offer.sale_price, p.price) as effective_price
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
) rating on true
left join lateral (
  select b.sale_price, b.ends_at
  from public.best_discount(p.id, p.price, p.category_slug) b
) offer on true;


-- ===========================================================================
-- 6. What an order remembers about the discount it got
-- ===========================================================================
--
-- An order is a record of what somebody bought, and every line already
-- snapshots the name, slug, thumbnail, size wording and price so it keeps
-- reading correctly after the product has been edited (see `OrderItem` in
-- shared/types.ts). A discount is the same kind of fact and gets the same
-- treatment.
--
-- `unit_price` keeps its meaning exactly: WHAT WAS CHARGED. So every total
-- already written stays correct and nothing has to be recomputed. `list_price`
-- is what it would have cost without the sale — null on every order placed
-- before discounts existed, which is the truth about those orders.

alter table public.order_items
  add column if not exists list_price integer check (list_price is null or list_price >= 0);

comment on column public.order_items.list_price is
  'The price before any discount. Null when the line was not discounted, or was placed before discounts existed. `unit_price` is always what was actually charged.';

-- Denormalised onto the order so the admin list and the customer's order
-- history can say "saved Rs 1,200" without reading every line back.
alter table public.orders
  add column if not exists discount_total integer not null default 0
    check (discount_total >= 0);

comment on column public.orders.discount_total is
  'Sum of (list_price - unit_price) * qty across the lines. Zero for an order with no discounted line. Purely for display: `subtotal` is already the discounted figure and `total` is unchanged.';


-- ===========================================================================
-- 7. place_order — restated in full
-- ===========================================================================
--
-- THIS FILE IS NOW THE LIVE DEFINITION; 20260902000002 is history. A Postgres
-- function cannot be patched in place, so adding the discount meant restating
-- the whole body. What differs from that version, and nothing else does:
--
--   1. each line asks `best_discount()` for the price to charge;
--   2. the line records `list_price` when it was discounted;
--   3. the order records `discount_total`.
--
-- THE DISCOUNT IS RESOLVED HERE, NOW, not taken from the request. A sale that
-- ended while the bag sat open charges full price, and one that started in the
-- meantime charges the lower one. Either way the customer is charged what the
-- shop is offering at the moment they press the button, and the confirmation
-- page shows the figure this function returned rather than the browser's.

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
  v_unit_price      integer;
  v_list_price      integer;
  v_sale_price      integer;
  v_subtotal        integer := 0;
  v_discount_total  integer := 0;
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

    -- THE DISCOUNT, resolved at this instant. `sale_price` is null when nothing
    -- is running, and then this line is priced exactly as it was before
    -- discounts existed.
    select b.sale_price into v_sale_price
    from public.best_discount(v_product.id, v_product.price, v_product.category_slug) b;

    if v_sale_price is not null and v_sale_price < v_product.price then
      v_unit_price := v_sale_price;
      v_list_price := v_product.price;
      v_discount_total := v_discount_total + ((v_product.price - v_sale_price) * v_qty);
    else
      v_unit_price := v_product.price;
      v_list_price := null;
    end if;

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
      order_id, product_id, name, slug, thumb, size, size_label, qty,
      unit_price, list_price
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.slug,
      coalesce(v_thumb, ''), v_size, v_size_label, v_qty,
      v_unit_price, v_list_price
    );

    v_subtotal := v_subtotal + (v_unit_price * v_qty);
    v_line_count := v_line_count + 1;
  end loop;

  if v_line_count = 0 then
    raise exception 'EMPTY_CART' using errcode = 'check_violation';
  end if;

  -- Delivery is the admin-configured value (requirements section 10), read
  -- here rather than accepted from the browser.
  --
  -- The free-delivery threshold is tested against the DISCOUNTED subtotal,
  -- because that is what the customer is actually spending. The alternative —
  -- qualifying on the pre-discount figure — would mean a bag that says
  -- "Rs 4,800" earning the free delivery of a Rs 6,000 one.
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
      discount_total = v_discount_total,
      total = v_subtotal + v_delivery
  where id = v_order_id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'reviewToken', v_review_token,
    'total', v_subtotal + v_delivery,
    'discountTotal', v_discount_total,
    'paymentMethod', v_payment_method
  );
end;
$$;

-- Only trusted server code may call this. The Edge Function uses the service
-- role key; the browser's anon key is deliberately not granted execute, so the
-- storefront cannot reach past its own validation (requirements section 17).
revoke all on function public.place_order(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.place_order(jsonb, jsonb, uuid) to service_role;
