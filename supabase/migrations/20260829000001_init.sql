-- ---------------------------------------------------------------------------
-- Velora Wears — initial schema.
--
-- Supabase is Postgres. "Supabase Realtime" is not a second database: it is a
-- server that tails Postgres's write-ahead log and pushes row changes to
-- subscribed browsers. So the live catalog the storefront needs is built out of
-- ordinary tables, and the realtime publication at the bottom of this file is
-- what makes them live.
--
-- This replaces the Firebase Realtime Database design. The one structural
-- change worth understanding:
--
--   Firebase needed `products` AND a hand-maintained `productSummaries` copy,
--   because RTDB cannot join or filter on two fields at once. The admin
--   dashboard had to rewrite the summary on every edit, and a missed write
--   showed customers the wrong price.
--
--   Postgres can join. `product_summaries` is now a VIEW, computed from the
--   real data. There is nothing to keep in sync, so it cannot go stale.
--
-- Money is stored as a whole number of rupees (integer). There are no paisa
-- amounts in this catalog, and integers cannot drift the way floats do.
-- ---------------------------------------------------------------------------

create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.product_size as enum ('S', 'M', 'L');

create type public.order_status as enum (
  'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'
);

-- ---------------------------------------------------------------------------
-- Who is an admin
--
-- Firebase used `admins/{uid} = true`. The equivalent here is a table joined to
-- Supabase Auth. `is_admin()` is SECURITY DEFINER so a policy can call it
-- without the caller needing to read the table itself — and it is marked STABLE
-- so Postgres evaluates it once per statement rather than once per row.
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.categories (
  slug text primary key,
  name text not null,
  sort_order integer not null default 0,
  thumb text,
  description text,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  category_slug text not null references public.categories (slug)
    on update cascade on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Denormalised for search. Generated, so it can never disagree with the row
  -- it describes — the Firebase version had to be written by hand.
  search_text text generated always as (
    lower(name || ' ' || category_slug)
  ) stored
);

-- Substring search, which the Realtime Database could not do at all: its
-- startAt/endAt could only match a PREFIX, so "shirt" never found "Oxford
-- Shirt". A trigram index makes ILIKE '%term%' fast.
create index products_search_trgm on public.products using gin (search_text gin_trgm_ops);
create index products_category on public.products (category_slug) where active;
create index products_created on public.products (created_at desc) where active;
create index products_price on public.products (price) where active;

-- Stock is per size (requirements section 11), so it is its own table rather
-- than a JSON blob: it has to be queried, aggregated, and decremented safely
-- under concurrency when an order is placed.
create table public.product_sizes (
  product_id uuid not null references public.products (id) on delete cascade,
  size public.product_size not null,
  stock integer not null default 0 check (stock >= 0),
  primary key (product_id, size)
);

create index product_sizes_product on public.product_sizes (product_id);

-- Two variants per image (requirements section 19). `full` is a reserved word
-- in SQL, hence the _url suffixes.
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  position integer not null default 0,
  thumb_url text not null,
  full_url text not null,
  alt text,
  width integer,
  height integer
);

create index product_images_product on public.product_images (product_id, position);

-- ---------------------------------------------------------------------------
-- Settings
--
-- One row, enforced by a primary key that can only ever be true. Split public
-- from private so the delivery charge can be world-readable (checkout needs it)
-- without exposing anything else.
-- ---------------------------------------------------------------------------

create table public.settings (
  id boolean primary key default true check (id),
  delivery_charge integer not null default 0 check (delivery_charge >= 0),
  free_delivery_threshold integer check (free_delivery_threshold >= 0),
  low_stock_threshold integer not null default 4 check (low_stock_threshold >= 0),
  store_announcement text,
  updated_at timestamptz not null default now()
);

create table public.settings_private (
  id boolean primary key default true check (id),
  notify_email text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Orders — written ONLY by trusted server code (requirements section 17).
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  status public.order_status not null default 'pending',

  -- Customer PII. Never publicly readable (requirements section 17).
  full_name text not null,
  email text not null,
  phone text not null,
  address text not null,
  city text not null,
  postal_code text,
  notes text,

  -- All computed server-side. Never trusted from the browser.
  subtotal integer not null check (subtotal >= 0),
  delivery_charge integer not null check (delivery_charge >= 0),
  total integer not null check (total >= 0),

  is_guest boolean not null default true,
  user_id uuid references auth.users (id) on delete set null,

  -- Grants review access to a guest who has no account (section 16).
  review_token uuid not null default gen_random_uuid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_created on public.orders (created_at desc);
create index orders_status on public.orders (status, created_at desc);
create index orders_email on public.orders (lower(email));

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,

  -- Snapshotted at order time: what the customer actually bought, at the price
  -- they actually paid, even if the product is renamed or repriced later.
  name text not null,
  slug text not null,
  thumb text not null,
  size public.product_size not null,
  qty integer not null check (qty > 0),
  unit_price integer not null check (unit_price >= 0)
);

create index order_items_order on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- Reviews (requirements section 16)
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (length(btrim(comment)) > 0),
  display_name text not null,
  verified_purchase boolean not null default false,
  hidden boolean not null default false,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- One review per product per order (requirements section 16).
  unique (order_id, product_id)
);

create index reviews_product on public.reviews (product_id, created_at desc) where not hidden;

-- ---------------------------------------------------------------------------
-- product_summaries — THE VIEW
--
-- The list projection every grid, category page and search result reads. In the
-- Firebase design this was a table the admin dashboard had to keep in sync by
-- hand; here it is derived, so a stale summary is not a bug that can happen.
--
-- `security_invoker` makes the view run with the CALLER's permissions, so the
-- row-level security on `products` below actually applies to it. Without it a
-- view silently runs as its owner and becomes a way around RLS.
-- ---------------------------------------------------------------------------

create view public.product_summaries
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
  coalesce(rating.review_count, 0) as rating_count
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

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- The Firebase equivalent was database.rules.json: the public catalog is
-- readable by anyone, and every write goes through trusted server code.
-- RLS is deny-by-default once enabled, so anything without a policy is closed.
-- ---------------------------------------------------------------------------

alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.product_sizes    enable row level security;
alter table public.product_images   enable row level security;
alter table public.settings         enable row level security;
alter table public.settings_private enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.reviews          enable row level security;
alter table public.admins           enable row level security;

-- Public catalog: readable by anyone, writable only by an admin.
create policy "catalog is public" on public.categories for select using (true);
create policy "admins manage categories" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- Only ACTIVE products are public. A retired piece disappears from every
-- listing and from its own detail page without anything else changing.
create policy "active products are public" on public.products for select using (active);
create policy "admins see every product" on public.products for select using (public.is_admin());
create policy "admins manage products" on public.products for all
  using (public.is_admin()) with check (public.is_admin());

create policy "stock is public" on public.product_sizes for select using (true);
create policy "admins manage stock" on public.product_sizes for all
  using (public.is_admin()) with check (public.is_admin());

create policy "images are public" on public.product_images for select using (true);
create policy "admins manage images" on public.product_images for all
  using (public.is_admin()) with check (public.is_admin());

-- Checkout has to read the delivery charge (requirements section 10).
create policy "public settings are public" on public.settings for select using (true);
create policy "admins manage settings" on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

create policy "admins read private settings" on public.settings_private for all
  using (public.is_admin()) with check (public.is_admin());

-- Visible reviews are public; hidden ones are not, so an admin hiding spam
-- actually hides it (requirements section 16).
create policy "visible reviews are public" on public.reviews for select using (not hidden);
create policy "admins manage reviews" on public.reviews for all
  using (public.is_admin()) with check (public.is_admin());

-- ORDERS CARRY CUSTOMER PII and have NO public select policy, so they are
-- invisible to the anon key entirely (requirements section 17). A signed-in
-- customer may read their own. Everything else is admin or service_role.
create policy "customers read their own orders" on public.orders for select
  using (user_id is not null and user_id = auth.uid());
create policy "admins read orders" on public.orders for select using (public.is_admin());
create policy "admins update orders" on public.orders for update
  using (public.is_admin()) with check (public.is_admin());

create policy "customers read their own order items" on public.order_items for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.user_id is not null and o.user_id = auth.uid()
  ));
create policy "admins read order items" on public.order_items for select using (public.is_admin());

create policy "admins read admins" on public.admins for select using (public.is_admin());

-- NOTE: there is deliberately no INSERT policy on orders or order_items for
-- anon or authenticated. Orders are written by the place-order Edge Function
-- using the service role key, which bypasses RLS — that is the whole point of
-- requirements section 17: totals and stock are decided by trusted code.

-- ---------------------------------------------------------------------------
-- Realtime — EVERY table is published.
--
-- This is what makes it a "realtime database": Postgres publishes row changes
-- and the Realtime server streams them to subscribed clients. The storefront
-- watches the catalog so stock and prices update live; the admin dashboard can
-- watch orders and reviews so new orders arrive without a refresh.
--
-- WHY PUBLISHING `orders` IS NOT A PII LEAK, and what it depends on:
--
--   Realtime enforces ROW LEVEL SECURITY on `postgres_changes`. Before a change
--   is delivered, it is re-checked against the subscriber's policies, so the
--   anon key receives nothing from `orders` — there is no select policy that
--   grants it. Only an admin, or the customer who owns the row, is ever sent
--   one.
--
--   That means the safety of this section rests ENTIRELY on the policies above
--   being correct. Adding a permissive select policy to `orders` would not just
--   expose it to queries, it would start broadcasting customer names, phone
--   numbers and addresses to every subscriber. Treat any change to an `orders`
--   or `reviews` policy as a security change (requirements section 17).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.product_sizes;
alter publication supabase_realtime add table public.product_images;
alter publication supabase_realtime add table public.settings;
alter publication supabase_realtime add table public.reviews;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;

-- Realtime needs the FULL old row to evaluate a policy when a row is updated or
-- deleted; the default (primary key only) is not enough to decide whether a
-- subscriber was allowed to see the row as it was.
alter table public.categories     replica identity full;
alter table public.products       replica identity full;
alter table public.product_sizes  replica identity full;
alter table public.product_images replica identity full;
alter table public.settings       replica identity full;
alter table public.reviews        replica identity full;
alter table public.orders         replica identity full;
alter table public.order_items    replica identity full;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
