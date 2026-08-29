# Admin Dashboard

**Owned by the second developer** (Huzaifa's friend). Not built by the storefront developer.

This folder is a placeholder so the dashboard can live in the same repository as the
storefront, sharing one **Supabase** database.

> **Changed 2026-08-29:** this project has migrated from the Firebase Realtime Database to
> **Supabase** (Postgres + Realtime + Edge Functions). The Firebase project has been deleted.
> If you started against the Firebase design, read this whole file again — one of your
> obligations has been removed entirely.

## Before writing any code, read

- [`../supabase/migrations/`](../supabase/migrations/) — **the database**. Tables, row level
  security policies, and `place_order()`. This is the authority on what exists.
- [`../shared/types.ts`](../shared/types.ts) — the shape the applications pass around.
- [`../Requirements.md`](../Requirements.md) sections 8, 10, 11, 18, 19, and 20.

## What the dashboard is responsible for

- Managing products, categories, images, and per-size stock (§11).
- Viewing and managing confirmed orders (§8).
- Configuring delivery charges, which flow into checkout totals (§10).
- Moderating customer reviews — set `reviews.hidden` (§16).

## What changed in your favour

**You no longer have to keep a summary record in sync.** Under Firebase there was a
`productSummaries` node that had to be rewritten on every product edit, and a missed write
showed customers the wrong price.

`product_summaries` is now a **database VIEW**. Postgres computes it:

- `in_stock` / `low_stock` / `total_stock` — summed from `product_sizes`
- `rating_avg` / `rating_count` — averaged from visible `reviews`
- `thumb` — the first `product_images` row by position

Write the product; the summary follows. There is nothing to keep in sync and nothing to
forget. `categories.productCount` is likewise counted live, not stored.

## What is still your obligation

1. **Write both image variants.** Every product image needs a small `thumb_url` for cards
   and a `full_url` for the detail gallery (§19). Uploading only a full-size image makes the
   product grid slow on mobile.
2. **Add an index in the same migration as any new filter or sort.**
3. **Never edit the schema through the dashboard UI.** Schema changes are migrations,
   committed under `supabase/migrations/`, or the next person will not know they happened.

## Access

Row level security denies client writes by default. The dashboard authenticates with
**Supabase Auth**, and the signed-in user's id must exist in the `admins` table:

```sql
insert into public.admins (user_id, email)
values ('<the-uuid-from-auth.users>', 'admin@example.com');
```

Every admin policy calls `is_admin()`, which checks that table.

## Orders are read-only to you, and written only by the server

`orders` has **no insert policy for anyone**. Orders are created solely by the `place-order`
Edge Function, which recomputes every total from stored prices and decrements stock in one
transaction (§17). You can read orders and update their `status`; you cannot create one, and
you must not change the money on one.

## Realtime

Every table is published to Supabase Realtime, so the dashboard can subscribe to
`postgres_changes` on `orders` and see new orders arrive without polling. Realtime re-checks
row level security per subscriber, so this is safe — but it means **any change you make to a
policy on `orders` or `reviews` is a security change**, not just a query change.
