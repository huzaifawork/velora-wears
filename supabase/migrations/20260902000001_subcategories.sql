-- ===========================================================================
-- Subcategories (§5, §8) — one level of nesting under a category
-- ===========================================================================
--
-- The catalog has been flat since `20260829000001_init.sql`: a product names a
-- category and a category names nothing. The client wants "Shirts" to be able
-- to hold "Oversized shirts" and "Oxford shirts" without either of them
-- becoming a top-level heading in the shop's navigation.
--
-- THIS IS ADDITIVE AND CHANGES NOTHING THAT EXISTS. `parent_slug` is nullable
-- and every row already in the table gets `null`, which means "top level" —
-- exactly what every category is today. A storefront or dashboard that has not
-- been updated reads the same rows it always read.
--
-- ---------------------------------------------------------------------------
-- WHY A SELF-REFERENCE AND NOT A SECOND TABLE
-- ---------------------------------------------------------------------------
-- A `subcategories` table would have duplicated every column `categories`
-- already has — name, slug, thumb, description, sort_order, active — and then
-- forced `products` to carry two nullable foreign keys, one of which must be
-- null. Every read in both applications would have had to union two tables to
-- answer "what category is this product in".
--
-- A parent pointer keeps ONE table, ONE primary key and ONE `products
-- .category_slug`, so a product in a subcategory is stored and read exactly
-- like a product in a category. Nothing downstream of `category_slug` changes.
--
-- ---------------------------------------------------------------------------
-- EXACTLY ONE LEVEL DEEP
-- ---------------------------------------------------------------------------
-- Enforced by a trigger below, not left to the dashboard. Arbitrary depth would
-- mean recursive reads on every surface that draws the navigation, breadcrumbs
-- that can be any length, and a product filter that has to walk a tree the
-- browser has not necessarily loaded. Two levels is what the shop is asking
-- for, and a constraint is what keeps a future screen from quietly creating a
-- third.

alter table public.categories
  add column if not exists parent_slug text
    references public.categories (slug)
    on update cascade
    on delete restrict;

comment on column public.categories.parent_slug is
  'The category this one sits under, or null for a top-level category. '
  'Exactly one level deep — see categories_enforce_one_level().';

-- A category cannot be its own parent. The trigger below catches this too, but
-- a check constraint states it in the schema itself and costs nothing.
alter table public.categories
  drop constraint if exists categories_parent_not_self;
alter table public.categories
  add constraint categories_parent_not_self
  check (parent_slug is null or parent_slug <> slug);

-- Refuses anything deeper than parent -> child.
--
-- Two ways a third level could appear, and both are closed here:
--   1. giving a category a parent that ALREADY has a parent;
--   2. giving a parent to a category that already HAS children.
--
-- Raised as a plain message rather than a constraint violation, because the
-- dashboard shows it to a person (`admin/src/lib/errors.ts`).
--
-- `update of slug, parent_slug` keeps it off the writes that cannot break the
-- rule: reordering and hiding a category touch neither column.
create or replace function public.categories_enforce_one_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_slug is null then
    return new;
  end if;

  if new.parent_slug = new.slug then
    raise exception 'A category cannot be inside itself.';
  end if;

  if exists (
    select 1 from public.categories c
    where c.slug = new.parent_slug and c.parent_slug is not null
  ) then
    raise exception
      'Subcategories are one level deep: "%" is already a subcategory.',
      new.parent_slug;
  end if;

  if exists (
    select 1 from public.categories c
    where c.parent_slug = new.slug
  ) then
    raise exception
      'Subcategories are one level deep: "%" already has subcategories of its own.',
      new.slug;
  end if;

  return new;
end;
$$;

drop trigger if exists categories_one_level on public.categories;
create trigger categories_one_level
  before insert or update of slug, parent_slug on public.categories
  for each row execute function public.categories_enforce_one_level();

-- The storefront and the dashboard both read "the children of X" and "the
-- top-level categories", which are the two shapes this index serves. §19 is
-- unconditional about indexing a filtered column, even on a table this small.
create index if not exists categories_parent
  on public.categories (parent_slug, sort_order);
