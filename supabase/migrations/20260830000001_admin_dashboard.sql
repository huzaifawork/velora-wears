-- ---------------------------------------------------------------------------
-- Velora Wears — the ADMIN DASHBOARD's schema additions (requirements §8).
--
-- Written 2026-08-30, alongside `admin/`. Everything section 8 asks for that
-- the schema could ALREADY answer was left alone — delivery charges are a form
-- over `settings`, per-size stock is `product_sizes`, review moderation is
-- `reviews.hidden`, order management is `orders.status`. None of that is
-- touched here.
--
-- Three things section 8 asks for that the schema could NOT answer, and this
-- migration adds:
--
--   1. WHICH products are featured on the landing page. The storefront's
--      featured strip has always been "the eight newest products" — a rule the
--      admin cannot change. Section 8 wants the admin choosing, and choosing
--      the ORDER.
--   2. WHICH images appear in the hero and the promotional banners. Both were
--      hardcoded file paths in the storefront's own components
--      (`features/home/Hero.tsx`, `PromoBanners.tsx`), so changing the shop
--      window meant a code deploy.
--   3. Somewhere to PUT an uploaded image. Supabase Storage was available but
--      no bucket existed and no policy allowed an admin to write one.
--
-- Plus the indexes the dashboard's own filters and sorts need (§19: "any
-- column used for filtering or ordering needs an index in the migration that
-- introduces the query"). Those are at the bottom, each with the query it
-- exists for named.
--
-- NOTHING HERE CHANGES AN EXISTING COLUMN, POLICY OR FUNCTION. Every addition
-- is additive and defaulted, so the storefront running against this schema
-- before its own code is updated behaves exactly as it does today.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. Featured products (§8 — "control over which products appear in the
--    Featured Products section on the landing page")
-- ===========================================================================
--
-- A flag and a position ON `products`, not a separate `featured_products`
-- table. A join table would be the right shape if a product could be featured
-- in several distinct places with different ordering in each; it can be
-- featured in exactly one strip, so a second table would buy nothing and cost
-- every read a join — including `product_summaries`, which every grid in the
-- shop reads.
--
-- `featured_position` is a plain integer with no unique constraint,
-- deliberately. Reordering a list under a unique constraint means either a
-- temporary negative-number shuffle or deferred constraints; ties simply fall
-- back to `created_at`, which is what the ordering below does.

alter table public.products
  add column if not exists featured boolean not null default false,
  add column if not exists featured_position integer not null default 0;

comment on column public.products.featured is
  'Shown in the landing page featured strip. Set from the admin dashboard (§8).';
comment on column public.products.featured_position is
  'Ascending display order within the featured strip. Ties break on created_at desc.';

-- The landing strip's exact read: featured + active, ordered by position.
-- Partial, because the overwhelming majority of rows are not featured and
-- indexing them would only make the index bigger without answering anything.
create index if not exists products_featured
  on public.products (featured_position, created_at desc)
  where featured and active;


-- ---------------------------------------------------------------------------
-- product_summaries, RESTATED to carry the two new columns.
--
-- `create or replace view` may APPEND columns but may not rename, reorder or
-- retype the existing ones — so the select list below is character-for-character
-- the one from 20260829000001_init.sql with two lines added at the end. Read a
-- diff of this against that file before editing it.
--
-- `security_invoker = on` is restated because the option belongs to the
-- CREATE, not to the view's identity: leaving it off here would silently hand
-- the view its owner's privileges and turn it into a way around row level
-- security on `products`.
-- ---------------------------------------------------------------------------

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
  -- Appended 2026-08-30. Everything above this line is unchanged.
  p.featured,
  p.featured_position
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
-- 1b. Categories can be retired (§8 — "activate/deactivate categories")
-- ===========================================================================
--
-- `products.active` has always existed and `categories` had no equivalent, so
-- a category could only be deleted — and deleting one is blocked by
-- `products.category_slug`'s `on delete restrict` until every product in it has
-- been moved. "Winter collection, back in October" had no way to be expressed.
--
-- THIS CHANGES A PUBLIC READ POLICY, which is worth stating plainly rather than
-- burying: `"catalog is public"` selected every category unconditionally and now
-- selects only the active ones. Every existing row defaults to `active = true`,
-- so nothing that is live today changes — but a category deactivated from the
-- dashboard genuinely disappears from the storefront's category navigation,
-- which is the point.
--
-- Deactivating a category does NOT deactivate the products inside it. A product
-- has its own `active` flag and its own detail page, and silently retiring a
-- dozen products because a nav heading was hidden would be a much larger action
-- than the one the admin took. The dashboard says so at the point of the click.

alter table public.categories
  add column if not exists active boolean not null default true;

comment on column public.categories.active is
  'Hidden from the storefront when false. Products inside it keep their own active flag.';

drop policy if exists "catalog is public" on public.categories;
create policy "catalog is public" on public.categories for select using (active);

-- The storefront's category read is `where active order by sort_order`. The
-- table holds a handful of rows and Postgres will happily scan it, but §19 is
-- unconditional about a filtered column having an index, and an index that is
-- never chosen costs nothing on a table this size.
create index if not exists categories_active
  on public.categories (sort_order)
  where active;


-- ===========================================================================
-- 2. Site images — the hero and the promotional banners (§8)
-- ===========================================================================
--
-- The storefront's hero image and its two promo banners were literal paths
-- (`/banners/hero.webp`) inside the components that render them, with the
-- headline and call to action written beside them. That is correct for a shop
-- whose marketing never changes and wrong for one whose admin was promised
-- control of it.
--
-- ONE table for both slots rather than `hero_images` and `promo_banners`. The
-- two carry identical columns — an image in two variants, optional copy, an
-- optional link, a position and an active flag — and the landing page reads
-- them in ONE request and splits by slot, rather than paying two round trips
-- for two tables that differ only by a word.
--
-- The copy columns are all NULLABLE and every one of them is optional in the
-- storefront: a row with only an image renders the component's own default
-- copy. An admin who wants to swap the hero photograph and nothing else
-- uploads an image and is done.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'site_image_slot') then
    create type public.site_image_slot as enum ('hero', 'promo');
  end if;
end
$$;

create table if not exists public.site_images (
  id uuid primary key default gen_random_uuid(),
  slot public.site_image_slot not null,

  -- Both variants, for the same reason `product_images` has both (§19): the
  -- admin dashboard's own grid must never download a 1600px hero to draw a
  -- 120px card.
  thumb_url text not null,
  full_url text not null,

  alt text,
  width integer,
  height integer,

  -- Optional editorial copy. All null => the storefront renders its defaults.
  eyebrow text,
  title text,
  body text,
  cta_label text,
  cta_href text,

  position integer not null default 0,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.site_images is
  'Admin-managed landing page imagery: the hero and the promotional banners (§8).';

-- The storefront's only read of this table: active rows, ordered for display.
create index if not exists site_images_slot
  on public.site_images (slot, position)
  where active;

-- The dashboard lists every row including the inactive ones.
create index if not exists site_images_admin
  on public.site_images (slot, position, created_at);

drop trigger if exists site_images_touch on public.site_images;
create trigger site_images_touch before update on public.site_images
  for each row execute function public.touch_updated_at();

alter table public.site_images enable row level security;

-- Same shape as every other catalog table: the shop window is public, and only
-- an admin changes it.
drop policy if exists "active site images are public" on public.site_images;
create policy "active site images are public" on public.site_images for select
  using (active);

drop policy if exists "admins see every site image" on public.site_images;
create policy "admins see every site image" on public.site_images for select
  using (public.is_admin());

drop policy if exists "admins manage site images" on public.site_images;
create policy "admins manage site images" on public.site_images for all
  using (public.is_admin()) with check (public.is_admin());

-- Published like every other table, so the storefront's existing catalog
-- channel can invalidate on a banner change without polling. `replica identity
-- full` is what lets Realtime evaluate the select policy against the OLD row on
-- an update or delete — see the note in 20260829000001_init.sql.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'site_images'
  ) then
    alter publication supabase_realtime add table public.site_images;
  end if;
end
$$;

alter table public.site_images replica identity full;


-- ===========================================================================
-- 3. Supabase Storage — where an uploaded image actually goes
-- ===========================================================================
--
-- ONE public bucket, `media`, with the two variants of every image written
-- side by side under a path that says what they belong to:
--
--   products/<product-id>/<uuid>-thumb.webp
--   products/<product-id>/<uuid>-full.webp
--   site/<slot>/<uuid>-thumb.webp
--   site/<slot>/<uuid>-full.webp
--
-- PUBLIC, because every one of these images is already on a public web page —
-- a signed URL would expire, defeat the CDN cache, and protect nothing. What is
-- NOT public is writing: the policies below gate insert, update and delete on
-- `is_admin()`, the same function every other admin policy calls, so a customer
-- holding the anon key can read the shop's images and upload nothing.
--
-- The size and MIME limits are enforced by the bucket itself, not by the
-- browser. The dashboard also compresses and resizes before upload (§18), but
-- a client-side limit is not a limit — the same reasoning as the rate limits in
-- 20260829000005.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true,
  5242880,  -- 5 MB. The dashboard's own encoder lands a full-size WebP under 400 KB.
  array['image/webp', 'image/jpeg', 'image/png', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media is publicly readable" on storage.objects;
create policy "media is publicly readable" on storage.objects for select
  using (bucket_id = 'media');

drop policy if exists "admins upload media" on storage.objects;
create policy "admins upload media" on storage.objects for insert
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "admins replace media" on storage.objects;
create policy "admins replace media" on storage.objects for update
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "admins delete media" on storage.objects;
create policy "admins delete media" on storage.objects for delete
  using (bucket_id = 'media' and public.is_admin());


-- ===========================================================================
-- 4. Indexes for the dashboard's own filters and sorts (§19)
-- ===========================================================================
--
-- Requirements section 19: "Any column used for filtering or ordering needs an
-- index in the migration that introduces the query." Every index below names
-- the dashboard query it exists for. The storefront's existing indexes are
-- mostly PARTIAL (`where active`) because a customer only ever sees active
-- products — the dashboard sees every row, so those indexes cannot answer its
-- queries and it needs its own.

-- admin/src/services/products.ts — the default product list, newest first,
-- including retired products.
create index if not exists products_admin_created
  on public.products (created_at desc);

-- ...the same list filtered to one category.
create index if not exists products_admin_category
  on public.products (category_slug, created_at desc);

-- ...sorted by price (both directions use the same index).
create index if not exists products_admin_price
  on public.products (price);

-- ---------------------------------------------------------------------------
-- Order search (§8: "search by order ID, customer name, phone/email").
--
-- GENERATED, exactly like `products.search_text`, so it can never disagree with
-- the row it describes and no application code has to remember to write it.
-- A trigram index makes the substring match fast, which is what an admin
-- typing half a phone number actually needs — a prefix index would not find
-- "0300-1234567" from "1234".
--
-- This column carries customer PII, and that is safe here for exactly one
-- reason: `orders` has NO public select policy, so nothing without `is_admin()`
-- or a matching `user_id` can read any column of it, this one included. If a
-- permissive select policy is ever added to `orders`, this column is part of
-- what that would expose (see the Realtime note in 0001).
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists search_text text generated always as (
    lower(
      order_number || ' ' || full_name || ' ' || email || ' ' || phone || ' ' || city
    )
  ) stored;

create index if not exists orders_search_trgm
  on public.orders using gin (search_text gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- admin_dashboard_stats — the dashboard home, in ONE round trip.
--
-- The home screen wants about fifteen numbers: products by state, orders by
-- status, revenue, revenue this month. Asked over PostgREST that is either
-- fifteen requests, or — worse, and the obvious first attempt — one request
-- that downloads every order so the browser can add the totals up. Neither is
-- acceptable under §19, and the second stops working the day the shop is busy.
--
-- Postgres can answer all of it in one statement over indexed columns, so it
-- does, and the browser makes one call.
--
-- SECURITY INVOKER (the default — deliberately NOT `security definer`). Row
-- level security therefore applies with the CALLER's own permissions: an admin
-- sees every order because `"admins read orders"` lets them, and anyone else
-- gets zeros because `orders` is invisible to them. That is the correct answer
-- for both, and it means this function cannot become a way to read aggregate
-- sales figures without being an admin.
-- ---------------------------------------------------------------------------

create or replace function public.admin_dashboard_stats()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'products', (
      select jsonb_build_object(
        'total',    count(*),
        'active',   count(*) filter (where s.active),
        'inactive', count(*) filter (where not s.active),
        'featured', count(*) filter (where s.featured),
        'outOfStock', count(*) filter (where s.active and not s.in_stock),
        'lowStock',   count(*) filter (where s.active and s.low_stock),
        'units',      coalesce(sum(s.total_stock), 0)
      )
      from public.product_summaries s
    ),
    'categories', (
      select jsonb_build_object(
        'total',  count(*),
        'active', count(*) filter (where c.active)
      )
      from public.categories c
    ),
    'reviews', (
      select jsonb_build_object(
        'total',  count(*),
        'hidden', count(*) filter (where r.hidden)
      )
      from public.reviews r
    ),
    'orders', (
      select jsonb_build_object(
        'total',     count(*),
        'pending',   count(*) filter (where o.status = 'pending'),
        'confirmed', count(*) filter (where o.status = 'confirmed'),
        'shipped',   count(*) filter (where o.status = 'shipped'),
        'delivered', count(*) filter (where o.status = 'delivered'),
        'cancelled', count(*) filter (where o.status = 'cancelled'),
        'open',      count(*) filter (where o.status in ('pending', 'confirmed', 'shipped')),
        'last30d',   count(*) filter (where o.created_at >= now() - interval '30 days'),
        -- Revenue excludes cancelled orders. Money is a whole number of rupees
        -- (see 0001), so these sums are exact by construction.
        'revenue',        coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0),
        'revenue30d',     coalesce(sum(o.total) filter (
                            where o.status <> 'cancelled'
                              and o.created_at >= now() - interval '30 days'
                          ), 0),
        'revenueDelivered', coalesce(sum(o.total) filter (where o.status = 'delivered'), 0)
      )
      from public.orders o
    ),
    -- The last 14 days of orders, for the sparkline on the home screen. A
    -- gap-free series: a day with no orders has to be a zero, not a missing
    -- point, or the chart quietly lies about how steady the week was.
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'orders', coalesce(t.orders, 0),
        'revenue', coalesce(t.revenue, 0)
      ) order by d.day), '[]'::jsonb)
      from generate_series(
        current_date - interval '13 days', current_date, interval '1 day'
      ) as g(ts)
      cross join lateral (select g.ts::date as day) d
      left join (
        select date_trunc('day', o.created_at)::date as day,
               count(*) as orders,
               sum(o.total) as revenue
        from public.orders o
        where o.status <> 'cancelled'
          and o.created_at >= current_date - interval '13 days'
        group by 1
      ) t on t.day = d.day
    )
  );
$$;

grant execute on function public.admin_dashboard_stats() to authenticated;

-- admin/src/services/reviews.ts — moderation queue, newest first. The existing
-- `reviews_product` index is partial (`where not hidden`) and keyed by product,
-- so it cannot answer "every review, newest first" — which is the one query the
-- moderation screen makes.
create index if not exists reviews_admin_created
  on public.reviews (created_at desc);

-- ...filtered to hidden or visible.
create index if not exists reviews_admin_hidden
  on public.reviews (hidden, created_at desc);
