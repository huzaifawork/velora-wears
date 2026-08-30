# Velora Wears — Store Manager

The admin dashboard (requirements section 8). It lives here, and it is
**compiled into the storefront application** and served at **`/admin`**.

> **Read [`../developerb.md`](../developerb.md) first** if you are new to this project. It is
> the full onboarding doc — the schema, what was already built, the requirements text, and the
> rules that are not negotiable.

---

## There is one application, and one sign-in

This folder is not a separate app. It has no `package.json`, no `index.html`, no dev server
and no deployment of its own; `storefront/vite.config.ts` aliases `@admin` at `admin/src` and
`storefront/src/App.tsx` mounts `AdminApp` at `/admin`.

**That is not tidiness — it is the only way to have one login.** A Supabase session lives in
the browser's storage for ONE ORIGIN. Two deployments means two origins, which means two
sessions, which means an administrator who signs in on the shop arrives at the dashboard as a
stranger and has to sign in again. One application, one origin, one session, one form.

So there is no admin sign-in page. There is **`/account/sign-in`**, the shop's, and it is the
only one in the project:

```
                    /account/sign-in
                           │
                    signIn() succeeds
                           │
                    is_admin()  ← the same function every RLS policy calls
                     ╱           ╲
                  true           false
                   │               │
                /admin      /account (or ?next=)
```

An administrator **is a customer account** whose `profiles` row has `role = 'admin'`.
Same email, same password, same form. The only thing that differs afterwards is where they
land and what the database will let them do.

- Signed out at `/admin` → sent to the sign-in form with `?next=`, and returned here after.
- Signed in but not an admin → [`NotAnAdminPage`](src/features/auth/NotAnAdminPage.tsx),
  which points at the shop and, for someone who *should* be an admin, prints the exact SQL
  and their user id.
- Signed out anywhere → signed out of both. There was only ever one session.

**The guard decides what to render. It is not the security.** Row level security is: anyone
who defeated the client-side check would reach screens where every read returns zero rows and
every write is refused, because `is_admin()` is evaluated by Postgres (requirements §25).

### You cannot use it until your account is an admin

```sql
update public.profiles set role = 'admin' where id = '<the-uuid-from-auth.users>';
```

Sign in first; if you are not an admin the screen shows your user id with a copy button.

---

## Run it

There is nothing to run separately.

```bash
npm install
npm run dev          # http://localhost:5173 — the shop
                     # http://localhost:5173/admin — the dashboard
```

`npm run build`, `npm run typecheck` and `npm run lint` all cover this folder: the build
compiles it, `storefront/tsconfig.json` includes it, and the root `eslint.config.js` lints it.

**The shop does not pay for it.** Every `/admin` screen is lazily imported, so a customer
downloads none of it — check the chunk list after a build: `AdminApp-*.js` and one chunk per
screen, none of them in the entry bundle.

---

## Apply the migration first

This dashboard needs [`../supabase/migrations/20260830000001_admin_dashboard.sql`](../supabase/migrations/20260830000001_admin_dashboard.sql).
It is additive — nothing existing changes shape — and it adds:

- `products.featured` / `featured_position`, and `product_summaries` restated to carry them;
- `categories.active`, so a category can be retired instead of only deleted (**this narrows
  the public read policy on `categories` to active rows** — every existing row defaults to
  active, so nothing live changes);
- the `site_images` table — the landing page's hero images and promo banners;
- the **`media` Storage bucket** and the policies that let an admin write to it;
- `orders.search_text`, generated, with a trigram index, so one indexed substring match
  answers "search by order number, name, email, phone or city";
- `admin_dashboard_stats()`, which computes the whole home screen in one round trip;
- the indexes behind every filter and sort this dashboard introduces (§19).

It also needs [`../supabase/migrations/20260830000002_customer_profiles.sql`](../supabase/migrations/20260830000002_customer_profiles.sql),
which adds `public.profiles` — one row per customer account, created by a trigger on
`auth.users` at sign-up — plus the `customer_summaries` view behind the Customers screen.

Until it is applied the dashboard's screens will error, and the storefront will fall back to
its previous behaviour — deliberately: `listFeatured` and `listSiteImages` in
`storefront/src/lib/sources/supabaseSource.ts` both catch and degrade to the shop's own art,
so a landing page never breaks because a migration has not landed yet.

---

## What is in it

| Screen | Requirement |
| --- | --- |
| **Dashboard** | §8 — orders waiting, sold out, running low, revenue, the last orders, a 14-day sparkline |
| **Products** | §8, §11 — list with search / category / stock / visibility filters, sorting and pagination |
| **Product editor** | §8, §11, §19 — details, per-size stock, visibility, featured, and the gallery |
| **Categories** | §8 — create, edit, retire, reorder, tile image |
| **Inventory** | §11 — per-size stock across the live catalog, edited in place |
| **Orders** | §8 — every order, searchable across five fields; detail with the customer, lines and status |
| **Customers** | The accounts people have created, with what each has ordered and spent. Read-only |
| **Reviews** | §16 "Admin" — hide or delete an abusive or spam review |
| **Delivery & store** | §10 — delivery charge, free-delivery threshold, low-stock threshold, announcement |
| **Featured products** | §8 — choose and order the landing page strip |
| **Hero & banners** | §8 — upload the landing page's hero images and promotional banners |
| **Account** | Who is signed in, password change, who else is an admin |

---

## The rules this dashboard holds itself to

**Both image variants, always (§19).** Every upload is resized and re-encoded to WebP in the
browser and written as a small `thumb_url` and a large `full_url`. The dimensions are in
[`../shared/media.ts`](../shared/media.ts), shared with the storefront so the two cannot
disagree about how big a thumbnail is. A grid here never loads a full-size file.

**Every list is filtered, sorted and paginated by Postgres.** Nothing fetches a table and
narrows it in the browser. The row count comes back in the same request as the rows.

**No N+1 reads.** The product list reads `product_summaries`, the view that already computes
stock and the cover image. The inventory screen reads a whole page of per-size stock in one
`in (...)`. Order lines come embedded in the order's own query.

**One Realtime subscription, for orders only.** New orders arrive without a refresh. Nothing
else is subscribed to — every other change here is one the admin just made, and their own
write already invalidates the cache.

**Optimistic only where it cannot lie.** Activating a product, hiding a review, reordering a
list. Never stock, never an order's status, never money.

**The service role key is not here and cannot be.** The root ESLint config fails the build on
the name, across the shop and the dashboard alike. Everything goes through the anon client
under row level security, gated on `is_admin()`.

**Money on an order is read-only.** `place_order()` computed it server-side from stored prices
inside the transaction that decremented stock. This dashboard changes an order's `status` and
nothing else about it.

**Customer data does not outlive the session.** Signing out drops the dashboard's read cache,
which holds names, phone numbers and addresses from the orders screen — including when the
sign-out happened on the shop's side of the application.

---

## Layout

```
admin/src/
  AdminApp.tsx      the /admin routes, and the guard in front of them
  components/
    layout/         AdminLayout, Sidebar — one sidebar, two responsive layouts
    ui/             Button, Badge, Card, Field, Select, Modal, Toast, DataTable, Thumb,
                    ImageDrop, Reorder, Skeleton/EmptyState/ErrorState, Icons
  features/
    auth/           NotAnAdminPage — the only auth screen left here
    products/       ProductImages — the gallery editor
  hooks/            useQuery (cache-aware loading), useUrlState, useOrderAlerts
  lib/              supabase (re-exports the shop's client), cache, image, storage,
                    format, routes, slug, errors
  pages/            one file per screen
  services/         the data layer — one module per subject, all SQL knowledge lives here
```

Nothing above `services/` knows a column name; nothing below `services/` renders anything.

Imports inside this folder use `@admin/…`. `@/…` reaches the storefront — used in exactly
three places, all of them deliberate: the auth context, the shop's routes, and the Supabase
client. `@shared/…` is the contract both halves agree on.

---

## Design

It reuses the storefront's brand tokens — the same ink, plum, antique gold and the same two
typefaces — and adds only what a working tool needs that a shop window does not: a neutral
`--color-surface*` ground, a deeper `--color-brand-deep` for the navigation rail, an
informational status colour, and two faster animations. Those live in
`storefront/src/index.css` alongside everything else and are used **only** under `/admin`; no
existing value was changed, so the shop renders exactly as it did.

---

## Deployment

None of its own. It ships with the storefront — same Vercel project, same build, same
`vercel.json`, whose catch-all rewrite to `/index.html` already serves `/admin/*` for
client-side routing. There is nothing extra to configure and no second URL to coordinate.
