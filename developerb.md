# Admin Dashboard — everything you need

**Start here.** This is the onboarding doc for the admin dashboard (requirements section 8) —
written 2026-08-29, once the storefront (sections 1-17, plus the ongoing sections 18-19) was
done and deployed. `admin/README.md` is a shorter pointer into the same material; this file is
the full version. Read this whole file before writing any code.

**Contact:** wearvelora84@gmail.com. Anything here that's unclear, or any change you need to
`shared/types.ts` or `supabase/migrations/` — those are a joint contract (section 20), not
yours to change alone — reach out before assuming.

---

## 1. What this project is

**Velora Wears** — a Pakistani fashion e-commerce store. Two developers, one repository, one
Supabase database:

- **Developer A** built the storefront (`storefront/`) — the customer-facing site. **Done**,
  requirements sections 1-17, live at <https://velora-wears.vercel.app>.
- **You (Developer B)** build the admin dashboard (`admin/`) — requirements section 8. Nothing
  in it exists yet beyond a placeholder README. **This is the one thing left to build for the
  project to be feature-complete.**

You are not starting from nothing, though. The database schema, its row-level security, and a
real amount of admin-specific groundwork are already live and waiting — see section 3 below.

### Read, in this order

1. This file.
2. [`Requirements.md`](Requirements.md) sections 8, 10, 11, 16 ("Admin" subsection), 18, 19,
   20 — quoted in full in section 5 below, so you don't strictly have to jump over, but the
   surrounding context (why each rule exists) is there.
3. [`supabase/migrations/`](supabase/migrations/) — the database, in full. This is the
   authority on what exists; nothing here summarises it away.
4. [`shared/types.ts`](shared/types.ts) — the shape the two applications pass around.
5. `context.md` — the storefront's build log. You don't need to read it end to end, but it's
   where "why does this column exist" and "what did Developer A already tell me about this"
   both live, chronologically. Search it for your own name if you want the short version.

---

## 2. Architecture — why there's a database you can just... use

The storefront is a browser SPA and cannot hold Supabase's **service role key** (it bypasses
row-level security entirely). The admin dashboard has the identical constraint if it's also a
browser app: **never put the service role key in a browser bundle**, admin dashboard included.

Instead, the dashboard authenticates real people with **Supabase Auth**, and every table's
row-level security is written around one function:

```sql
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
```

Every admin-facing policy in the schema calls `is_admin()`. A signed-in Supabase Auth user
whose `id` exists in the `admins` table can read and write everything the dashboard needs,
through the ordinary anon/authenticated Supabase client — **no service role key, no server
of your own, required for CRUD.** (Order *placement* is the one exception — see section 4.)

```
Admin's browser (whatever framework you choose)
   |
   +-- supabase-js, signs in via Supabase Auth
   |     the signed-in user's id must be in `admins` (see section 6 to add yourself)
   |
   +-- supabase-js, authenticated client --read/write--> Postgres (via PostgREST)
   |     RLS policies check is_admin() and allow full CRUD on products,
   |     categories, product_sizes, product_images, settings, settings_private,
   |     reviews (including hidden), and read + status-update on orders
   |
   +-- supabase-js Realtime  <--WebSocket-- Realtime server
         subscribe to `postgres_changes` on `orders` to see new orders arrive
         without polling. RLS is re-checked per subscriber (safe).
```

You do **not** need an Edge Function to build the dashboard's CRUD. You would need one only if
you add something that must run with elevated privilege beyond what `is_admin()`'s RLS grants
— nothing in section 8 currently requires that.

---

## 3. What already exists, ready for you to use

This is the part worth reading closely — several things that would normally be your work are
already done, because the storefront's own build touched them first.

- **`is_admin()` and the `admins` table** — see section 2. Add yourself with one `insert` (see
  section 6).
- **`product_summaries` is a database VIEW**, not a table you write to. `in_stock` /
  `low_stock` / `total_stock` are summed live from `product_sizes`; `rating_avg` /
  `rating_count` are averaged live from non-hidden `reviews`; `thumb` is the first
  `product_images` row by position. **You write `products`, `product_sizes`, `product_images`
  and `reviews`; the summary follows on its own.** There is nothing to keep in sync and no
  "recompute" step to remember. (This was a real, easy-to-forget obligation on the old Firebase
  design — it no longer exists.)
- **`categories.productCount` is computed live, the same way** — a related-row count in the
  same query that reads `categories`, not a stored column. Nothing to update when a product is
  created, retired or recategorised.
- **Review moderation's database half is done.** `reviews.hidden` exists, defaults to `false`,
  and `"visible reviews are public"` already excludes any hidden review from every public read
  the storefront makes. `"admins manage reviews"` already grants you full `select`/`update`/
  `delete` via `is_admin()`. **The only thing missing is the UI control that flips
  `hidden` to `true`** — requirements section 16's "Admin" subsection, and the one specific
  item this whole project still owes the client.
- **`orders.payment_method`** exists (`enum ('cod')`, more values addable later via `alter
  type ... add value` if the client ever wants a second payment method — nothing currently
  asks for one). Read it rather than hardcoding "Cash on delivery" in the order list.
- **Delivery-charge configuration already has a home.** `settings` (one row, `id boolean
  primary key default true`) holds `delivery_charge`, `free_delivery_threshold`,
  `low_stock_threshold`, `store_announcement` — all of it public-readable and
  `is_admin()`-writable already. Section 10's whole ask ("the admin should be able to configure
  and update [delivery charges]") is a form over this one row.
- **Two image variants are already the contract, not a suggestion.** `product_images` has
  separate `thumb_url` and `full_url` columns. The storefront's cards and grids read only
  `thumb_url`; the product detail gallery reads `full_url`. **If you upload only one size, the
  product grid will download full-resolution images on every page** — this is requirements
  section 19's single most concrete ask of you.
- **Supabase Storage is available** for the images themselves (not used by the storefront yet
  — its own product images are committed demo placeholders — but it's the natural place for
  real uploads; nothing about the schema assumes otherwise, `thumb_url`/`full_url` are just
  `text`).
- **Every table is published to Realtime.** Subscribe to `orders` (or anything else) for live
  updates without polling.

---

## 4. What you must NOT do

- **Never put the Supabase service role key in the admin dashboard's browser bundle**, if it's
  a browser app. It bypasses row-level security entirely.
- **Never write to `orders` directly.** There is no insert policy for anyone — orders are
  created exclusively by the storefront's `place-order` Edge Function, which recomputes every
  total from stored prices and decrements stock in one transaction (section 17: never trust a
  client-sent price or total). You have `"admins update orders"` (status changes: pending →
  confirmed → shipped → delivered → cancelled) and full read access, not insert or delete.
- **Never write to `product_summaries`.** It's a view. Write the underlying tables.
  (Attempting to `insert`/`update` it directly will simply fail — `security_invoker = on`
  means it runs with your own RLS, and there's no rule granting a write to a view with no
  underlying table of its own.)
- **Never seed mock/demo data into the live database.** The schema has been deliberately empty
  since it was created; the storefront's placeholder catalog lives in its own frontend
  (`storefront/src/lib/demoData.ts`) and is never written to Postgres. The **first real
  products you create in the dashboard are what flips the storefront over to live data** — see
  section 7.
- **Never change a row-level security policy on `orders` or `reviews` without treating it as a
  security change**, not a query tweak — both tables hold customer PII or provenance data.
- **Never edit the schema through the Supabase dashboard UI.** Every schema change is a
  migration file under `supabase/migrations/`, committed to the repo, applied via the
  Management API (ask Developer A for `SUPABASE_ACCESS_TOKEN` if you need to apply one, or
  coordinate so it's applied once). An undocumented dashboard-UI change is invisible to the
  other developer and to git history.

---

## 5. Requirements — quoted in full

### Section 8 — Admin Dashboard (the whole of the original brief)

> The Admin Dashboard requirements will be provided separately. For now, the main requirement
> is that every confirmed customer order should be stored and visible in the Admin Dashboard
> for order management.

(That "provided separately" spec has not arrived as of this writing. Build against sections 10,
11, 16 and 19 below plus what's described in section 3 — that is the concrete, actionable
scope today. If a fuller section-8 spec arrives later, it supersedes nothing here; it adds to
it.)

### Section 10 — Delivery Charges (your part of it)

> The delivery charges should be manageable from the Admin Dashboard, allowing the admin to
> configure and update them as required. The configured delivery charges should automatically
> appear during checkout and be properly included in the customer's total order amount.

Already wired end to end on the storefront side — write to `settings.delivery_charge` /
`free_delivery_threshold` and it's live everywhere (the bag, checkout, the order total) with no
further coordination needed.

### Section 11 — Product Quantity, Stock, and Availability (your part of it)

> Each product should support inventory and stock management. The website should properly
> display product availability and stock status... If a product or a specific size is out of
> stock, the user should be clearly informed and should not be able to purchase that
> unavailable option. Stock availability should also work correctly based on different product
> sizes where applicable.

You own **writing** stock (`product_sizes.stock`, per size — S/M/L). The storefront already
owns reading and displaying it correctly (badges, per-size gating, the "Only N left" copy) —
nothing further needed from you there beyond keeping the numbers honest.

### Section 16 — "Admin" subsection (the one item that's actually yours from that section)

> All reviews should be visible in the Admin Dashboard. The admin should be able to hide or
> remove a review that is abusive or spam.

Everything else in requirements section 16 (writing, editing, guest verification, rate
limiting) is the storefront's and is done. This one line is yours: a list of reviews (`select *
from reviews` — RLS lets an admin see hidden ones too, unlike the public read) with a control
that sets `hidden = true` (or a hard `delete`, your call — the policy permits both).

### Section 18 — Technical Stack and Architecture (the parts that bind you)

> The project uses Supabase — Postgres, with Supabase Realtime and Edge Functions... Both the
> storefront and the admin dashboard read and write the same database. The schema, its row
> level security policies, and the place_order function are version-controlled under
> supabase/migrations/; a change there is a change for both developers and must be agreed
> between them.

> The UI must be built from reusable components. Writing the same markup or logic again in a
> different file is not acceptable.

Your framework choice is yours — nothing requires React/Vite for the admin dashboard the way
it's a firm requirement for the storefront (section 18 states that requirement for the
storefront specifically). Whatever you choose, don't duplicate the schema's rules in your own
UI code without a shared source, the same discipline `shared/checkout.ts` /
`shared/payment.ts` / `shared/stock.ts` / `shared/reviews.ts` hold the storefront to.

### Section 19 — Performance and Query Optimisation (the parts that bind you)

> **Every query must be indexed.** Any column used for filtering or ordering needs an index in
> the migration that introduces the query. Without one, Postgres scans the whole table.
>
> **The admin dashboard must write both image variants** (`thumb_url` and `full_url`) when
> uploading product images.

If you add a new filter or sort in the dashboard itself (e.g., "orders by status," which
already has `orders_status (status, created_at desc)`), check `supabase/migrations/` for an
existing index before adding a new query against a column that doesn't have one.

### Section 20 — Team, Ownership, and Responsibilities (the whole thing)

> Two developers work on this project, sharing one repository and one database.
>
> | Area | Owner |
> | --- | --- |
> | Storefront (React + Vite) — sections 1-7, 9-19 | Developer A |
> | **Admin Dashboard — section 8** | **Developer B** |
> | Cloud Functions / order placement | Developer A |
> | Database rules and indexes | Both, agreed jointly |
> | `shared/types.ts` data contract | Both, agreed jointly |
>
> Because the two applications share one database, the boundary between them must be explicit:
> `shared/types.ts` is the single source of truth for the shape of data as the applications
> use it, and `supabase/migrations/` is the source of truth for the database itself. Neither
> developer may change either unilaterally — a change is a breaking change for the other side.

---

## 6. Supabase — the live project

| | |
| --- | --- |
| Project name | `VeloraWears` |
| Project ref | `owbnbzutqslihhnzdnyo` |
| Region | `ap-south-1` (Mumbai) |
| API URL | `https://owbnbzutqslihhnzdnyo.supabase.co` |
| Postgres | 17 |
| Dashboard | <https://supabase.com/dashboard/project/owbnbzutqslihhnzdnyo> |

> **There is a second, unrelated project on this account (`glow-plus-prod`). Never touch it.**
> If you ever run a CLI command against this project, pass `--project-ref owbnbzutqslihhnzdnyo`
> explicitly.

**No credential is committed anywhere in this repository — the repo is public.** Ask Developer
A (wearvelora84@gmail.com) for:

- The **anon key** (Project Settings → API) — public by design, safe in a browser bundle,
  security comes from RLS, not from hiding this key.
- Whether you're added as a **Supabase Auth user** directly, or you sign up through whatever
  auth flow your dashboard implements and Developer A (or you, with `SUPABASE_ACCESS_TOKEN`)
  runs:
  ```sql
  insert into public.admins (user_id, email)
  values ('<your-uuid-from-auth.users>', 'you@example.com');
  ```
  Nothing you build works until your account exists in `admins` — every write and every
  admin-only read is gated on `is_admin()`.
- **You do not need the service role key** for anything described in this document. If you
  find yourself thinking you do, stop and ask first — it very likely means the right answer is
  an RLS policy change (agreed jointly, section 20) rather than a privileged key in a browser.

### Migrations applied so far (all under `supabase/migrations/`)

| File | What it did | Applied? |
| --- | --- | --- |
| `20260829000001_init.sql` | Full schema: 10 tables, RLS on all of them, `is_admin()` | Yes |
| `20260829000002_place_order.sql` | Superseded — see the note at its own top | Yes (then superseded) |
| `20260829000003_payment_method.sql` | `payment_method` enum + column, `place_order()` restated | Yes |
| `20260829000004_reviews.sql` | `reviews.updated_at`, `find_order_for_review()` | Yes |
| `20260829000005_rate_limits.sql` | Rate limiting on the storefront's two write Edge Functions | Yes |
| `20260829000006_orders_user_index.sql` | Index behind the storefront's order-history read | **Not yet** — written, pending `SUPABASE_ACCESS_TOKEN` |

If you write a migration of your own, number it `20260829NNNNNN_description.sql` (or the
current date) continuing the sequence, and coordinate applying it the same way — see section 4
of `context.md` for the exact Management API command used for every migration so far.

---

## 7. The one thing that unblocks the storefront's checkout

**Checkout on the live storefront cannot complete an order yet — deliberately, and it's
waiting on you.** The storefront reads a placeholder catalog (`VITE_DATA_SOURCE=demo`) because
the real `products` table is empty. `place_order()` refuses every order whose product ids don't
exist in the database, and the checkout page says so on screen.

**The moment you create real products** (with real `product_sizes` stock and both image
variants) **and Developer A flips `VITE_DATA_SOURCE` to `supabase`, the storefront starts
taking real orders.** This is the single highest-leverage thing you can ship first — everything
else in section 8 (order management, review moderation) only has real data to act on once
products exist.

---

## 8. Database schema — table by table

Full detail is in `supabase/migrations/20260829000001_init.sql` (and the three that amend it);
this is the summary.

```
categories          slug (PK), name, sort_order, thumb, description, created_at
                     RLS: public read. You: full read/write via is_admin().

products             id (PK), slug (unique), name, description, price, category_slug (FK),
                      active, search_text (GENERATED — trigram indexed, do not write it),
                      created_at, updated_at
                      RLS: public reads active=true rows only. You: read every row
                      ("admins see every product") and full write, via is_admin().

product_sizes         (product_id, size) composite PK, stock
                      size is the enum public.product_size — S / M / L only.
                      RLS: public read. You: full write via is_admin().

product_images        id (PK), product_id (FK), position, thumb_url, full_url, alt,
                      width, height
                      RLS: public read. You: full write via is_admin().
                      Write BOTH url columns (section 19) and position them in display order.

settings              ONE row (id boolean PK default true) — delivery_charge,
                      free_delivery_threshold, low_stock_threshold, store_announcement
                      RLS: public read. You: write via is_admin(). Never insert a second
                      row — the id column's check constraint (id must be true) prevents it.

settings_private       ONE row — currently just notify_email
                      RLS: is_admin() only, no public read at all.

orders                id, order_number (unique), status (enum: pending/confirmed/shipped/
                      delivered/cancelled), full_name, email, phone, address, city,
                      postal_code, notes, subtotal, delivery_charge, total, payment_method,
                      is_guest, user_id, review_token, created_at, updated_at
                      RLS: a signed-in customer reads their OWN orders (user_id = auth.uid());
                      you read EVERY order and UPDATE (status only, by convention — nothing
                      stops you writing other columns via RLS, but recomputing money that
                      place_order() already computed correctly is not your job); nobody can
                      insert except the place-order Edge Function (service role, bypasses RLS).

order_items            id, order_id (FK), product_id (FK), name, slug, thumb, size, qty,
                      unit_price
                      A SNAPSHOT of what was actually bought, at the price actually paid —
                      renaming or repricing a product later does not change historical orders.
                      RLS: same shape as orders (own rows for a customer, everything for you).

reviews                id, product_id (FK), order_id (FK, nullable), rating (1-5), comment,
                      display_name, verified_purchase, hidden, user_id, created_at, updated_at
                      unique (order_id, product_id) — one review per product per order.
                      RLS: public reads non-hidden rows; you read/write/delete everything via
                      is_admin(). WRITTEN by customers only through the storefront's
                      submit-review Edge Function — you never need to insert one, only
                      moderate (hidden) or delete.

admins                 user_id (PK, FK auth.users), email, created_at
                      RLS: you can read the list (to see fellow admins); nobody can self-
                      insert — Developer A or a session with SUPABASE_ACCESS_TOKEN adds rows.

rate_limits            internal to the storefront's two Edge Functions. Not yours to read or
                      write; RLS has no policies for it at all (closed to every client).

product_summaries      *** A VIEW, not a table *** — see section 3. Read it for a fast list
                      view (name, slug, price, category, thumb, in_stock, low_stock,
                      total_stock, rating_avg, rating_count) if your product list benefits
                      from it the same way the storefront's grid does; write the underlying
                      tables, never this.
```

### Two functions worth knowing about (you won't call either, but they explain behaviour)

- **`place_order(p_items, p_customer, p_user_id default null)`** — `SECURITY DEFINER`,
  recomputes every price and the delivery charge server-side, re-checks and decrements stock,
  writes the order and its items in one transaction. This is what the storefront's checkout
  calls (via the `place-order` Edge Function). You never call this directly.
- **`find_order_for_review(order_number, email)`** — lets a guest with no session prove they
  own an order, for the storefront's review flow. Not relevant to the dashboard.

---

## 9. The shared contract — `shared/types.ts` and friends

`shared/types.ts` is the TypeScript shape both applications should agree on if your dashboard
is also TypeScript. If it isn't, the same *shape* still applies — read it as a spec, not
literal code to import.

**Two mapping gotchas that will bite you if missed:**

1. **snake_case in Postgres, camelCase in `shared/types.ts`.** The storefront's own mapping
   layer (`storefront/src/lib/sources/supabaseSource.ts`) is the reference for exactly which
   Postgres column maps to which TS field, if you want a second example beyond the schema
   above.
2. **Timestamps are ISO strings in Postgres, epoch milliseconds in `shared/types.ts`.** Convert
   at your own boundary the same way (`new Date(iso).getTime()`).

Also relevant, all under `shared/`:

- **`shared/payment.ts`** — the `PaymentMethod` union (`'cod'` today) and the human-readable
  label for each. Read the order's `payment_method` through this rather than hardcoding
  "Cash on delivery" in your order list, so a second payment method (if the client ever wants
  one — see section 9 of `Requirements.md`, "may be added... if required") does not mean
  hunting down every hardcoded string.
- **`shared/stock.ts`** — `stockLevel()`, the ONE definition of "low stock" vs "out of stock"
  vs "in stock" (a real bug in an earlier storefront build had three different definitions of
  "low" across three files — this file exists specifically so that never happens again). If
  your dashboard shows a stock-level badge anywhere, use this rather than reimplementing the
  comparison.
- **`shared/checkout.ts`** / **`shared/reviews.ts`** — the storefront's own validation rules.
  Not directly relevant to admin CRUD, but useful if you ever render a customer's submitted
  data and want to know what shape it's guaranteed to already be in.

---

## 10. Deployment

The storefront deploys from the repo root via Vercel (root directory = repo root, not
`storefront/`, since it's an npm workspace) — see `context.md` section 10 for the exact
config. **The admin dashboard is not part of that Vercel project** and needs its own deployment
decision: a second Vercel project pointed at `admin/`, a different host entirely, whatever
fits your framework. Coordinate the URL with Developer A once you have one, the same way
`velora-wears.vercel.app` is the one link the client was given for the storefront.

Whatever you deploy to, you'll need at minimum:

- The Supabase URL and anon key (public by design — safe as build-time env vars, the same way
  the storefront's `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are).
- Nothing else secret is required for the CRUD described in this document (section 4).

---

## 11. Conventions worth carrying over

Not binding on your framework choice, but these are the storefront's house rules and following
them keeps the two halves of the project legible to each other:

- **No hardcoded colours, no duplicated markup.** The storefront's design tokens
  (`storefront/src/index.css`) are its own — you don't have to reuse them (there's no shared
  design system contract), but pick your own tokens once and reference them, rather than
  scattering literal hex values through components (requirements section 18).
- **Every new filter or sort column needs an index, in the same migration that introduces it**
  (requirements section 19) — this one IS binding, since it's about the shared schema.
- **Schema changes are migrations, always, never the dashboard UI** (section 4 above).
- **Never seed mock data into the live database** (section 4 above) — the emptiness is
  deliberate and load-bearing (it's how RLS was verified without any real customer data ever
  touching the database).
