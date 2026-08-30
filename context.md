# Velora Wears — Session Context

**Read this first in a new session, then read [`Requirements.md`](Requirements.md) in full.**
This file is the *state of the work*; `Requirements.md` is the spec.

Last updated: 2026-08-29. Scaffold complete. **Requirements sections 1-17 are
built, and sections 18-20 are audited** — brand, landing, products, product details, categories, the cart, checkout, payment,
delivery charges, stock and availability, the order success animation, search, filters
and sorting, mobile responsiveness, reviews and ratings (the customer-facing half —
**moderation is the admin dashboard's, section 8, and is NOT built here — see the note below**),
and validation and security, including rate limiting on the two write endpoints.

**MIGRATED TO SUPABASE on 2026-08-29.** The Firebase project has been deleted by its owner
and every trace of Firebase is out of this repository. The stack is now Supabase — Postgres,
Supabase Realtime, and Edge Functions. Read section 2 and section 4 before touching data code.

**Nothing is blocked any more.** Edge Functions are on the Supabase free tier, so the Blaze
paywall that blocked checkout is gone. Section 10 (delivery charges) was delivered inside
section 7, section 9 (payment) was reviewed and finished on its own, section 11 (stock and
availability) is done, **section 12 (the order success animation) is done, and so is the
optional-customer-accounts note added to it** — sign up, sign in, order history, and a
"skip re-typing details" prefill at checkout, all built on RLS and a `place_order()` parameter
that had been sitting ready and unused since the Supabase migration. **Search and filters and
sorting (sections 13, 14) are done, and so is section 15 (mobile responsiveness)** — audited
across four breakpoints on every page, with one real bug found and fixed (the header overflowed
and hid the mobile menu button below 375px). **Section 16 (reviews and ratings) is done and
deployed** — a customer can write, edit and remove a review, signed in or as a guest, and it
was verified end to end against the live project with a temporary order that was fully cleaned
up afterward. **What section 16 does NOT include: hiding or removing a review as an admin. That
is requirements section 16's own "Admin" subsection, which belongs to section 8 — the admin
dashboard, Developer B's — and nothing about it has been built here.** The database side
(`hidden` column, the RLS policy that already excludes hidden reviews from every public read)
was already in place from the initial schema; only the admin UI to set it is missing, and that
UI is not ours to build. **Section 17 (validation and security) is also done and deployed** —
rate limiting on `place-order` and `submit-review`, backed by a Postgres counter and verified
live by actually tripping each limit; text sanitisation (control characters and invisible
Unicode stripped before storing, on both the checkout form and reviews); and public review
reads tightened to stop exposing `user_id`/`order_id`. **Rate limiting on search is the one
thing section 17 asks for that is NOT built, and it stays that way deliberately — see the
write-up below for why the architecture makes it impractical without a redesign nothing has
asked for.** Section 8 (the admin dashboard itself) is Developer B's, in full. **Sections 18
(component reuse) and 19 (performance) were then audited end to end against the finished
tree** — one real gap, a missing index behind the order-history read, was found and a migration
written for it (not yet applied — see below); everything else held. **Section 20 (team and
ownership) is a responsibilities document, not code — confirmed honest, nothing to build.**

> **The `payment_method` migration IS APPLIED.** `supabase/migrations/20260829000003_payment_method.sql`
> was applied to the live project on 2026-08-29 via the Management API and verified: the
> column, the enum and the restated `place_order()` are live, and `place_order` was exercised
> end to end inside a rolled-back transaction — stock decremented correctly, the order carried
> `payment_method: 'cod'`, and the database was left empty afterwards.

**Checkout completes end to end now, including in demo mode — see the 2026-08-30 write-up
below.** The storefront still reads the demo catalog, whose product ids do not exist in the
real database, so a REAL order still cannot be written until the admin dashboard creates real
products and `VITE_DATA_SOURCE` flips to `supabase`. What changed is that `lib/placeOrder.ts`
no longer requires that to happen before a customer (or Huzaifa, demoing the site) can walk the
whole flow and land on a genuine confirmation page — it simulates the order locally while in
demo mode, clearly marked `DEMO-` so it can never be mistaken for a real one.

> **Working agreement:** we build in `Requirements.md` **section order**, one section at a
> time. Huzaifa reviews each section and says when to start the next. Do not run ahead.
>
> **Routine at the end of every section:** build, typecheck and lint clean → update this
> file → commit in focused commits (**no `Co-Authored-By` trailer**) → push to `main`.
>
> **That is the whole deploy.** The GitHub repo is connected to Vercel, so pushing to `main`
> builds and ships to production on its own — do **not** also run `vercel deploy --prod`,
> it just builds the same commit a second time. The client's link never changes, so every
> section lands on the same URL: <https://velora-wears.vercel.app>

> **2026-08-30, later the same day — admin access reconciled.** The live database already had
> a `user_role` enum and `profiles.role`, with `is_admin()` re-pointed at it and the old
> `admins` table dropped — done by hand, directly against the project, with no migration and no
> note here. `20260830000003_profile_roles.sql` writes that change down (idempotent — it is a
> no-op against the live project, a real change on a fresh one), and every place in `admin/`,
> `storefront/` and the docs that still said "the `admins` table" now says `profiles.role`. An
> admin account for Huzaifa (`mhuzaifatariq7@gmail.com`) was created and promoted (`role =
> 'admin'`), verified end to end — signed in, `is_admin()` returned `true`. **Promoting anyone
> to admin is still not something either application can do to itself:** `role` has no UPDATE
> grant for `anon`/`authenticated`, only a direct database edit (Table Editor or SQL) can set
> it, same as `admins` required. **Next:** real products still need to exist before
> `VITE_DATA_SOURCE` can flip off `demo` — Huzaifa is adding them himself through the now-usable
> admin dashboard rather than the catalog being seeded with invented data.

---

## 1. The project

An e-commerce storefront for **Velora Wears**, a Pakistani fashion brand. Two developers:

- **Developer A** builds the storefront, Cloud Functions, and the order flow.
- **Developer B** (Huzaifa's friend) builds the **admin dashboard** — sections 8 and 20 of
  the requirements. **Do not build the admin dashboard.**

### Constraints that shape everything

- **React + Vite is mandatory** (§18). Not Next.js — the original scaffold was migrated.
- **Supabase (Postgres), not Firebase** (§18). Migrated 2026-08-29; the Firebase project is
  deleted. Supabase Realtime is not a second database — Supabase *is* Postgres, and Realtime
  streams row changes from it. Every table is published to Realtime.
- **Guest checkout is mandatory** — orders without signing in (§7).
- **Cash on Delivery only** in v1 (§9).
- **Reviews are tied to a purchase, not an account** — signed-in buyers *and* guests with a
  confirmed order can review (§16).
- **Never trust client-sent prices or totals.** Recompute server-side (§17).
- **Reusable components, no duplicated code** (§18).
- **Speed is a stated requirement** — indexed queries, small list payloads, image
  variants (§19).
- Stock is tracked **per size**; out-of-stock options must not be purchasable (§11).

---

## 2. Architecture, and why

The storefront is a browser SPA, so it **cannot** hold the Supabase **service role key** —
that key bypasses row level security and would hand full database control to any visitor.
Hence the split:

```
Browser (React + Vite)
   |
   +-- supabase-js, ANON key --read--> Postgres (via PostgREST)
   |     public catalog only; row level security allows select on
   |     products (active only), product_sizes, product_images,
   |     categories, settings, reviews (not hidden)
   |
   +-- supabase-js Realtime  <--WebSocket-- Realtime server
   |     row changes streamed from Postgres's write-ahead log.
   |     RLS is re-checked per subscriber, so anon never sees an order.
   |
   +-- Edge Function (place-order) --write--> Postgres
         Deno, SERVICE ROLE key, bypasses RLS
         calls place_order() which recomputes totals,
         re-checks stock and writes the order in ONE transaction
```

Client writes are denied everywhere: `orders` has no insert policy for anon at all. The
admin dashboard authenticates with Supabase Auth, and the user's id must exist in the
`admins` table — `is_admin()` is what every admin policy calls.

> **Verified against the live project on 2026-08-29**, with the anon key:
>
> - reading the catalog works; `orders` and `admins` both return `[]`;
> - inserting an order is refused with `42501 violates row-level security policy`;
> - updating a product price affects zero rows.
>
> `place_order` was also exercised end to end inside a transaction that was rolled back:
> the price came from the database (a deliberately falsified price in the payload was
> ignored), the admin-configured delivery charge was applied, and the per-size stock was
> decremented by exactly the quantity ordered.

---

## 3. Current state

Storefront builds, typechecks and lints clean.

| Area | State |
| --- | --- |
| Storefront | React 19 + Vite 7 + TS + Tailwind v4, **builds clean** |
| Routing | react-router-dom, `/`, `/products`, `/products/:slug`, `/categories`, `/cart`, `/checkout`, `/order/confirmed`, `/account`, `/account/sign-in` and `/account/sign-up`, lazy-loaded, scroll reset on navigate. **Every internal link is built by `lib/routes.ts`** |
| Supabase client | `lib/supabase.ts`, anon key in `storefront/.env.local` and on Vercel. **Session IS persisted** (accounts) |
| Query layer | Two interchangeable sources behind `lib/queries.ts`; demo one is live |
| Data source | `VITE_DATA_SOURCE=demo`. Switches to `supabase` when the admin dashboard can create real products |
| Database schema | **Deployed and verified** — 10 tables + the `product_summaries` VIEW, in `supabase/migrations/` |
| Row level security | **Enabled on all 10 tables and verified with the anon key** — catalog readable, orders and admins invisible, every client write refused |
| Realtime | **All 8 data tables published.** `useCatalogRealtime` drops the read cache on any change |
| Edge Function | `place-order` **deployed and implemented** — validates, then calls `place_order()` |
| Data contract | `shared/types.ts` (app shape) + `supabase/migrations/` (database shape) |
| Brand identity | **Done (section 1).** Logo, palette, and type scale are agreed and in use |
| Landing page | **Done (section 2).** Hero, categories, featured grid, promos, story, reviews, Instagram strip, CTA, footer |
| Products page | **Done (sections 3, 13, 14).** `/products` — the catalog, a category, search results, filters and sorting, all as URL state |
| Product details | **Done (section 4).** `/products/:slug` — gallery, size selection, reviews, related |
| Categories | **Done (section 5).** `/categories` index, the category view on `/products?category=`, category chips, data-driven header and footer nav |
| Shopping cart | **Done (section 6).** `/cart`, a mini-bag drawer, quantity and removal, live re-pricing against the catalog. **localStorage — there is no server** |
| Checkout | **Done (section 7).** Guest-first form, shared validation rules, COD, delivery charge, and `/order/confirmed`; now also links to a signed-in customer's account and pre-fills from it. **No order can complete while the catalog is demo data** |
| Order success animation | **Done (section 12).** A one-shot package/truck/checkmark sequence on `/order/confirmed` |
| Optional customer accounts | **Done (section 12's note).** `/account`, `/account/sign-in`, `/account/sign-up` — email/password via Supabase Auth, order history, checkout prefill. **Guest checkout is unaffected.** Password reset not built (needs an email provider) |
| Search | **Done (section 13).** Header search row + the products page. Enter or the button, never per keystroke. Prefix match |
| Filters and sorting | **Done (section 14).** Category chips, in-stock filter, four sorts, Load more |
| Mobile responsiveness | **Audited (section 15).** Every page checked at 375/768/1280/1600px with a headless browser for console errors and horizontal overflow. One real bug found and fixed — see the write-up below |
| Reviews and ratings | **Done, customer-facing half (section 16).** Write, edit, remove — signed in or guest, verified two ways. `submit-review` Edge Function **deployed**, migration **applied**, both verified end to end. **Admin moderation is NOT built — that's section 8, Developer B's** |
| Demo catalog | **19 products, 5 categories**, settings — all typed against `shared/types.ts` |
| Demo reviews | **36 mock reviews across all 12 products**, one hidden as spam. Product ratings are derived from them, not typed by hand |
| Demo images | 48 product WebPs + hero, 2 promos, 3 category tiles. **430 KB total**, committed |
| Product features | Listing, detail, category browsing, the bag, checkout, search, filters and sorting, and reviews. No admin |
| Seed data | **Database is empty — intentionally, and it stays that way.** Mock data is NEVER written to the live database. The catalog comes from `demoData.ts` in the frontend until the admin dashboard exists |
| Lint | `npm run lint` **passes clean** — flat config in `storefront/eslint.config.js` |

### Layout

```
storefront/          React + Vite (Developer A)
  public/                  favicon.svg, logo-mark.svg - standalone brand assets
  public/products/         DEMO product images, thumb + full WebP (throwaway)
  public/banners/          DEMO hero and promo art (throwaway)
  public/categories/       DEMO category tiles (throwaway)
  src/components/brand/    Logo.tsx - the ONLY definition of the logo
  src/components/ui/       Button, Badge, Field, Rating, Image, Marquee, SectionHeading,
                           Skeleton
  src/components/layout/   Container, PageHeader, Breadcrumbs, ValueProps, ScrollToTop,
                           Header (mobile nav + announcement), Footer
  src/features/home/       landing sections - Hero, CategoryStrip, FeaturedProducts,
                           PromoBanners, BrandIntro, Testimonials, InstagramStrip,
                           CtaBand
  src/features/products/   ProductCard, ProductGrid, StockBadge - reused by sections 3/5/13
                           ProductGallery, SizeSelector, RelatedProducts
                           SearchBar (section 13), ProductFilters (section 14)
  src/features/cart/       CartContext + CartProvider, CartButton, CartDrawer (lazy host),
                           CartDrawerPanel, CartLineRow, CartSummary, QuantityStepper,
                           useCartContents - the hook that prices the bag
  src/features/checkout/   CheckoutForm - the section 7 form and when it reports an error
                           OrderSuccessAnimation - the section 12 animated confirmation
  src/features/account/    optional customer accounts - AuthContext + AuthProvider,
                           AccountMenu (header) + AccountMobileLink, AuthLayout + FormError
                           (shared shell for the auth pages), OrderHistory
  src/features/categories/ CategoryTile (shared: landing bento + /categories), CategoryNav
  src/features/reviews/    ReviewCard (shared with the landing strip), ProductReviews (read),
                           ReviewComposer (section 16 - write/edit/remove, reused everywhere),
                           WriteReview (product page entry point - signed-in lookup or guest verify)
  src/pages/               HomePage, ProductsPage, ProductDetailPage, CategoriesPage,
                           CartPage, CheckoutPage, OrderConfirmedPage, NotFoundPage,
                           AccountPage, SignInPage, SignUpPage
  src/lib/supabase.ts      client init - anon key only, NEVER the service role key.
                           Session IS persisted now (accounts need one to survive a refresh)
  src/lib/env.ts           hasSupabaseConfig() with NO Supabase SDK import - lets a caller
                           decide whether to dynamically import lib/supabase.ts at all
  src/lib/myOrders.ts      a signed-in customer's own orders - RLS-scoped, no CatalogSource
  src/lib/queries.ts       read layer + cache + THE SOURCE SWITCH
  src/lib/sources/         CatalogSource (the interface), supabaseSource, demoSource
  src/hooks/useCatalogRealtime.ts  the ONE Realtime subscription for the whole tab
  src/lib/demoData.ts      throwaway demo catalog - never import from a component
  src/lib/format.ts        formatPrice / formatRating / formatDate / prettifySlug
  src/lib/sizes.ts         SIZES + SIZE_LABELS - the order sizes are shown in
  src/lib/routes.ts        EVERY internal URL - the one definition of a category link
  src/lib/cart.ts          bag rules: validation, mutations, pricing. PURE
  src/lib/placeOrder.ts    the POST to the place-order Edge Function + its error mapping
  src/lib/orderReceipt.ts  the placed order, in sessionStorage - the client cannot read it back
                           (ReceiptLine now carries productId, for section 16's review link)
  src/lib/submitReview.ts  the POST to the submit-review Edge Function (section 16)
  src/lib/reviewLookup.ts  the guest order-number+email lookup RPC + "do I already have a
                           review here" read - both public, neither goes through the Edge Function
  src/lib/cartStore.ts     the bag as an external store over localStorage
  src/hooks/useAsync.ts    the one data-loading hook
admin/               Developer B's dashboard - placeholder + contract notes
supabase/
  migrations/        THE DATABASE. Schema, RLS policies, place_order(), find_order_for_review(),
                     check_rate_limit(). 0001-0005 all deployed and verified. 0003 holds the
                     live place_order() - 0002 is superseded history. 0004 is section 16
                     (reviews). 0005 is section 17 (rate limiting).
  functions/
    place-order/     Edge Function (Deno) - validation + the call into place_order()
    submit-review/   Edge Function (Deno) - section 16: write/edit/remove a review, proves
                     the reviewer bought the product one of three ways (see context.md)
    _shared/rateLimit.ts   section 17 - the one bit of code shared between Deno functions,
                     since they cannot import from shared/ at the repo root. Everything else
                     each function needs is still inlined per file, on purpose (see context.md)
  config.toml        CLI config
shared/types.ts      DATA CONTRACT - shared with Developer B
shared/checkout.ts   CHECKOUT RULES - mirrors the Edge Function's validation exactly
shared/payment.ts    PAYMENT METHODS (section 9) - the enum and the words for it
shared/stock.ts       STOCK RULES (section 11) - what "low" means, once
shared/reviews.ts     REVIEW RULES (section 16) - mirrors submit-review's validation exactly
shared/sanitize.ts    TEXT SANITISATION (section 17) - strips control/invisible characters
                     before storing; checkout.ts and reviews.ts both call it
```

npm workspaces cover `storefront` and `shared` only. `supabase/functions/` is Deno, not
Node — it has no `package.json`, imports straight from `jsr:`/`npm:` URLs, and is deployed
by the Supabase CLI. Do not try to make it a workspace.

---

## 4. Supabase facts

| | |
| --- | --- |
| Project name | `VeloraWears` |
| Project ref | `owbnbzutqslihhnzdnyo` |
| Region | `ap-south-1` (Mumbai) — the closest Supabase region to Pakistan |
| API URL | `https://owbnbzutqslihhnzdnyo.supabase.co` |
| Organisation | `Velora-Wears` (`sijdvqmehpvnkidonfcf`) |
| Postgres | 17 |
| Account | `mhuzaifatariq7@gmail.com` |
| Dashboard | <https://supabase.com/dashboard/project/owbnbzutqslihhnzdnyo> |

> **There is a second, unrelated project on this account — `glow-plus-prod` in the
> `glow-plus` org. Never touch it.** Always pass `--project-ref owbnbzutqslihhnzdnyo`.

### Credentials — how to get them, because none of them are in this repo

**The repository is PUBLIC. No key, token or password may ever be committed here.**

| What | Where to get it | Used for |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` (`sbp_…`) | <https://supabase.com/dashboard/account/tokens> | the CLI and Management API |
| anon key | Dashboard → Project Settings → API | the browser; already in `storefront/.env.local` and on Vercel |
| service role key | Dashboard → Project Settings → API | **never needed locally** — Edge Functions get it injected |
| DB password | set when the project was created | `supabase db push` |

**Ask Huzaifa for the access token at the start of a session that needs it**, and export it
rather than pasting it into a command that gets logged:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...        # ask; never commit
```

The anon key in `storefront/.env.local` is **public by design** — it is compiled into the
browser bundle. Security comes from row level security, not from hiding it. The service role
key is the opposite: it bypasses RLS entirely and must never appear in `storefront/`.

### Running SQL without the CLI or Docker

Docker is deliberately **not** used on this project — there is no local stack, we work
against the live project. The Management API runs arbitrary SQL, which is how the schema was
applied and verified:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"select count(*) from products"}' \
  "https://api.supabase.com/v1/projects/owbnbzutqslihhnzdnyo/database/query"
```

For a large file, build the JSON body with Python (`json.dumps`) into a temp file and pass
`--data @file` — a heredoc will mangle the quoting.

---

## 5. Commands

```bash
npm install                 # root - installs storefront + shared workspaces
npm run dev                 # storefront dev server
npm run build               # storefront production build
npm run typecheck
npm run lint
```

### Supabase CLI (via npx — it is not a dependency)

Everything below needs `SUPABASE_ACCESS_TOKEN` exported first. Always name the project ref;
there is another project on this account.

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...        # ask Huzaifa

# Deploy the Edge Function. --use-api avoids Docker; --no-verify-jwt is REQUIRED
# because guest checkout must work without a session (Requirements section 7).
npx supabase functions deploy place-order \
  --project-ref owbnbzutqslihhnzdnyo --use-api --no-verify-jwt

# Generate database types from the live schema
npx supabase gen types typescript --project-id owbnbzutqslihhnzdnyo > shared/database.types.ts

# Migrations: apply via the Management API (see section 4). `supabase db push`
# needs the database password and a linked project.
```

### Vercel CLI

```bash
npx vercel env ls                                   # list configured variables
npx vercel env add NAME production --type config    # value is read from stdin
npx vercel env rm NAME production --yes
```

`--type config` is required for `VITE_` variables: the CLI refuses them otherwise, because
the prefix publishes the value to every visitor. That is correct here — Supabase's URL and
anon key are public by design.

Deploying is `git push origin main` — Vercel builds it. See section 10.

> **Port note:** port 3000 is occupied by another process on this machine. Vite defaults to
> **5173** and walks upward — check the dev server output for the actual port.

---

## 6. Conventions

- **No `Co-Authored-By` trailers in commits.** The user does not want Claude appearing as a
  co-author on GitHub.
- **The Admin SDK must never appear in `storefront/`.** If something needs privileged access,
  it belongs in a Supabase Edge Function.
- **The service role key must never appear in `storefront/`.** It bypasses row level
  security. ESLint bans the Firebase packages outright; the service key is banned by review.
- **Every new filter or sort column needs an index**, added in the same migration.
- **List views read the `product_summaries` VIEW, never `products`.**
- **Schema changes are migrations**, committed under `supabase/migrations/`. Never edit the
  database through the dashboard UI — the next person will not know it happened.
- **Never write an internal URL by hand.** Import `categoryPath` / `productPath` from
  `lib/routes.ts`. Six surfaces link to a category; they must agree on one URL.
- **The bag never stores a price, a name or an image** — only ids, size and quantity.
  Everything else is re-read from the catalog on render. A cached price would only ever
  end up disagreeing with the server, which recomputes every total (§17).
- **Never import `lib/demoData.ts` from a component or page.** Go through
  `lib/queries.ts` — that indirection is what makes switching to the database a
  one-flag change instead of a rewrite.
- **Never seed mock data into the live database.** Placeholder products live in the
  frontend. The database is for real data the admin dashboard creates.
- **Build a shared component before writing markup twice** (§18). Extend `Button` with a
  variant rather than styling a one-off button somewhere else.
- No hardcoded colours in components — use the tokens in `storefront/src/index.css`.
- **Never redraw the logo.** Import `Logo` / `LogoMark` from
  `storefront/src/components/brand/Logo.tsx` and pick a variant.
- For a link that should look like a button, use `buttonClasses()` from `ui/Button.tsx`
  rather than restyling an anchor.
- Repo is **public**: assume anything committed is world-readable. **No access token, key
  or password goes in any committed file — including this one.** See section 4 for where
  each credential actually lives.
- Path aliases: `@/*` maps to `storefront/src/*`, `@shared/*` maps to `shared/*`.

---

## 7. Data model

Two sources of truth, and they are not the same thing:

- **`supabase/migrations/`** — the DATABASE. Tables, columns, constraints, indexes, row
  level security, and `place_order()`. This is what actually exists.
- **[`shared/types.ts`](shared/types.ts)** — the shape the two APPLICATIONS pass around.
  Read it before writing queries.

```
categories          slug PK, name, sort_order, thumb, description
products            id, slug, name, description, price, category_slug FK,
                    active, search_text (GENERATED, trigram indexed)
product_sizes       (product_id, size) PK, stock        <- per-size stock, section 11
product_images      product_id, position, thumb_url, full_url, width, height
reviews             product_id, order_id, rating, comment, display_name,
                    verified_purchase, hidden, updated_at (section 16)
                                        <- unique (order_id, product_id). WRITTEN ONLY BY
                                           submit-review (Edge Function, service role) -
                                           no insert/update/delete policy for anon/authenticated,
                                           same as orders
orders              customer PII, subtotal/delivery/total, payment_method,
                    review_token                                   SERVER-WRITTEN ONLY
order_items         snapshot of name/slug/thumb/size/qty/unit_price at order time
settings            ONE row: delivery_charge, free_delivery_threshold, low_stock_threshold
settings_private    admin only
admins              user_id FK auth.users            <- is_admin() reads this

product_summaries   *** A VIEW ***

find_order_for_review(order_number, email)   *** A FUNCTION, not a table ***
                    SECURITY DEFINER, like is_admin() - lets an anon caller prove they own
                    a guest order (section 16) without a select policy on orders existing.
                    Callable directly via PostgREST RPC with the anon key; read-only.
```

### The one thing to understand before writing any data code

**`product_summaries` is a VIEW, not a table.** Under Firebase it was a hand-maintained copy
that the admin dashboard had to rewrite on every product edit, and a missed write showed
customers the wrong price. Postgres computes it instead:

- `in_stock` / `low_stock` / `total_stock` — summed from `product_sizes`
- `rating_avg` / `rating_count` — averaged from visible `reviews`
- `thumb` — the first `product_images` row by position

So **there is nothing to keep in sync, and it cannot go stale.** The whole class of bug is
gone, and the obligation that used to be on Developer B is gone with it.

The view is declared `security_invoker = on`, which makes it run with the caller's
permissions so RLS on the underlying tables applies. Without that a view silently runs as
its owner and becomes a way around RLS. **Do not remove it.**

### snake_case vs camelCase

Postgres columns are `snake_case`; `shared/types.ts` is `camelCase`, and timestamps are epoch
milliseconds there but ISO strings in Postgres. The mapping happens in ONE place —
`lib/sources/supabaseSource.ts`, at the boundary. Nothing above that file knows.

---

## 8. Build order

We follow **`Requirements.md` section order**. Huzaifa reviews each section before the next
one starts.

| # | Requirements section | State |
| --- | --- | --- |
| 1 | Brand overview — logo, palette, typography | **Done** |
| 2 | Landing page — hero, featured, categories, testimonials, footer | **Done** |
| 3 | Products page — grid, cards | **Done** |
| 4 | Product details — gallery, size selection | **Done** |
| 5 | Categories | **Done** |
| 6 | Shopping cart | **Done** |
| 7 | Checkout — guest + signed in | **Done** |
| 8 | *Admin dashboard — **Developer B**, not us* | not ours |
| 9 | Payment — COD only | **Done.** Stated on the form and the confirmation, and now RECORDED on the order — `payment_method` in Postgres, `shared/payment.ts` in the applications |
| 10 | Delivery charges | **Done in section 7** — admin-configured, shown in the bag, at checkout and on the confirmation; the SERVER applies it |
| 11 | Stock and availability | **Done.** One shared rule for "low" (`shared/stock.ts`), the badge now shows the count when it matters, and the product page states which sizes are actually available instead of a hardcoded three |
| 12 | Order success animation | **Done.** A one-shot CSS/SVG sequence on `/order/confirmed` — package packed, truck arrives and drives off, confirmation mark draws in. **Its added note — optional customer accounts — is also done:** sign up/in/out, order history, checkout prefill and linking. Guest checkout unaffected |
| 13 | Search | **Done** |
| 14 | Filters and sorting | **Done** |
| 15 | Mobile responsiveness | **Done.** Audited at 375/768/1280/1600px on every page; one real bug found and fixed. Still worth attention as new sections land |
| 16 | Reviews and ratings | **Done, customer-facing half.** Write, edit, remove — signed in or guest. **Admin moderation (hide/remove a review) is section 8's "Admin" subsection — Developer B's, not built here** |
| 17 | Validation and security | **Done.** Checkout and review validation (shared rules, server re-validation), rate limiting on `place-order` and `submit-review`, text sanitisation, and public review reads tightened to exclude `user_id`/`order_id`. **Rate limiting on search is NOT built — architecturally out of reach with this design, not an oversight. See the write-up** |
| 18 | Stack and component reuse | **Audited, 2026-08-29.** Cross-cutting, not a discrete build — held throughout sections 1-17. This pass checked the whole tree for drift; see the write-up below |
| 19 | Performance | **Audited, 2026-08-29.** One real gap found and fixed — a missing index. See the write-up below |
| 20 | Team, ownership and the shared contract | **Not ours to build — Developer B's, with us.** It is a responsibilities document, not a feature. See the write-up below for what it obliges us to keep true |

> **The section write-ups below are a HISTORICAL LOG.** Sections 1-6, 13 and 14 were built
> against Firebase, and the notes still name `firebaseSource`, `database.rules.json`,
> `.indexOn`, `productSummaries` as a node, and the Blaze plan. **The reasoning is still
> worth reading — the design decisions carried over — but the file and API names did not.**
> The code was ported to Supabase on 2026-08-29; sections 2, 4 and 7 above describe what is
> actually there now. Nothing below is a live instruction.

### What section 1 delivered

- **Logo** — `storefront/src/components/brand/Logo.tsx`. A tapered `V` monogram inside a
  stamped ring, split down its axis: the left arm is `currentColor` so the mark works on
  light *and* dark surfaces, the right arm is fixed antique gold. Variants: `full`
  (default), `mark`, `stacked`. Verified legible down to 16px favicon size.
  Standalone copies for the browser and for sharing live in `storefront/public/`.
  **Reuse this component — never redraw the logo inline.**
- **Palette** — deep plum ink `#241d33` with antique gold `#b8925a` on a warm cream canvas.
  Status colours (`success`, `warning`, `danger`) are already defined, ready for the stock
  badges in section 11 and form validation in section 17.
- **Typography** — Playfair Display for headings (set once on `h1/h2/h3`), Inter for UI.
  Loaded from Google Fonts in `storefront/index.html`.
- **`Button` refactor** — now also exports `buttonClasses()`, so a `Link` can be styled
  identically without duplicating the styles. Use it for link-buttons.

### What section 2 delivered

The landing page at <https://velora-wears.vercel.app>, built from reusable components, in
this order: hero → running promise ticker → reassurance strip → category bento → featured
product grid → two promo banners → dark brand story → customer reviews → Instagram strip →
closing CTA → full footer.

**The data layer was rebuilt around a switch, not a rewrite.**

```
pages/components  -->  lib/queries.ts  -->  lib/sources/demoSource.ts   <- today
                        (cache +               reads lib/demoData.ts
                         source switch)
                             |
                             +---------->  lib/sources/firebaseSource.ts  <- one flag flip
                                              reads the Realtime Database
```

- Both sources implement the same `CatalogSource` interface (`lib/sources/CatalogSource.ts`),
  so adding a method to one without the other **stops compiling**. Ordering is shared through
  one `sortSummaries` helper, so the two cannot drift.
- The source module is imported **dynamically**, so in demo mode the Firebase SDK is never
  downloaded by the browser at all — the build reports the `firebase` chunk as empty.
- The demo source imitates RTDB on purpose: async, `active`-filtered, sorted, limited, and
  **prefix-only search**, because that is all `startAt`/`endAt` can do.
- `VITE_DATA_SOURCE` (`demo` | `firebase`, default `demo`) is in `.env.example`,
  `.env.local`, and set on Vercel for all three environments.

**Components built once, to be reused:** `ProductCard` / `ProductGrid` / `StockBadge` are the
same ones sections 3, 5, 11 and 13 will use — do not write a second grid. `Image` makes
`width`/`height` compulsory so nothing shifts while loading. `Rating`, `Badge`, `Marquee`,
`SectionHeading`, `Skeleton` are the shared primitives. `useAsync(load, key)` is the only
data-loading hook: the **key must contain every input**, since it is what triggers a reload.

**Demo catalog:** 12 products across shirts / hoodies / essentials, deliberately covering
every stock state — one product entirely sold out (Kohl Poplin Shirt), two on low stock, and
several with a single size sold out — so section 11's badges have real data to render.

**Mock reviews (36 of them).** Every product carries two to four reviews from Pakistani
customers, written as real `Review` records: tied to an order id, display name only, no email
or phone anywhere near them. They are deliberately not all five stars, and **one is seeded
`hidden: true`** as spam an admin removed, so every read path proves it filters hidden reviews
rather than assuming it.

They drive three things:

1. **the landing testimonials** — `listTestimonials()` takes the *best* review of each
   product, not the newest overall, so the strip shows a spread of the collection rather than
   three reviews of the same hoodie;
2. **`ratingAvg` / `ratingCount` on every product summary**, which are now **derived from the
   reviews** rather than hand-typed. That is the same precomputation the admin dashboard must
   do at write time whenever a review is created, edited, hidden or deleted (section 19) — the
   storefront must never average reviews at read time;
3. **`listReviews(productId, limit)`**, wired through both sources and ready for the product
   detail page. The Realtime Database implementation reads `reviews/{productId}` only, ordered
   by the indexed `createdAt` with `limitToLast` — never the whole `reviews` node.

Section 16's review *UI* — the form, the guest review token flow, editing and removal — is
**not** built. Only the data and the read path are.

**Demo images** are generated flat-lay illustrations, committed under `public/products`,
`public/banners`, `public/categories`: WebP, `thumb` (600x800) + `full` (1100x1467), 430 KB
for all 48 files. **They must be replaced with real photography before the client signs off.**

**Also fixed in this section:**

- `npm run lint` now works — flat ESLint config added, with two project rules encoded:
  importing `lib/demoData` outside `demoSource.ts` is an **error**, and so is importing
  `firebase-admin` anywhere in the storefront.
- `getSettings()` now reads `settings/public`, which is what the rules actually expose. The
  latent bug noted here previously is gone.
- Header gained a working mobile menu and the admin-configurable announcement bar; the footer
  became the real four-column footer.
- Routes are lazy-loaded, and `NotFoundPage` catches the not-yet-built routes so links from
  the landing page never land on a blank screen.

### What section 3 delivered

`/products` at <https://velora-wears.vercel.app/products> — the full catalog as cards
carrying image, name, price and category, which is exactly what requirements section 3 asks
for and nothing more.

**The page composes; it does not draw.** `ProductsPage` is ~100 lines and contains no grid
markup: the cards are the same `ProductCard` / `ProductGrid` the landing page's featured
strip renders, so the two surfaces cannot drift into looking like different shops. It reads
through `listProducts` like everything else, so it is identical on the demo source and on
the Realtime Database.

**`?category=` is honoured, but there is no filter UI.** The header, footer, category tiles
and promo banners were already linking to `/products?category=hoodies`, so the page reads
the parameter and lists that category. That is URL state only — **the filter and sort
CONTROLS are section 14 and search is section 13; neither is built.** The count row above
the grid is deliberately a flex row with room on the right: that is where section 14's sort
control and filter chips go.

An unknown `?category=` slug (a stale or hand-typed link) renders an explicit message rather
than an empty grid, and the title falls back to a prettified slug while the categories are
still loading so it does not flip from "The whole collection" to "Hoodies" as data lands.

**Two components were generalised rather than duplicated:**

- `SectionHeading` gained an `as` prop (`h1` | `h2`). A page title must be the `h1`; the
  styling is otherwise identical, so it took a prop instead of becoming a second component.
- `PageHeader` (`components/layout/`) is the standard band at the top of an inner page —
  `Container` + `SectionHeading as="h1"` + an optional row underneath. **Sections 4, 5, 6
  and 13 should all open with this**, not with their own header markup.
- `prettifySlug` moved from `ProductCard` into `lib/format.ts`, since two callers now need it.

**Two navigation bugs were latent while `/` was the only route, and are fixed:**

1. The header's four links all point at `/products` and differ only by the query string.
   `NavLink` matches on the *path* alone, so on `/products?category=shirts` all four lit up
   at once. Active state is now decided on the query string — beware of this if you add more
   query-differentiated links.
2. React Router does not reset scroll position on navigation the way a browser does on a page
   load, so "Shop all" in the footer opened the products page already scrolled down it.
   `components/layout/ScrollToTop.tsx` fixes it, jumping instantly (`html` carries
   `scroll-behavior: smooth` for anchors, which would otherwise animate the whole page) and
   leaving `#hash` links alone. It keys on `search` as well as `pathname`, because
   `/products?category=hoodies` is a different page to `/products`.

`NotFoundPage` no longer describes the collection as unbuilt and links to it.

**Not built, deliberately:** pagination. `listProducts` is bounded at 24 and the demo catalog
is 12, so everything fits today. A real "load more" needs a cursor — RTDB paginates with
`startAfter` on the ordering key, not an offset — which means a change to the shared
`CatalogSource` interface and both implementations. That belongs with section 14, where the
sort order it has to page through is decided.

### What section 4 delivered

`/products/:slug` — the product detail page. Name, price, description, category, an image
gallery and S/M/L size selection, which is what requirements section 4 asks for, plus the
review display section 16 asks to appear here.

**The page composes, like the products page does.** The gallery, the size selector, the
review list and the related strip are each their own component under `features/`; the page
holds the reads, the layout and the one piece of state that is genuinely the page's own
(which size is chosen).

**It is the only page that reads a full `products` record**, through `getProductBySlug`.
It also reads the product's SUMMARY, because `ratingAvg`, `ratingCount`, `inStock` and
`lowStock` are precomputed at write time and exist only there — the storefront must never
average reviews at read time (§19). That needed a new `getProductSummaryBySlug` on the
`CatalogSource` interface, implemented in both sources, and **a new `slug` index on
`productSummaries` in `database.rules.json`** — added and **deployed** to the live database
on 2026-08-29 with `npm run deploy:rules`.

**Reads come in two waves**, which is the pattern any dependent read should copy:

1. keyed on the slug in the URL — product, summary, categories, settings, in one
   `Promise.all`;
2. keyed on what wave one returned — `listReviews(product.id)` and the related products
   for `product.categorySlug`. Each has its own `useAsync` key and its own skeleton, so a
   slow reviews read never holds up the product itself.

**Size selection is real, and it is the gate on the cart.** `SizeSelector` reads
`product.sizes`, renders S/M/L in the fixed order from the new `lib/sizes.ts`, and a size
with `stock: 0` is struck through and genuinely `disabled` — section 11 requires that an
unavailable option cannot be purchased. The remaining count for the chosen size is
announced underneath ("Only 2 left in Medium"), using `lowStockThreshold` from settings.
"Add to bag" is disabled until a size is chosen, and permanently on a piece where every
size is gone. **The cart is section 6 and is not started** — the button sets a line of
copy saying so.

**The gallery** keeps only the selected image in the DOM at full resolution. Stacking all
the images and hiding the inactive ones would download the whole set, because they are in
the viewport and `loading="lazy"` would not help; the first image loads eagerly and the
rest only when a thumbnail is clicked (§19). Thumbnails use the `thumb` variant the
visitor has usually already downloaded on the grid they came from.

**Three components were shared rather than duplicated:**

- `ReviewCard` (`features/reviews/`) was extracted from the landing page's testimonials
  and is now used by both surfaces, with an optional date on the product page. Use it for
  section 16's review list too.
- `ValueProps` **moved** from `features/home/` to `components/layout/`. It is a page-level
  band, not a landing-page section, and the product page needs the same four promises —
  writing them a second time would have duplicated the copy and the settings-driven
  delivery threshold.
- `Breadcrumbs` (`components/layout/`) is new. Section 5 and the cart should use it.

**A bug worth remembering:** react-router swaps `:slug` **without unmounting the page**,
so a plain `useState` for the chosen size carried "M" from one product to the next — where
M might be sold out, leaving a sold-out size selected with the add button live. The
selection is now stamped with the slug it was made for and resets during render. Any
per-product state added later (quantity, in section 6) has the same trap.

**A product URL that matches nothing is the detail page's own state**, not `NotFoundPage`:
`getProductBySlug` returns `null` for an unknown *and* for an inactive product, and the
page says so and offers the collection.

**Not built, deliberately:** the review form (section 16), quantity selection and the cart
(section 6), and a size guide. There is no "notify me when back in stock" — it needs a
write path, and every client write is denied by design.

### What section 5 delivered

Categories, as requirements section 5 asks: the catalog organised into categories, and a
visitor able to view and browse products by the category they choose.

**The URL question in the old notes is settled.** `/products?category=<slug>` is the ONE
canonical URL for a category. The catalog and a single category are the same page in two
states, which is also the URL section 14's filter controls will write to, so a second
`/category/:slug` route would have meant two addresses for one thing and an active-state
check that matches neither. Nothing moved; every existing link still works.

**`lib/routes.ts` is new, and is the point of that decision.** Every internal URL is built
there — `categoryPath`, `productPath`, `HOME` / `PRODUCTS` / `CATEGORIES`. Six surfaces
link to a category (header, footer, landing bento, the index, a product's breadcrumbs, the
related strip); before this each one wrote the query string by hand. **Do not write an
internal URL literal anywhere else** — and if the shape is ever revisited, `categoryPath`
is the only thing that changes.

**What was built:**

- **`/categories`** — the index. Every category as a tile with its art, name, piece count
  and a line of copy. It reads ONLY the small `categories` node, already cached from
  wherever the visitor came from; it deliberately does **not** preview products per
  category, which would be one catalog read per category on a page whose whole job is to
  hand the visitor on (§19).
- **The category view on `/products?category=`** — the products page now becomes that
  category's own page: its name as the `h1`, its copy, its picture in the header, and a
  breadcrumb trail back through the index. Same page, same component, one extra state.
- **`CategoryNav`** — the chip row (Everything / Shirts / Hoodies / Essentials / All
  categories), each with its precomputed count, in the page header in *both* states. It is
  what makes browsing real: a visitor can move sideways between categories without going
  back first. Every chip is a plain `Link`, so the selected category is URL state — back
  button, sharing and bookmarking all work. It is **not** section 14's filter system: one
  axis, one selection; sorting and multi-select come later, on the row above the grid.

**Three things were shared rather than duplicated (§18):**

- **`CategoryTile`** (`features/categories/`) — the landing bento's tile was lifted out and
  is now used by the index too, with `feature` / `compact` / `portrait` variants that change
  proportion and type scale only. `CategoryStrip` now owns the *layout*, not the tile.
- **`PageHeader` gained a `media` slot** rather than a near-identical `CategoryHeader`
  existing. With no media the markup is exactly what it was before.
- **`formatPieceCount`** moved into `lib/format.ts`; three places were pluralising "piece"
  by hand.

**The header and footer navigation is now built from the data, not hardcoded.** It used to
be three literal slugs, which meant a category the admin creates in the dashboard would
never appear in the navigation, and one they retire would go on being linked. Both read the
cached `categories` node — one read for the session, shared with the page below. The header
shows up to four and always links on to `/categories`; the desktop bar holds its width with
a skeleton so the links do not slide sideways as the data lands.

**An empty category is not a link.** A tile with `productCount: 0` renders "Coming soon",
desaturated, with no `Shop` affordance — a tile that promises pieces and opens an empty grid
is worse than one that says the edit is on its way. `productCount` is precomputed on the
record, so nothing is counted to know this (§19).

**An unknown `?category=` is a real state, not `NotFoundPage`** — the same reasoning as an
unknown product slug. It now explains itself and offers the collection and the index,
rather than rendering an empty grid with a line of text under it.

**No database or rules change.** Categories are read as one small flat node with no
`orderByChild`, so there is no new index and `deploy:rules` was not needed. The one contract
change is **additive**: `Category.description?` in `shared/types.ts` — optional, and every
read path renders correctly without it, so nothing breaks for Developer B. **Tell Developer
B it exists** so the admin dashboard can offer it as an optional field.

**Not built, deliberately:** sorting and multi-select filtering (section 14), search
(section 13), pagination (still bounded at 24, still waiting on the cursor decision in
section 14), and per-category photography — the category art is the same generated demo
tile the landing bento uses.

### What section 6 delivered

The bag: an *Add to bag* control on every product behind the size gate, a `/cart` page
showing product, size, quantity, price and the order total, and the ability to change a
quantity or remove a line before checkout — which is what requirements section 6 asks for.

**THE BAG HAS NO SERVER, and that shapes everything.** Every client write to the database
is denied by design and Cloud Functions need Blaze, so the bag lives in `localStorage` on
the visitor's own device. Two rules fall out of it and both are enforced in code:

1. **A stored line holds identity only** — `productId`, `slug`, `size`, `qty`. Never a
   price, a name or an image. Those are re-read from the catalog every time the bag is
   rendered, so a price the admin changes is right immediately and a bag left open for a
   week cannot show last week's total. §17 has the SERVER recompute every total from stored
   prices; a client that cached one would only ever be disagreeing with it.
2. **Anything read back out is untrusted input.** Storage is plain text the visitor can
   edit, so `readCart` validates every field and drops what does not typecheck — a bad
   size, a negative quantity, a missing slug — rather than handing the app a bag that
   cannot be priced (§17, reject malformed or oversized input). A corrupt value reads as an
   empty bag and never throws.

**The layering is deliberate, and worth keeping:**

```
lib/cart.ts        PURE - validation, mutations, and buildCart (the money)
lib/cartStore.ts   the external store over localStorage + the cross-tab listener
features/cart/     CartProvider binds those to React; everything else is UI
```

`buildCart` is the ONE place the bag is priced, so the drawer, the cart page and the header
badge cannot disagree about a total (§18).

**`useSyncExternalStore`, not `useState` seeded by an effect.** Storage is a thing outside
React that changes without React being told, including from another tab. The effect version
rendered the whole app twice on every page load — once with an empty bag — which meant the
header badge flashed empty and a `ready` flag had to be threaded through the UI. The
external store makes the first render already correct, and subscribes the `storage` event
once however many components read the bag. ESLint's `react-hooks/set-state-in-effect` rule
catches the old shape if anyone reintroduces it.

**Two surfaces, one set of components.** `/cart` is the canonical bag — linkable, sharable,
back-button-able. The drawer is the shortcut, and opens the moment something is added,
because a button that changes nothing visible does not read as having worked. Both render
the same `CartLineRow` and `CartSummary`.

**The drawer is `lazy`.** `CartDrawer.tsx` is a tiny always-mounted host; the panel and
everything it pulls in is a chunk that downloads the first time the bag is opened, shared
with the cart page. Inlining it added ~4.4 kB gzip to every page load for something most
visits never open (§19). The host also owns "close on navigate" — an effect inside the panel
would fire on the panel's own mount and close the drawer in the same breath as it opened.

**Stock is re-checked against the live catalog every time the bag renders** (§11). A line
can be `gone` (retired), `sold-out` (that size went while the bag sat there) or `reduced`
(fewer left than the quantity asked for). Any of them prices the line at ZERO, excludes it
from the total, and **disables checkout** — a disabled `Button`, not a styled `Link`, because
an anchor cannot be disabled and section 11 requires the option genuinely cannot be taken.
One control clears all the bad lines so the visitor is not left hunting for the culprit.

The bag reads the FULL product, not the summary, because stock is per size and only
`products/{id}.sizes` carries it. One read per distinct product, in parallel, all served by
the cache in `queries.ts` — and bounded by `MAX_LINES`, so it is never an unbounded read.

**Delivery is shown in the bag** (§10) from the admin-configured settings, with free
delivery above the threshold and the shortfall called out. Display only — the server
recomputes it at checkout.

**The product page gained a quantity stepper**, and it carries the same slug-stamping trap
the size selector does: 3 of one shirt must not become 3 of the next one when react-router
swaps `:slug` without unmounting. Changing size resets the quantity to 1, because a quantity
valid for Large may exceed what is left in Small.

**Verified with 59 assertions** through an SSR harness: storage validation, the merge and
cap rules, quantity and removal, pricing from the catalog rather than storage, all three
stock problems, delivery arithmetic, and what the line and summary actually render. The
harness is not committed — it needs a `localStorage` stub and a browser-free React render,
which is not worth a test runner in the repo yet.

**Not built, deliberately:** checkout itself (section 7 — it needs `placeOrder`, so it needs
Blaze; `/checkout` falls through to the catch-all page, which says so), a saved bag across
devices (that needs auth and a write path), and promo codes, which nothing has asked for.

### What sections 13 and 14 delivered

Search, filters and sorting — the last work that could be done without the Blaze plan.

**They are all states of `/products`, and all of them live in the URL.** That is the one
decision this work is built around. A search, a category, a sort order and the availability
filter are query parameters — `?q=`, `?category=`, `?sort=`, `?stock=in` — so every
combination is linkable, shareable, survives the back button, and composes with the others
for free. Nothing is component state, so there is nothing to keep in sync.

A separate `/search` page was the obvious alternative and would have been worse: it needed
its own grid, its own filters and its own sort, and half of them would quietly not have
worked together.

**`searchProducts` is gone; `listProducts` does everything.** Searching and browsing produce
the same thing — a filtered, sorted page of summaries — and a visitor who searches must
still be able to narrow by category, hide what is sold out and sort by price. Two entry
points meant two sets of filtering code, one of which would not have supported half of them.
`ListProductsOptions` now carries `search` and `inStockOnly` alongside `categorySlug`,
`sort` and `limit`. **Nothing was using `searchProducts` yet**, so this cost nothing.

**The Realtime Database can only order by ONE field per query**, so the combination has to
be split. `firebaseSource.fetchWindow` picks the single indexed query that fetches the
smallest correct window — search is the narrowest filter, then a category, and only when
neither is present is the one index worth spending on the sort field itself — and whatever
is left over runs in the browser through the shared `applyFilters`. Because the server's
limit applies BEFORE those leftovers, the window is widened (`OVERFETCH`, capped at
`MAX_FETCH`) and trimmed afterwards; asking for exactly 24 and discarding half would return
12 and wrongly look like the end of the catalog. It stays bounded, which is what §19
requires.

**`applyFilters` and `sortSummaries` are shared by both sources**, so the demo path and the
database path cannot disagree about what a search or a sort means. Search is therefore
**prefix-only on both** — that is all `startAt`/`endAt` can do, and matching mid-string in
the demo source would quietly break the day the flag flips.

**Search does not run per keystroke** (§13, and §19 for a different reason). `SearchBar` is
a real `<form>`, so Enter submits it for free and the button is a plain submit — no key
handler, no debounce. The typed value is stamped with the URL term it was typed against, so
following a category chip or the back button re-syncs the field without an effect.

**Sorting offers four axes**: newest, price low-to-high, price high-to-low (the two §14
requires) and best rated. Rating and price are precomputed on the summary, so none of them
costs a read. Every comparison falls back to `createdAt`, so ties do not shuffle between
reads, and an **unrated piece sorts below a poorly rated one** rather than competing with
the worst review in the shop.

**The category filter is deliberately NOT in `ProductFilters`.** It is `CategoryNav` from
section 5 — a row of links, because a category is a browsable place with its own title and
picture, not a checkbox. `ProductFilters` is the sort and the in-stock toggle, and uses a
native `<select>`: one control, keyboard accessible for free, and on a phone it opens the
platform picker instead of a list scrolling inside a scrolling page (§15).

**"Load more" is not cursor pagination, deliberately.** A `startAfter` cursor cannot page
through a result set that is partly assembled in the browser, which this one is whenever the
filters exceed what a single `orderByChild` can express. Raising the bound and re-reading is
correct, stays bounded, and is served from the cache for everything already fetched. Revisit
it when one category is big enough to need a composite index.

**No database or rules change.** `searchText`, `price`, `categorySlug` and `createdAt` were
already indexed from earlier sections, so `deploy:rules` was not needed. A hand-typed
`?sort=` that matches nothing falls back to the default rather than breaking the page.

**Verified with 52 assertions**: search normalisation, prefix-only matching, every category
count against its precomputed `productCount`, the in-stock filter, all four sorts including
tie-breaks and the unrated case, all four filters composing at once, limits and paging, and
what the two controls render. All pass.

**Not built, deliberately:** a price-range filter and size-availability filtering. Size stock
lives on `products/{id}.sizes` and not on the summary, so filtering by it would mean either
reading full products for a grid — which §19 forbids — or adding a denormalised field to the
shared contract, which is Developer B's to agree. Search suggestions and typo tolerance are
not possible on RTDB prefix matching and would need a search service.

### What the Supabase migration delivered (2026-08-29)

The Firebase project was deleted by its owner, so the whole stack moved to Supabase in one
go. Nothing was lost: the database had deliberately always been empty, and the catalog lives
in the frontend.

**Deleted outright:** `functions/` (Firebase Cloud Functions), `firebase.json`, `.firebaserc`,
`database.rules.json`, `secrets/` (the dead service-account key — never committed, checked),
`storefront/src/lib/firebase.ts`, `storefront/src/lib/sources/firebaseSource.ts`, the
`firebase` npm dependency, and all seven `VITE_FIREBASE_*` variables on Vercel.

**Added and VERIFIED against the live project:**

- `supabase/migrations/` — 10 tables, the `product_summaries` VIEW, row level security on
  every table, all 8 data tables published to Realtime, and `place_order()`.
- `supabase/functions/place-order/` — the Edge Function, deployed. Field validation
  (§17: Pakistani mobile format, optional postal code, whitespace-only rejected) lives here;
  the money and the stock live in SQL.
- `storefront/src/lib/supabase.ts`, `lib/sources/supabaseSource.ts`,
  `hooks/useCatalogRealtime.ts`.

**Three things got genuinely better, not just ported:**

1. **`product_summaries` is a VIEW.** The admin dashboard no longer has to keep a
   denormalised copy in sync, so the stale-summary bug is impossible. That obligation is
   removed from Developer B's brief.
2. **Search is substring, not prefix.** Postgres `ilike` over a trigram index means "shirt"
   finds "Oxford Shirt". The Realtime Database could only match the start of a name — the
   limitation flagged for the client after section 13 is simply gone.
3. **Testimonials work.** `firebaseSource.listTestimonials()` had to return `[]` because
   reviews were stored per product with no flat node to read from. It is one indexed query
   here. The "agree a featured-reviews node with Developer B" task is dead.

**One real bug, caught by testing:** `place_order` used `gen_random_bytes()` for the order
number. That is in the `pgcrypto` extension, which is not installed on a stock Supabase
database, so every order failed with "function does not exist". It now uses the built-in
`gen_random_uuid()`. This is exactly why the function was exercised end to end rather than
assumed to work.

**What was verified, and how:** the anon key can read the catalog and gets `[]` from `orders`
and `admins`; inserting an order is refused with `42501`; updating a price affects zero rows.
`place_order` was run inside a transaction that was rolled back — a deliberately falsified
price in the payload was ignored in favour of the database's, delivery came from settings,
and per-size stock decremented by exactly the quantity ordered. **The database was left
empty.**

### Client changes, 2026-08-29

Requested by the client after the Supabase migration, and applied to the demo catalog:

1. **Hoodies is now "Winter Collection"** — slug `hoodies` becomes `winter-collection`, and
   the category tile was renamed with it. Every hardcoded link was repointed (the Hero CTA
   and a promo banner both named the slug directly). Copy across the landing page, the
   categories index and the footer no longer says "hoodies".
2. **Two new categories, Shoes and Trousers, sitting before Essentials.** The order is now
   Shirts, Winter Collection, Shoes, Trousers, Essentials. Seven placeholder products were
   written for them — four trousers, three shoes — with generated flat-lay artwork in the
   existing style, so no category renders empty.
3. **The shirts are oversized drop-shoulder shirts**, so the fit replaces the fabric word in
   every shirt name and the descriptions say so. The client chose this over keeping the
   fabric, having been shown that it makes the five names nearly identical — the
   distinguishing first word (Meridian, Noor, Kohl, Sahil, Marble) is what tells them apart.

**The artwork was drawn, looked at, and redrawn.** The first shoe illustration read as a
wedge rather than footwear, and the second attempt (a stacked pair) merged into one blob.
The one that shipped draws the sneaker on its own canvas at its true proportions — about
2.6 times wider than tall, with the collar dip and tongue notch that make it read as a shoe
— and then rotates it onto the frame, which is what fills a portrait tile without distorting
the silhouette. **If you regenerate this art, look at the output before committing it.**

Verified with 19 assertions: category order and slugs, no category left empty, all 19
products in a real category, every referenced image file present on disk, all five shirt
names carrying the new fit and none still carrying a fabric word, and search still finding
both an old and a new product by name.

### What section 7 delivered

Checkout: `/checkout` and `/order/confirmed`. A guest fills in where the order is going, the
form refuses to submit while anything required is missing or invalid, the `place-order` Edge
Function writes the order, and a confirmation page shows the number and what was bought.
Sections 9 (cash on delivery) and 10 (delivery charges) fell out of it and are done too.

**There is no sign-in on the page and no way to reach one.** Section 7 makes checkout without
authentication mandatory, so a guest and a signed-in customer take the identical path; an
email address is contact detail here, not an identity. The only thing an account would change
is that the Edge Function links the order to it, and that is decided by an `Authorization`
header — `placeOrder(input, accessToken)` already takes one, and passing it is all that
sign-in will have to do here.

**`shared/checkout.ts` is the new file that matters, and it exists because of one failure
mode.** A client that validates more loosely than the server lets a customer fill in the
whole form, press the button, and be rejected by a machine for a reason the form never
mentioned. So the rules — the patterns, the length bounds, the normalisation and *the exact
wording of every message* — are written once and the storefront uses them. Nothing is
validated on the client that the server does not also check; §17's "letters and common name
characters" is deliberately NOT enforced, because the server enforces no charset and a
client-only rule would reject the apostrophes and dots in real Pakistani names.

> **The Edge Function cannot import that file, so it carries the same constants inline.**
> It is Deno, deployed on its own by the Supabase CLI, which bundles only what is under
> `supabase/`. **Changing a rule means changing both files.** The verification harness below
> reads `supabase/functions/place-order/index.ts` as text and asserts that every pattern,
> every bound and every message string in `shared/checkout.ts` appears in it — so drift is
> caught rather than hoped against. Re-run it if you touch either side.

**When an error appears is its own decision.** §17 asks for validation "both as the customer
fills the form and again when they submit", which cannot mean marking a field wrong the
moment it is focused — every field is empty and therefore invalid before it is typed in. A
field starts silent, begins reporting once it has been LEFT (blur) or once submit has been
pressed, and from then on re-validates on every keystroke so the message clears the instant
the value is fixed. A failed submit moves focus to the first invalid field, because on a
phone the offending field is a screen away from the button.

**The server's field errors outrank the local ones, but only until the field changes.** The
Edge Function returns `fields` keyed by form field name; `CheckoutForm` shows those in place,
and retires each one as soon as the customer edits the value it objected to — a complaint
about a value that is no longer there is noise.

**`lib/placeOrder.ts` uses `fetch`, not the Supabase SDK.** `functions.invoke` would do the
same job and pull the SDK into the bundle; the build still reports the `supabase` chunk as
**empty**, so reaching checkout in demo mode downloads nothing extra. The function is
deployed `--no-verify-jwt`, so a plain POST with the anon key is all it needs. **No
`Authorization` header is sent for a guest** — the function reads one only to link an order
to an account, and sending the anon key there would make it spend a round trip looking up a
user that cannot exist.

**Nothing is retried.** A POST that timed out on the way back may or may not have placed an
order, and an order is not a safe thing to guess about — the customer is told what happened
and decides. The one 200-shaped failure (a success with a body that has no order number in
it) says so explicitly rather than showing a confirmation with a blank reference.

**The confirmation page reads a receipt, not the database.** The storefront *cannot* read an
order back: `orders` holds the customer's name, phone and address, and RLS makes it invisible
to the anon key (§17). The response to `place-order` is the only moment the browser ever sees
the order, so it goes into `sessionStorage` — which means a refresh still works, and a tab
opened tomorrow correctly knows nothing. That is also why `/order/confirmed` carries **no
order number in the URL**: a shared or bookmarked link could not load anything. The receipt
deliberately does **not** store the name, phone or address.

The page shows the **server's** total as the figure to pay, and derives the subtotal and
delivery from it — printing the breakdown only when the arithmetic reconciles, so a price
that moved mid-checkout can never print two numbers that do not add up to the third. **It
promises no email**, because there is no mail service on this project.

**Three guards decide whether checkout may be attempted at all**, and none of them is
trusted — the server re-validates, re-prices and re-checks stock inside one transaction
regardless. They exist so the customer finds out early, in words: an empty bag says so
instead of showing a form that cannot be submitted; a bag with an unfulfillable line
disables the form (§11) while leaving the summary's "remove them and continue" control
working, so the way out is on the screen they are already on; and the lines are re-priced
against the live catalog on every render, so a piece that sells out while the form is being
filled in blocks the button before the server has to.

**Four things were shared rather than duplicated (§18):**

- **`components/ui/Field.tsx`** is new and is the only form control in the app — label,
  error, hint, `aria-invalid`, `aria-describedby` and a real `maxLength`. Seven fields would
  otherwise have been seven copies of that wiring, and section 16's review form an eighth.
  It marks the OPTIONAL fields rather than the required ones: most of the form is required,
  so asterisks everywhere would say nothing.
- **`CartLineRow` gained `readOnly`** and **`CartSummary` gained `showActions`**, so checkout
  restates the bag using the same two components the cart page and the drawer render. Editing
  stays in the bag — a quantity stepper beside the confirm button invites a change that
  silently moves the total the customer is about to agree to.
- **The bag's caps moved into `shared/checkout.ts`** (`MAX_ORDER_LINES`, `MAX_QTY_PER_LINE`).
  They were declared in `lib/cart.ts` with a comment saying the server has the same two
  numbers; now there is one declaration and the comment is unnecessary.

**Verified with 153 assertions**: the drift check against the Edge Function's source
(patterns, bounds, messages, normalisation, both caps); every required field blocking the
order when blank AND when whitespace-only; the postal code being optional but format-checked;
five real spellings of a Pakistani mobile accepted and six wrong ones rejected; email
acceptance and rejection; oversized input; punctuation in names; the request carrying only
id, size and quantity and **no price, total or Authorization header**; every server error
code mapping through, including an unknown code, a bodyless 500, a network drop and a 200
with an unreadable body; the receipt's round trip, its rejection of corrupt storage and its
derived subtotal; and what the form, the `Field` primitive, the confirmation page and the
checkout page actually render. All pass. The harness is not committed — it needs storage
stubs, a `fetch` stub and a browser-free React render, which is still not worth a test runner
in the repo.

**Not built, deliberately:** the review link on the confirmation (section 16 — the
`reviewToken` is already stored for it), sign-in (section 7 forbids requiring it, and nothing
else needs it yet), and saved addresses, which need an account. Section 12's success
animation was built afterwards, on top of this page — see its own write-up below.

**Not done, and it is the server's job:** §17 asks for **rate limiting on order placement**.
The Edge Function has none. It belongs there, or in front of it, not in the browser — a
client-side limit is not a limit. Raise it before the shop takes real orders.

### What section 9 delivered

Payment. Requirements section 9 is three sentences — cash on delivery only, no online payment
integration, other methods possibly later — and most of what it asks for had already fallen
out of section 7: the checkout form states the method, the confirmation states it, and there
is no card field anywhere in the application. **Reviewing it as its own section found one
thing genuinely missing, and it was in the database.**

**An order did not record how it was paid.** `orders` had no payment method column at all.
That is invisible while there is one answer and ambiguous forever afterwards: the day a card
option is added, every row written before it becomes a guess. Section 8 also requires the
admin dashboard to show every confirmed order for management, and with no column the only
thing it could print was a hardcoded word.

So the method is now recorded, and the shape is deliberately the cheap one to extend:

```
supabase/migrations/20260829000003_payment_method.sql
    create type public.payment_method as enum ('cod');
    alter table public.orders add column payment_method ... not null default 'cod';
    + an index on (payment_method, created_at desc)
    + place_order() restated: writes the method, and returns it

shared/payment.ts   the TS union, the default, and THE WORDS for each method
```

Adding a second method later is `alter type ... add value` plus whatever collects it — not a
backfill over live orders.

**The browser cannot set it, and that is the point.** `PlaceOrderInput` has no field for it,
the Edge Function forwards only items and the customer, and `place_order()` writes `'cod'`
itself. A client that could name how an order is paid could declare one paid — the same
reasoning that keeps prices and totals server-side (§17).

**`shared/payment.ts` holds the copy, not just the type.** Three surfaces describe the same
order — the checkout form, the confirmation page, and the admin dashboard's order list — and
they must not describe it differently (§18). The form and the confirmation now read their
wording from it instead of each carrying its own sentence, so the label, the blurb, the
"to pay on delivery" heading and the agreement line under the button all have one definition.

**The confirmation reads the order, not an assumption.** It could hardcode "cash on delivery",
since that is the only method there is, but then it would be stating a belief rather than the
order, and would go on stating it after a second method existed. `PlaceOrderResult` and the
stored receipt both carry the method now, and the page renders what came back.

**Every read of the method is tolerant, on purpose.** `paymentMethodOf()` resolves anything
unrecognised — a receipt written by an older build, a response from a database the migration
has not been applied to yet, a value from a future build this bundle has not been taught — to
cash on delivery, because that is what such an order actually was. A confirmation page is not
worth breaking over a field that did not exist last week.

> **`20260829000002_place_order.sql` IS NOW HISTORY.** A Postgres function cannot be patched
> in place, so adding the method meant restating the whole body in `0003`. **Edit `0003`.**
> A note at the top of `0002` says so; a change made there would apply on a fresh database and
> then be overwritten by the later migration.

**Verified with 31 assertions**: the method table and its copy; every tolerant read
(`undefined`, `null`, a number, an unknown future value) resolving to the default; the receipt
round-tripping the method, a legacy receipt with no method reading as COD, and a genuinely
corrupt receipt still being refused; the result carrying the server's method through, and
defaulting when the server omits it; the unreadable-success guard still firing; **the request
body carrying no payment method, no price and no total, and no `Authorization` header for a
guest**; and a drift check that reads the migration as text and asserts the Postgres enum and
the TypeScript union name the same methods, that `place_order` sets the value itself, and that
the Edge Function forwards nothing for it. All pass. Build, typecheck and lint are clean and
the `supabase` chunk is still empty.

**Not done — the migration is NOT applied.** `supabase/migrations/20260829000003_payment_method.sql`
is written and committed but the live database does not have the column yet: applying it needs
`SUPABASE_ACCESS_TOKEN` (section 4), which was not available in the session that wrote it.
Nothing breaks meanwhile — no order can be placed at all while the catalog is demo data, and
the client reads a missing method as COD — but **apply it before the shop takes real orders,
and tell Developer B the column exists.**

**Not built, deliberately:** any second payment method. Section 9 says online payment "may be
added in the future if required", which is not a requirement, and building a card flow nobody
has asked for would mean a provider, a webhook, and a paid-order state machine. The column and
the enum are the whole preparation that is worth doing now.

### What section 11 delivered

Stock and availability, requirements section 11's four asks: stock is tracked (it already
was, per size), availability is displayed, a badge names the state, and an unavailable
product or size cannot be purchased. The last three were already standing from sections 4 and
6 — reviewing this as its own section found that the middle one, "which badge for which
count", **had three different answers depending on which surface you looked at.**

**The bug: "low stock" meant three different things.**

```
product_summaries VIEW (Postgres)   low = total > 0 and total <= threshold
lib/demoData.ts                     low = total > 0 and total <= threshold + 1
SizeSelector                        "only N left" when stock <= threshold
```

At the shipped threshold of 4, a piece with **5 left was "Low stock" in demo mode and "In
stock" against the database.** The badge changed meaning the moment `VITE_DATA_SOURCE`
flipped from `demo` to `supabase` — the one thing a badge must never do — and nothing would
have caught it, because both readings are individually plausible and the drift was between
files that never sit side by side in a diff.

**`shared/stock.ts` is the fix, and it is the same shape as `shared/checkout.ts` and
`shared/payment.ts`: one rule, everything else reads it.**

```
stockLevel(quantity, threshold)   "out-of-stock" | "low-stock" | "in-stock" — the ONE test
STOCK_LEVEL_LABEL                 the badge word for each level
totalStock(sizes)                 units across every size — what a list badge counts
stockInSize(sizes, size)          units in ONE size — what the size selector gates on
availableSizes(sizes)             which sizes can actually be bought right now
joinNames(names)                  "Small and Large" / "Small, Medium and Large"
FALLBACK_LOW_STOCK_THRESHOLD = 4  what to use before settings load — same number the VIEW falls back to
SIZES, SIZE_LABELS                moved here from `lib/sizes.ts`, which now just re-exports them
```

The SQL view is the one copy that cannot import it — Postgres cannot run TypeScript — so it
is the fourth thing that has to independently agree, the same way the Edge Function carries
the checkout rules inline. It already agreed by coincidence (`<= threshold`, fallback `4`);
the drift check described below now holds it to that on purpose rather than by luck. `demoData.ts`
imports the module directly, so the demo catalog cannot re-introduce its own definition.

**Three real gaps closed, not just the drift:**

1. **The badge could not answer section 11's "available product quantity" ask.**
   `product_summaries` had always computed `total_stock` — it was simply never *selected* by
   `supabaseSource.ts`, so nothing above that file could see it. It is now on `ProductSummary`
   (optional, so an older cached summary still renders), and `StockBadge` shows the count
   next to the word **only when stock is actually low** — a full shelf does not need a
   number, a shopper deciding whether to grab the last few does.
2. **The product page told every visitor "Small, Medium and Large" regardless of what was
   actually in stock.** That line was static copy, not data — a piece missing its Medium said
   so nowhere near the size selector two lines above it, which is exactly the gap section 11's
   "the user should be clearly informed" is there to catch. It now reads
   `availableSizes` + `joinNames`, or "None left — every size is sold out."
3. **A stale local `FALLBACK_LOW_STOCK = 4` in `ProductDetailPage.tsx`** duplicated the number
   this section made a shared constant for. Deleted in favour of the import — the kind of
   second copy that section 11 exists to stop happening again.

**No database or rules change was needed.** `product_summaries.total_stock` and the view's
low-stock arithmetic were already correct and already deployed; this section only started
reading the column and stopped restating its rule elsewhere. The grid, search and the in-stock
filter already handled sold-out products correctly (`ProductCard` dims the image and swaps the
hover label, `ProductFilters`' "in stock only" checkbox and the empty-state copy on
`ProductsPage` already covered it) — nothing there needed touching. `useCatalogRealtime`
already watches `product_sizes`, so a size selling out updates every open tab without a
refresh, unrelated to this section but worth confirming it still holds.

**Verified with 95 assertions**: `stockLevel` at, above and below the threshold, with a
negative quantity, `NaN`, and a negative threshold; the labels; `totalStock` and `stockInSize`
against a full and a partial sizes map, including a defensively-clamped negative stored value;
`availableSizes` and `joinNames` for zero, one, two and three sizes; **every demo product's
`inStock`/`lowStock`/`totalStock` checked against `shared/stock.ts` directly** rather than
against its own precomputed value, so the comparison cannot be circular, including the known
sold-out fixture (Kohl Poplin Shirt) and confirming at least one genuinely low-stock product
exists so the assertions are not vacuous; a text-level drift check against the SQL view's
`low_stock` expression and its fallback threshold; and a render check of `StockBadge` (the
count appears only when low and known, never as the literal string "undefined") and
`SizeSelector` (a zero-stock size is genuinely `disabled`, the low-stock announcement names
the right size and count, "every size sold out" renders when it is). All pass. Build,
typecheck and lint are clean.

**Not built, deliberately:** a dedicated "quantity" number on the product page outside the
size selector's own "Only N left in Medium" line — section 11 says the quantity display "may
include" this, and a second number next to the first would be restating it. A stock history or
a "notify me when back in stock" needs a write path, which nothing has asked for and which
every client write is denied by design (section 2).

### What section 12 delivered

The order success animation on `/order/confirmed`, requirements section 12: after an order is
placed the page should feel "modern, visually appealing, and engaging" rather than a plain
message, with an example sequence of a package being packed, a truck arriving, the package
being loaded, and a confirmation. It replaces the static checkmark that sat at the top of the
page since section 7; everything below it — the order number, the pieces, the total, what
happens next — is unchanged, because that content is what the animation is confirming, not
something the animation should compete with.

**It is one component, `features/checkout/OrderSuccessAnimation.tsx`: an inline SVG animated
entirely with CSS keyframes.** No animation library was added — `--animate-rise` and
`--animate-marquee` already established the pattern of naming a keyframe animation as a
`--animate-*` custom property in `index.css`'s `@theme` block, which Tailwind v4 turns into an
`animate-*` utility class for free. Five more were added the same way
(`order-package`, `order-truck`, `order-check-pop`, `order-check-ring`, `order-check-tick`),
each one a comma-separated list of named keyframes with their own duration and delay baked in,
so the whole ~3.5s sequence reads as a timeline in the CSS rather than one keyframe block
juggling every part of the scene against a shared percentage axis.

**The sequence, in order:** a gift-boxed package draws in near a dashed "road" line, a
delivery-truck silhouette drives in from off-canvas and parks beside it, the package fades and
lifts away as if loaded aboard, the truck drives back off-canvas to the right, and a ring-and-
tick confirmation mark — the same shape the old static `ConfirmationMark` used — pops in and
draws itself with a `stroke-dashoffset` animation. Every keyframe animation uses `both` fill
mode, so the scene holds its start frame before an element's delay elapses and holds its end
frame forever after — there is no loop and nothing to clean up.

**`prefers-reduced-motion` needed one more line than the existing global rule had.** The rule
in `index.css` already collapsed every `animation-duration` to `0.01ms`; it did not touch
`animation-delay`, which does not need `reduced-motion` to matter for a one-shot fade but
absolutely does for a five-stage timeline built from staggered delays — without the fix, a
reduced-motion visitor would have sat looking at a near-blank scene for ~2.75 real seconds
(waiting out the checkmark's delay) before everything snapped to its end state in a single
frame. `animation-delay: 0s !important` was added next to the duration override, so a
reduced-motion visitor now sees the finished checkmark immediately instead of a silent wait
followed by a snap.

**Verified by actually running it, not just building it.** The dev server was driven with a
headless Playwright browser (installed to the session scratch directory, not the repo — this
project has no test runner and none was added for one check), a fake receipt was written into
`sessionStorage` under the key `orderReceipt.ts` already uses, and the page was screenshotted
at several points through the sequence. **That caught a real bug the build and lint could not:**
the truck's exit distance (`translateX(260px)`) was short of clearing the 300-unit-wide
viewBox by 20 units, leaving a stray horizontal stub of its floor line visible next to the
finished checkmark in the resting frame. Fixed by lengthening the exit to `translateX(320px)` —
comfortably past the truck's leftmost point (`x=20`) plus the viewBox width. Re-screenshotted
after the fix: package, truck and checkmark all render as intended at every stage, and
`console --errors` was empty throughout.

**No new dependency, no schema change, no Edge Function change.** This section is presentation
only — it reads nothing new and writes nothing. Build, typecheck and lint are clean.

**Not built, deliberately:** confetti or any second flourish on top of the checkmark. The
brand's existing motion vocabulary (`rise`, `marquee`) is understated, and requirements section
12 asks for "modern... engaging", not celebratory noise — the package/truck/checkmark sequence
already answers the brief's own example list. Sound was never a candidate; nothing on this
project plays audio.

### What optional customer accounts delivered

Sign up, sign in, sign out, and an order history page — the client request added to
requirements section 12 on 2026-08-29 ("Sign-in and sign-up are not in the original brief but
are now requested... an account only lets a customer see past orders and skip re-typing their
details next time"). **Guest checkout (section 7) is untouched.** Nothing about the checkout
form, the Edge Function's guest path, or `/checkout` itself required for a guest changed —
accounts are strictly additive.

**The backend was already built, and had been since the Supabase migration.** This is the one
genuinely surprising thing about this piece of work: `orders.user_id`, the RLS policy
`customers read their own orders` (`user_id = auth.uid()`), the matching policy on
`order_items`, and `place_order(p_user_id uuid default null)` were all already in
`supabase/migrations/20260829000001_init.sql`, and the `place-order` Edge Function already
read an `Authorization` header and forwarded the user id — all written in anticipation of this
feature months of section-work ago, unused until now. **Zero migrations were needed.** The
entire task was the identity layer and the UI in front of infrastructure that was already
correct and already deployed.

**Email/password, via Supabase Auth, decided on the spot.** Google needs an OAuth app
registered externally with a client id and secret nobody had; phone needs an SMS provider.
Neither was available, and email/password needed neither.

**Sign-up auto-confirms — no email verification step.** Supabase's Auth settings were changed
via the Management API (`mailer_autoconfirm: true`, plus `site_url` and `uri_allow_list`
updated from `localhost:3000` to the production URL): the project has no configured mailer of
its own, and Supabase's shared default one is rate-limited and not meant for real signup
volume — exactly the reasoning that already keeps this project from promising an order
confirmation email (section 7's notes). Asked Huzaifa directly before making this change,
since it is a live change to the project's security settings, not a code change; he chose
auto-confirm. **Password reset is NOT built** for the identical reason — it is a genuine
one-off email with no way around sending one, and there is nowhere to send it from yet. Build
it once the client supplies SMTP credentials.

**Identity has no "demo mode", and that has a real bundle-size cost.** `lib/queries.ts` keeps
the Supabase SDK out of the bundle entirely while `VITE_DATA_SOURCE=demo` (sections 2 and
19), because there is a real alternative catalog to read instead. There is no alternative
identity provider — an account is either backed by the live Supabase project or it does not
exist — so `AuthProvider` dynamically imports `lib/supabase.ts` on mount, on every page,
regardless of the data source, to know whether anyone is signed in. **The `supabase` chunk is
no longer empty in demo mode.** The production build now ships a real ~217 kB (~57 kB gzip)
`supabase` chunk that downloads on every visit. The import stays dynamic rather than static —
it does not block first paint, and it is not in the main bundle — but it is no longer
optional. This is a real, deliberate cost of building this feature, not an oversight.

**The shape mirrors `CartContext`/`CartProvider` exactly (§18):** `features/account/
AuthContext.ts` holds the context and the `useAuth()` hook, `AuthProvider.tsx` binds Supabase
Auth to it. `getSupabase()` in `lib/supabase.ts` switched from `persistSession: false` to
`true` (with `autoRefreshToken` and `detectSessionInUrl`) — checkout's guest path never reads
this session at all, so nothing there changed, but a real login now survives a refresh, which
it could not before. `hasSupabaseConfig()` moved to a new dependency-free `lib/env.ts`, so
`AuthProvider` can check it BEFORE the dynamic import the same way `useCatalogRealtime`
already did — importing it from `lib/supabase.ts` directly would have pulled the whole SDK in
statically, defeating the lazy-load it exists to enable.

**What an account unlocks, precisely what the client asked for and nothing more:**

1. **Order history**, at `/account` — `lib/myOrders.ts`, a new module rather than a
   `CatalogSource` method, because unlike the catalog, an order has no demo-mode equivalent:
   at the time this was written, checkout always wrote through the real Edge Function
   regardless of `VITE_DATA_SOURCE`. **That changed on 2026-08-30** — `lib/placeOrder.ts` now
   simulates an order locally in demo mode (see that write-up) — but `lib/myOrders.ts` itself
   is unaffected: it still only ever reads Supabase, so a demo order (which is never written
   there) correctly never appears in order history. **Security is
   the RLS policy, not this file** — it runs `select * from orders` with no `user_id` filter at
   all, because the policy already scopes it to `auth.uid()`; a guest or another customer's
   session gets `[]`, never an error and never someone else's order. Verified live: a fresh
   test account correctly saw "You have not placed an order yet."
2. **Skip re-typing details.** `CheckoutForm` gained an `initialValues` prop, read once via a
   lazy `useState` initializer — re-applying it after the customer has started typing would
   overwrite what they typed. `CheckoutPage` builds it from the signed-in customer's most
   recent order (name, phone, address, city, postal code) plus their account email as a
   fallback when there is no order yet. `CheckoutPage` now also waits on that read (`preparing`
   folds in `!authReady`) before showing the form, so the skeleton holds a beat longer for a
   signed-in customer rather than the form flashing empty and then refilling itself under
   their cursor.
3. **A "Sign in to use your saved details" line above the form for a guest** — the only
   sentence checkout says about accounts at all — linking to `/account/sign-in?next=/checkout`
   so signing in returns them to where they were, not to `/account`.
4. **The order itself gets linked.** `placeOrder(input, accessToken)` already had this
   parameter, unused since section 7; `CheckoutPage` now passes `useAuth().accessToken`, which
   is `undefined` for a guest — no header sent, identical to before.

**The header (requirements section 12's literal ask: "add login/signup... in the header")**
gained one icon, `AccountMenu`, after search and before the bag — a person-outline glyph
linking to `/account/sign-in` when signed out and `/account` when signed in, with a small gold
dot marking the signed-in state so it reads at a glance without a label. `AccountMobileLink` is
the same state as a text row in the phone menu (section 15), since the icon carries no label
there. Nothing renders while the session is still resolving, so a visitor never sees "Sign in"
flash to the signed-in icon a moment later on a return visit.

**Verified against the live project, not just built.** A headless Playwright browser (the same
approach section 12 used) drove the real flow against `https://owbnbzutqslihhnzdnyo.supabase
.co`: signed up a test account, confirmed it landed signed-in on `/account` with no email step,
confirmed the header icon updated with the gold dot, confirmed order history rendered the
correct empty state, signed out, signed back in, added a product to the bag and confirmed a
**guest** saw the sign-in prompt on `/checkout` while a **signed-in** customer did not and had
the email field pre-filled from their account. Zero console errors throughout. The three test
accounts this created were deleted from `auth.users` afterward via the Management API — the
database was left exactly as this project's convention requires: empty.

**Not built, deliberately:** password reset (needs an email provider — see above), saved
addresses as their own feature (the requirements note only promised "skip re-typing... next
time", which the most-recent-order prefill already delivers without inventing a new data
model — a dedicated address book is a bigger, separate design, per the existing open question
below), and any social login (no OAuth app registered). Section 16's review form can reuse
`useAuth()` unchanged when it is built.

### What section 15 delivered

Mobile responsiveness, requirements section 15's ask: the whole site works on phones, tablets,
laptops and desktops, with particular attention to navigation, product grids, filters and
search, product pages, cart and checkout, and the order confirmation animation. Nearly all of
that was already true going in — every section from 1 onward was built mobile-first and says so
in its own comments (`CategoryNav`'s horizontal-scroll chips, `ProductFilters`' native
`<select>`, `Header`'s `lg:` breakpoint for the hamburger menu, and more) — so this section is an
**audit pass across the whole site**, not a rebuild.

**Verified by actually rendering the site, not by reading the CSS.** A headless Playwright
browser (the same approach sections 7, 12 and the accounts work used) drove the real dev server
at four breakpoints — 375px (phone), 768px (tablet), 1280px (laptop) and 1600px (desktop) —
across every page: home, the catalog, a filtered category, a product detail page, categories,
the cart and checkout both empty and with a line in them, an account page, and the
order-confirmed animation. Every page was checked for console errors and for
`document.documentElement.scrollWidth` exceeding the viewport — the actual definition of "not
responsive," not an eyeballed screenshot.

**One real bug, and it only showed up at 320px.** Every tested page overflowed horizontally by
the same ~49px at a 320px viewport (the oldest iPhone SE and some budget Android widths — still
sold in Pakistan, this brand's market) and nowhere wider; 375px and up were already clean. The
cause was identical on every page because it lives in the one thing every page shares —
`Header.tsx`. The full wordmark logo (~149px) plus the four header icons (search, account, bag,
hamburger — 172px, each at the 44px minimum touch target) do not fit in a 320px screen's ~288px
of content width once the container's padding is subtracted, and a flex row does not shrink
below its content's natural width. The row pushed the hamburger button off the right edge of the
screen entirely — the one control a phone visitor needs to reach the nav was not reachable
without first scrolling the whole page sideways, on the narrowest phones this store's own market
is more likely than most to have in use.

**Fixed with a breakpoint swap, not a redesign.** Below 375px the header now shows the bare
monogram (`Logo variant="mark"`, 36px) instead of the full wordmark; at 375px and up nothing
changed — that is still the vast majority of phones in use. Both variants render, and Tailwind's
`min-[375px]:hidden` / `hidden min-[375px]:inline-flex` toggle which one is visible.
`display:none` removes the hidden one from the accessibility tree entirely, so nothing is
double-announced to a screen reader — the outer `Link`'s own `aria-label="Velora Wears — home"`
names it either way.

**Everything else checked out clean, because it had already been built with this in mind:** the
mobile nav (hamburger below `lg:`/1024px — deliberately below tablet width too, since five nav
links plus four icons do not fit at 768px either), the category chip row (horizontal scroll
below `sm:`, wraps above it), the sort control (a native `<select>`, so a phone gets the
platform's own picker instead of a bespoke list), the product grid (2 columns on a phone, up to
4 on desktop), the checkout form (single column on a phone, paired fields — email/phone,
city/postal — from tablet up), the cart drawer and page, and the order-confirmed animation (an
SVG `viewBox`, so the package/truck/checkmark sequence scales with its container at every width
tested, 320px to 1600px).

**No database, schema, or Edge Function change.** This section is presentation only. Build,
typecheck and lint are clean.

**Not built, deliberately:** a dedicated tablet-specific product-grid column count (2 columns at
768px reads a little sparse on an iPad, but changing it is a one-line class with no functional
stakes, and nothing about it actually broke); support for viewports narrower than 320px, which
no shipping device uses.

### What section 16 delivered

Reviews and ratings — the customer-facing half. Requirements section 16 asks for four things: a
review tied to a confirmed purchase rather than an account, so both a signed-in customer AND a
guest can leave one; a star rating and a comment, shown with a display name and never an email;
one review per product per order; and the review being editable or removable "within a
reasonable window." **All four are built and deployed.** The read half — the average, the count,
the list on the product page — was already built in section 2 and reviewed again in section 11;
this section is the write path.

**The read side had a real gap that reviewing it here closed first.** The `product_summaries`
VIEW, the RLS policy hiding non-visible reviews, and `listReviews`/`listTestimonials` were all
correct already — nothing there needed touching. What did not exist anywhere was a way to WRITE
one. `reviews` has always had no insert/update/delete policy for anon or authenticated, on
purpose, for the identical reason `orders` has none: a write that decides money, stock, or — here
— provenance ("did this person actually buy this?") must not be a client's word for it (section
17). So this section is, in shape, a second `place-order`: a new Edge Function,
`submit-review`, holding the service role key, and nothing above it changes.

**The interesting design problem was proving a GUEST owns an order, since a guest has no
`auth.uid()` for RLS to key off.** Three paths, all resolved server-side, never trusted from a
client-supplied id alone:

```
signed in     Authorization header -> the user's own orders, found by user_id
              (mirrors orders' own RLS policy, just run in the function because
              the WRITE needs service role regardless of how ownership is found)

guest, fresh  orderId + reviewToken, exactly what place-order handed back and
              lib/orderReceipt.ts already had sitting in sessionStorage — no
              new state, just a new use for state that existed since section 7

guest, later  order number + email, which requirements section 16 asks for by
              name ("the guest should be able to verify with their order
              number together with the email address used on the order")
```

The third path needed a genuine new capability: `orders` has no select policy for anon at all, so
a guest returning days later with no session and no `sessionStorage` cannot be handed anything
without one. `find_order_for_review(order_number, email)` is a new `SECURITY DEFINER` Postgres
function — the same trick `is_admin()` already uses to read a table its caller cannot — that
returns exactly enough to open a review form (`order_id`, `review_token`, and which products were
in the order) and nothing that touches the customer's name, phone or address. It is called
straight from the browser over PostgREST's RPC endpoint with the anon key, because it only reads;
the actual write still goes through the Edge Function regardless of how the order was found.

**One component, `ReviewComposer`, is reused in all three places a customer can write a
review** (requirements section 18): the order confirmation page (per item, `orderId` +
`reviewToken` straight from the receipt), order history at `/account` (per item, session
identity — reuses `listMyOrders()`, the same read the accounts work already built, rather than a
new query), and the product page itself via a new `WriteReview` wrapper that decides which of the
three paths applies (signed in with a qualifying order, signed in with none yet, or a guest who
needs to verify). What differs between the three call sites is only how ownership is proven; the
form, the validation, the edit/remove state and the star picker are one implementation.

**Editing is an upsert, not a second code path.** `submit-review` looks for an existing row at
`(order_id, product_id)` — the same unique constraint that has enforced "one review per product
per order" since the initial schema — and updates it in place if one exists, insert if not. **An
edit always writes `hidden: false`.** If an admin had hidden an earlier version of a review as
spam and the customer edits it, that is a new statement and goes back in front of moderation
rather than staying invisible forever over words that no longer exist; the admin dashboard sees
it again and can act on the new version if it is still a problem. This function never sets
`hidden: true` itself — only an admin does, and that UI is section 8's.

**The edit/removal window is thirty days**, a genuinely new decision this section had to make
(`REVIEW_EDIT_WINDOW_DAYS` in `shared/reviews.ts`) — section 16 says "a reasonable window"
without naming one. Thirty days comfortably covers the seven-day exchange window already
advertised on the site, with room for an opinion to settle before it locks. The Edge Function is
the one that actually enforces it (an expired edit or delete is rejected with `EDIT_WINDOW_EXPIRED`
regardless of what the client thinks); the client also checks it, only so a customer is not shown
an "Edit" button that is going to fail.

**Same shape as `shared/checkout.ts` and `shared/payment.ts`, and the same reason: `shared/
reviews.ts` is the one definition of what a valid review is, and `submit-review/index.ts` cannot
import it** — Deno, bundled on its own by the Supabase CLI, which only sees `supabase/`. The
bounds are inlined there with a comment saying so, same as checkout's. **Changing a rule means
changing both files.**

**Verified against the live project, the same way `place_order` was in the Supabase migration —
not just built.** `SUPABASE_ACCESS_TOKEN` was available this session, so:

1. `supabase/migrations/20260829000004_reviews.sql` was applied via the Management API — the
   `reviews.updated_at` column and its `touch_updated_at` trigger, and `find_order_for_review`,
   confirmed `SECURITY DEFINER` with `EXECUTE` granted to `anon`.
2. `submit-review` was deployed with `--no-verify-jwt` (guest reviews need to work without a
   session, the same reasoning `place-order` already documents).
3. A temporary category, product, order and order item were inserted directly by SQL — the same
   "seed it, exercise it, delete it" pattern the Supabase migration used to verify `place_order`.
   Against that fixture: `find_order_for_review` returned the right order for the right
   order-number-and-email pair and `[]` for a wrong email; the guest token path created a review;
   calling it again with the same order and product UPDATED the same row rather than creating a
   second one (`created_at` unchanged, `updated_at` moved, still exactly one row); a wrong
   `reviewToken` was rejected `403 NOT_PURCHASED`; a too-short comment was rejected `400
   VALIDATION` with a field-level message; delete removed the row; deleting again correctly
   404'd. A real test account was then signed up, the fixture order was linked to it, and the
   SESSION path was exercised the same way — upsert with no `orderId` in the body at all, resolved
   purely from the `Authorization` header, then deleted.
4. A direct anon `POST` to `/rest/v1/reviews` was retried and still refused with `42501` — RLS is
   unchanged, and the Edge Function is still the only way in.
5. Everything from step 3 was deleted afterward — the review, the order item, the order, the
   product, the category, and the test auth user — and the counts were confirmed back to zero.
   **The database was left exactly as this project's convention requires: empty.**
6. The UI itself was smoke-tested with a headless browser both before and after deployment: before,
   the guest-verify form and the composer rendered and interacted correctly while surfacing the
   expected network/CORS failure (nothing was live yet); after, the identical flow against a
   fabricated order correctly showed the server's own rejection message
   ("We could not verify this order for this product.") instead of a crash — proving the error
   path a real customer would hit (an old or mistyped confirmation) renders as words, not a blank
   screen.

**Not built, deliberately, and why each one is out of scope here:**

- **Admin moderation — hiding or removing a review.** This is requirements section 16's own
  "Admin" subsection, and section 20's ownership table puts the admin dashboard on Developer B in
  full (section 8). The database side of this was already done, from the very first migration:
  the `hidden` column exists, `"visible reviews are public"` already excludes it from every public
  read, and `submit-review` never touches it either way. The only missing piece is the UI a
  moderator would click, which belongs in the admin dashboard, not here. **Tell Developer B**: the
  column and the policy are ready, nothing needs to change on the database side for that feature.
- ~~Rate limiting on review submission.~~ **Built in section 17 — see its write-up below.**
- **Sorting or filtering the review list itself** (newest first is what `listReviews` has always
  done) — section 16 does not ask for it, and the six-review display limit on the product page
  makes it moot today.
- **A dedicated "my reviews" page.** A customer's reviews are reachable from where they were
  written — order history and the product itself — which is what section 16 asks for; a
  standalone list across every product nobody has asked for.

### What section 17 delivered

Validation and security — a review of everything requirements section 17 asks for, across the
whole site, not one new feature. Most of it was already true, built as a side effect of sections
7 and 16 doing their own jobs properly: required-field validation on blur and on submit,
whitespace-only treated as blank, the server re-validating everything and never trusting a
price or a total, stock re-checked at the moment of confirmation, RLS closing every table to
direct client writes, and customer PII never publicly readable. **What this section found and
built is the specific things that review turned up as genuinely missing.**

**Rate limiting on order placement and review submission — the gap flagged since section 7,
finally closed.** "A client-side limit is not a limit" (section 17's own words), so this had to
live inside `place-order` and `submit-review` themselves, backed by something durable enough to
survive being called from however many separate instances a serverless function spins up — an
in-memory counter in the function would not do, because two concurrent invocations on two
different instances would each see zero and both let a request through. Postgres is that durable
store, because it is the one thing both functions can already reach without adding a queue, an
external rate-limiting service, or any infrastructure this project does not already have
(deliberately no Docker, no service beyond Supabase).

```
rate_limits              key ("<bucket>:<ip>"), window_start, count — one row per caller
                          ever seen, upserted in place, not one row per request
check_rate_limit()       atomic fixed-window counter (SECURITY DEFINER). One
                          insert-on-conflict statement, not select-then-update, so two
                          requests arriving at the same instant cannot both read zero
```

`place-order`: 8 orders per 15 minutes per connection. `submit-review`: 15 per 15 minutes (a
customer reviewing every item from a large order, plus a couple of edits, still fits). Both are
checked FIRST, before any field validation — a flood of malformed requests is rejected as
cheaply as possible rather than after the more expensive checks. **A real bug was caught by
testing rather than assumed away**: `submit-review`'s check was originally written after the
`productId` presence check, so an empty or malformed body short-circuited before the rate limit
ever ran — seventeen deliberately-empty requests all came back `VALIDATION`, never
`RATE_LIMITED`. Reordered to check first, matching `place-order`, and reverified: fifteen
requests validated normally, the sixteenth and seventeenth were rejected.

**A second gap, not flagged anywhere before this review found it: `find_order_for_review` had no
protection at all.** It is the one place in the whole schema an anonymous caller can invoke
directly with zero server-side code in front of it (section 16's guest "verify with your order
number and email" path) — which also makes it the one place guessing wrong is exactly what
brute-forcing a stranger's order would look like. It now rate-limits itself, from inside the
SQL function, at 20 attempts per 15 minutes — reading the caller's IP via
`current_setting('request.headers', true)`, which is how PostgREST exposes request headers to a
function body. **Verified live**: the 21st and 22nd of 22 identical lookups came back rejected
with the rate-limit message; a genuine lookup afterward (after the test bucket was cleared)
still worked.

**A real hole in `check_rate_limit()` itself, caught before it shipped rather than after**:
Postgres grants `EXECUTE` on a newly created function to `PUBLIC` by default, unlike a table,
where RLS closes things by default. Left alone, ANY authenticated or anonymous caller could have
called `check_rate_limit('place-order:203.0.113.5', 1, 999999999)` directly — not to bypass their
own limit, but to exhaust a **different, real customer's** bucket and get them wrongly
rate-limited. Caught by checking the actual grants after applying the migration rather than
assuming the explicit `grant ... to service_role` was the only one that mattered; fixed with an
explicit `revoke all ... from public` right beside the grant, live and in the migration.

**Sanitisation, requirements section 17's "sanitise and escape all customer-supplied text...
before storing or displaying it."** Escaping was already handled — nothing in `storefront/` uses
`dangerouslySetInnerHTML`, so React escapes every piece of customer text on render regardless of
what is stored, and this section confirmed that by checking rather than assuming it. Sanitising
BEFORE storing was the real gap: `cleanField`/`cleanReviewText` trimmed and collapsed whitespace
but let control characters and invisible Unicode (zero-width characters, the byte-order mark)
straight through. `shared/sanitize.ts` strips them now, called from both `shared/checkout.ts` and
`shared/reviews.ts`, with the same pattern inlined in both Edge Functions (the usual reason:
Deno cannot import `shared/`). **Verified live** by submitting a review with a name and a comment
built from Python with literal NUL, BEL and zero-width characters embedded — both came back
clean.

**Public review reads no longer expose `user_id` or `order_id`.** Neither is "personal data" the
way an email or a phone number is — section 17's own example is "email, phone, address" — but
neither had any reason being public either: `order_id` lets a stranger tell two reviews came
from the same order, and `user_id` is a stable identifier a stranger could use to correlate one
customer's reviews across products. `listReviews`/`listTestimonials` in `supabaseSource.ts` used
to `select("*")`; they now name exactly the columns `ReviewCard` and the testimonials strip
actually render. **This is an application-level minimisation, not a database-level lock** —
directly querying `/rest/v1/reviews?select=*` with the anon key still returns both columns, since
RLS is row-level, not column-level, and both fields are needed internally (`order_id` by
`getExistingReview` in `lib/reviewLookup.ts`, checking the reviewer's OWN review for one order
they already know, which rightly keeps `select("*")`). Verified live: the same row returned both
columns under `select=*` and neither under the storefront's actual column list.

**Rate limiting on SEARCH is the one thing section 17 asks for that is NOT built, and it is a
genuine architectural limitation, not an oversight.** Search is not a separate endpoint — it is
`listProducts` with a `search` option, reading `product_summaries` straight over PostgREST with
the anon key, the exact same read every plain category browse already makes (sections 2, 18 and
19's whole point: the public catalog is fast because nothing sits between the browser and
Postgres). There is no server-side code in that path for a check like `check_rate_limit` to run
inside, unlike `find_order_for_review`, which is a single well-defined function and could embed
one. The two ways to add it would be routing search through a new Edge Function (which is what
section 19 explicitly designed AGAINST for the whole catalog) or Supabase's paid API gateway
rate-limiting, not available on the free tier this project runs on. **Raise this with the client
if search abuse becomes a real problem** — the fix is a real architecture decision, not a
follow-up task.

**No demo/frontend change, and no change to the review or checkout UI.** Every fix here is
server-side or in the shared validation modules; a customer filling in a form or writing a
review sees nothing different except a clearer message if they are the rare case hitting a
limit. Build, typecheck and lint are clean.

**Verified against the live project, all of it, 2026-08-29**: the migration
(`20260829000005_rate_limits.sql`) applied, both Edge Functions redeployed, and — with a fresh
temporary order created and then fully deleted, the same pattern every prior section's
verification has used — every limit was actually tripped (not just read as code and assumed to
work): 8-then-rejected on `place-order`, 15-then-rejected on `submit-review`, 20-then-rejected on
`find_order_for_review`; sanitisation confirmed by round-tripping genuinely dirty input; the
column restriction confirmed by comparing `select=*` against the storefront's real query
side-by-side. **The database and the rate-limit table were both confirmed empty afterward.**

**Not built, deliberately:** rate limiting on search (above); a cleanup job for old
`rate_limits` rows — the table's size is bounded by distinct callers ever seen, not by request
volume, since each key is upserted in place rather than inserted fresh per request, so this is a
minor housekeeping item rather than an unbounded-growth risk, worth revisiting only if it
actually becomes one.

### What the section 18/19/20 audit delivered

Sections 18 and 19 are not features — they are the standards every section from 1 to 17 was
already built against, restated in the requirements as their own numbered sections. With 1-17
done, this was a dedicated pass across the finished tree checking whether that held, the same
kind of audit section 15 did for responsiveness rather than new work. Section 20 is a
responsibilities document, not code — there is nothing to build, only to confirm this side of
the contract is honest.

**Section 19 (performance): one real gap, found and fixed.** Every index requirements section
19 asks for ("Any column used for filtering or ordering needs an index") was checked against
every read in the codebase, migration by migration. Four of `orders`' five read paths already
had one — `orders_created`, `orders_status`, `orders_email` cover search, moderation and the
guest review lookup. The fifth did not: `lib/myOrders.ts` (`listMyOrders()`, the order-history
read the optional-accounts work built) selects from `orders` ordered by `created_at desc`, and
is filtered entirely by the RLS policy `user_id = auth.uid()` rather than by an explicit
`.eq()` in application code — which is exactly why it was missed the first time around: it
never showed up in a grep for `.eq(` or `.order(` in `myOrders.ts` itself, because the filter
lives in the policy, not the query. `supabase/migrations/20260829000006_orders_user_index.sql`
adds `orders_user on orders (user_id, created_at desc) where user_id is not null` — partial,
because a guest order's `user_id` is always null and this policy never matches those rows, so
indexing them would be pure waste. **Written and committed; NOT yet applied to the live
project** — same state section 9's `payment_method` migration sat in before a session had
`SUPABASE_ACCESS_TOKEN` to apply it with. Nothing breaks meanwhile: the query is already
correct, only slower than it needs to be, and no real customer has enough orders yet for it to
be felt. Apply it the next time the token is available, the same way as any other migration
(section 4).

Everything else checked out clean: every list view already reads `product_summaries`, never
the full `products` table (§19's list/detail split); the `Image` component makes `width`/
`height` compulsory and defaults every image to `loading="lazy"`/`decoding="async"`, with
`eager` as the deliberate opt-in used only for the hero and the gallery's first frame; the
production build still shows one chunk per route plus `react` and `supabase` split into their
own vendor chunks (confirmed by re-running `npm run build` for this audit, not assumed from an
old note); and `lib/queries.ts`'s cache plus `useCatalogRealtime`'s invalidation are unchanged
and still the only data-fetching path.

**Section 18 (component reuse): nothing found.** Checked for the specific failure mode this
section exists to prevent — the same visual pattern written twice instead of shared. No
hardcoded hex/rgb colour literal exists anywhere under `storefront/src` outside `index.css`'s
token definitions (grepped, not eyeballed). The handful of raw `<button>` elements outside
`components/ui/Button.tsx` (the size selector's chips, the quantity stepper, star pickers, icon
buttons in the header and cart drawer) are not instances of the shared button being redrawn —
each is a distinct control with its own layout that `Button`'s API was never meant to cover,
which is the same reasoning section 1's `buttonClasses()` note already draws around
link-buttons. Build, typecheck and lint stayed clean throughout (re-run for this audit, not
assumed).

**Section 20: a responsibilities table, not a build — confirmed honest rather than "built."**
Its two obligations on us are that `shared/types.ts` and `supabase/migrations/` stay the joint
source of truth and that a change to either is flagged for Developer B, and that "whoever
writes a new query adds the matching index in the same migration" — which is precisely the rule
this audit just found one exception to and fixed. Every additive contract change made across
sections 1-17 (`Category.description`, the `payment_method` column and enum, the `reviews.hidden`
column and its RLS policy) is already flagged in the open questions below with an explicit
"tell Developer B" note; nothing new needs adding there. **There is no admin-dashboard code to
write here** — section 20's ownership table puts it on Developer B in full, same as section 8.

**Not built, deliberately:** anything resembling admin-dashboard scaffolding. Section 20 assigns
that to Developer B "in full," and building placeholder admin UI on spec would be guessing at a
spec section 8 says is still pending from the client.

### Client changes, 2026-08-29 (second round)

Five small requests relayed from the client, applied on top of the finished sections 1-20:

1. **Real social links and contact details, replacing the placeholders sections 2 and 5's
   notes flagged.** The footer's social row now links to the brand's real Instagram
   (`instagram.com/velora_wear_closet`), TikTok (new — a fourth icon added, matching the
   existing hand-drawn stroke-icon style of the other three) and Facebook, plus the real
   WhatsApp number as a `wa.me` link (`WHATSAPP_NUMBER` in `Footer.tsx`, `923379370312`). The
   Contact column's phone line became a labelled WhatsApp link (that is the one number the
   client gave; there is no separate landline), and the invented "Lahore, Pakistan" became "Wah
   Cantt, Pakistan" — the brand's real location. **The landing page's Instagram strip
   (`features/home/InstagramStrip.tsx`) had the identical placeholder handle hardcoded a
   second time** — its own "NOTE FOR HUZAIFA" flagged it since section 2 — and is fixed too, so
   the two Instagram links on the site cannot disagree. The support email
   (`hello@velorawears.pk`) is still a placeholder; the client did not supply a real one.
2. **A "Buy now" button beside "Add to bag"** on the product detail page
   (`pages/ProductDetailPage.tsx`) — the only add-to-cart control in the app (product cards
   link to the detail page, they never had their own). Same size/stock gate, same cart write;
   "Add to bag" still opens the drawer and keeps the visitor on the page, "Buy now" (`accent`
   variant — the gold used sparingly for emphasis, matching `index.css`'s own description of
   that token) skips the drawer and calls `useNavigate()` straight to `/checkout`, which reads
   the bag exactly as it does from the drawer or the cart page — nothing about checkout itself
   changed. Verified with a headless browser: selecting a size and clicking "Buy now" landed on
   `/checkout` with the item already priced in the order summary.
3. **The wordmark's "WEARS" line was too small under "VELORA."** `components/brand/Logo.tsx`
   sizes it in one place, reused everywhere the logo appears (header, footer, favicon share
   image) — bumped from `text-[0.5rem]` to `text-[0.6875rem]`. Still visibly the secondary word
   under the display-serif "VELORA," just no longer near-illegible at header size.
4. **The base canvas was pure white (`#ffffff`), not the "soft cream canvas" `index.css`'s own
   brand-direction comment already claimed it was** — the client's "not too light, not too
   dark" note was really flagging that mismatch. `--color-canvas` is now a warm ivory
   (`#fdfbf7`), and `--color-canvas-alt` / `--color-canvas-deep` were deepened slightly
   alongside it (`#f6f0e8`, `#ede3d5`) so the three tiers still read as distinct steps rather
   than converging into one shade. Nothing else in the palette moved — ink, brand plum and the
   antique-gold accent were already the "premium, editorial" read the brand direction asks for;
   this was specifically about the background reading as sterile white rather than warm.
   **Verified visually**, not just by reading hex values: a headless Playwright browser
   screenshotted the home page, the product page and the footer against the live dev server
   before calling this done.
5. **Not requested, found while doing #1**: nothing else — the audit above only turned up the
   one duplicate Instagram handle, already fixed as part of #1.

No schema, Edge Function, or query change — everything here is presentation and static contact
data. Build, typecheck and lint stayed clean throughout; re-verified after each change, not
just at the end.

### Client changes, 2026-08-29 (third round — design)

The client's reaction to round two: the theme still was not right, the sort dropdown looked
like a plain browser control, the header looked broken, and "Wears" should match "Velora," not
just be bigger than it was. Plus one bug Huzaifa found by using the site: toggling a filter on
`/products` jumped the page back to the top. Handled as five fixes, verified with a headless
browser at every step rather than assumed from reading the CSS:

1. **The theme, properly this time.** The first attempt (a flat, barely-off-white ivory) missed
   what the client actually meant — round three's own feedback pointed at the **hero section's**
   look specifically: a warm base plus soft blurred colour washes, an atmosphere, not a flatter
   swatch of the same near-white idea. `index.css`'s `body` rule now carries two fixed,
   low-opacity `radial-gradient`s built from the hero's own two decorative blobs
   (`--glow-accent`, `--glow-brand`) sitewide, so the whole page reads like one continuous warm
   room instead of the hero having an effect no other section gets. The three canvas tiers were
   also pitched more deliberately warm (`#faf5ee` / `#f1e7d8` / `#e6d7bf`) rather than nudged a
   few percent off white.
2. **The sort dropdown is a themed control now, not the browser's.** A native `<select>`'s own
   popup cannot be restyled — that was always true, and section 14's original notes accepted it
   on purpose for the keyboard support and the phone's native picker sheet it gave up nothing
   for. The client's reaction was that an unstyled white-and-blue popup stood out badly on a
   site that never shows one anywhere else. `components/ui/Select.tsx` is new: a hand-built
   `role="listbox"` popover following the WAI-ARIA "listbox with button" pattern, rebuilding
   (not dropping) arrow-key navigation, Home/End, Enter/Space, Escape, and closing on an outside
   click. `ProductFilters` is its only caller today; anywhere else a themed dropdown is needed
   should use it rather than a second native `<select>` (section 18).
3. **The header is solid, not translucent.** It was `bg-canvas/85 backdrop-blur-md` — a
   semi-opaque sticky header lets whatever is scrolled underneath tint it unevenly, which is
   most visible right at the top of the page where the hero's own colour washes sit directly
   behind it. Reported as the header "not covering the complete width"; a DOM measurement
   during this fix confirmed the header genuinely spans full width with no layout gap, so the
   report was about colour consistency, not a sizing bug. Now a flat `bg-canvas` with
   `shadow-card`. **The browser's own scrollbar was the other half of that same complaint** —
   Windows Chrome/Edge draws an unstyled grey scrollbar that reads as a mismatched seam against
   a now-warm page; it is themed via `scrollbar-color` (Firefox) and `::-webkit-scrollbar*`
   (Chromium) in `index.css`.
4. **"Velora" and "Wears" are the same size now**, not a headline over a caption.
   `components/brand/Logo.tsx` sets both lines to `font-display text-lg tracking-wordmark`,
   split only by colour (ink vs. the antique-gold accent) — one two-line wordmark rather than a
   word and a footnote. Re-checked at 320px/375px/768px (the widths section 15's own audit
   used) for overflow: none, and the mark-only fallback below 375px is unaffected since it never
   renders the wordmark at all.
5. **The hero's floating review card is gone**, on the client's own call ("the review should not
   show"). One hardcoded quote pinned over the hero image duplicated what the real
   `Testimonials` section below already does properly, from actual review data rather than one
   fixed string — cutting it also declutters the hero now that the page's warmth comes from the
   background itself rather than needing a card to add visual interest.
6. **Bug: toggling a products-page filter scrolled to the top.** `ScrollToTop` resets scroll on
   any change to the URL's `search`, which is correct for a category link or a fresh search but
   wrong for refining a grid the visitor is already partway down — sort and the in-stock
   checkbox go through the identical `setSearchParams` call a category change does, so
   `ScrollToTop` could not tell them apart from the URL alone. Fixed with a `history.state` flag
   (`preserveScroll`) that `ProductsPage.updateParams` sets only for the sort and in-stock
   callers; a real navigation still carries no state and still jumps to the top as before.
   Verified live: toggling sort at a fixed scroll position left `scrollY` exactly unchanged;
   toggling the in-stock filter changed it only because filtering shrinks the grid's height
   (the browser's own scroll clamping, not a reset — confirmed by checking sort, which does not
   change item count, landed on the identical pixel).

No schema, Edge Function, or query change. Build, typecheck and lint stayed clean throughout,
and every fix was checked against the running dev server with a headless Playwright browser —
console errors, horizontal overflow at 320/375/768/1440px, the dropdown actually opening and
receiving keyboard focus, the scroll position across a filter toggle — not just read as CSS and
assumed to look right.

### Client changes, 2026-08-29 (fourth round — header wrap, theme options)

Two more items from the same feedback pass: the desktop nav was wrapping "Shop all" and "Winter
Collection" onto two lines, and the theme write-up above made a call rather than actually
presenting the options Huzaifa had asked for the round before.

1. **Bug: nav labels wrapping.** `linkClasses` had no `whitespace-nowrap`, so a `Link` — a flex
   item that can shrink below its content width like any other by default — wrapped its text at
   the space in a two-word label instead of the single-word ones, which have nowhere to wrap.
   Fixed with `whitespace-nowrap shrink-0` on every nav link. That alone would have pushed the
   now-unshrinkable row past its box at the `lg` (1024px) breakpoint where it first turns on, so
   two more changes went with it: `Container` gained an opt-in `wide` prop (`max-w-7xl` instead
   of `max-w-6xl`) used only by the header, and the nav's own breakpoint moved from `lg` to `xl`
   (1280px) — below that the hamburger menu covers it, same reasoning section 15 already used
   to justify hiding it below `lg` in the first place, just extended now that there are six nav
   items instead of fewer. **Verified at every width from 768 to 1920px**: zero wrapped labels,
   zero horizontal overflow, and the nav/hamburger swap lands exactly at 1280px with nothing
   in between.
2. **Theme options, actually presented this time.** Round three picked a direction on its own
   judgement after Huzaifa had explicitly asked to see choices; round four built
   `Velora Canvas Study`, a published Artifact comparing four canvas directions side by side —
   the live one (Warm Stone) plus three alternatives (Soft Blush, Muted Greige, Rich Parchment)
   — each rendered as the same miniature header/hero/product-row mockup so the comparison is
   real rather than described in words. Ink, the plum brand colour and the gold accent are
   unchanged across all four; only `--color-canvas`/`-alt`/`-deep` and the glow tint vary. **Not
   yet acted on** — waiting on Huzaifa/the client to pick a letter (or confirm A, already live).
   If a different one is chosen, only the three canvas hex values and `--glow-accent`/
   `--glow-brand` in `index.css`'s `@theme` block need to change; everything built on top of
   them (the ambient body gradient, the header, cards) reads the tokens and needs no edits of
   its own.

No schema, Edge Function, or query change. Build, typecheck and lint stayed clean throughout.

### Client changes, 2026-08-29 (fifth round — canvas chosen, developerb.md, real support email)

1. **Canvas option C, Muted Greige, is now live.** `index.css`'s three canvas tokens are
   `#f7f5f1` / `#ece7de` / `#ddd5c7` — cooler and quieter than the warm-tan default that
   shipped in round three. The `--glow-*` ambient wash is unchanged (it's built from the
   accent/brand colours, not the canvas tiers, so it works over any of the seven options in the
   Artifact). Re-verified with a headless browser after the swap: renders correctly, zero
   console errors.
2. **`developerb.md` is new** — a repo-root onboarding document for Developer B, written now
   that the storefront (sections 1-17, 18-19 audited) is otherwise done and the admin
   dashboard (section 8) is the one substantial thing left. It compiles what was previously
   scattered across this file, `admin/README.md` and `Requirements.md` into one place:
   architecture and why `is_admin()`/RLS mean no service-role key is needed for CRUD; a full
   table-by-table schema summary; what's already built FOR the dashboard (the `product_summaries`
   view, live `categories.productCount`, `reviews.hidden` + its policy, the `payment_method`
   column, `settings`); the migrations applied so far and their status; the shared contract's
   two mapping gotchas (snake_case↔camelCase, ISO strings↔epoch ms); every requirements
   section that binds Developer B, quoted in full rather than paraphrased; and a contact email
   (`wearvelora84@gmail.com`). `admin/README.md` now points to it as the fuller version of
   itself rather than duplicating it.
3. **Found while writing that doc — a stale comment, fixed.** `shared/types.ts`'s
   `Category.productCount` doc comment still said "the admin dashboard must keep it in sync,"
   left over from the Firebase design. It hasn't been true since the Supabase migration —
   `supabaseSource.ts`'s `getCategories()` counts related `products` rows live, in the same
   query. Comment corrected so Developer B doesn't inherit a stale obligation from reading the
   contract file.
4. **The support email is real now: `wearvelora84@gmail.com`**, replacing the
   `hello@velorawears.pk` placeholder in the footer's Contact column — the one placeholder
   detail from the "fourth round" write-up's still-outstanding list. Nothing else in the
   footer's contact block was a placeholder any more even before this.
5. **Three more, deeper canvas directions added to "Velora Canvas Study"** (same Artifact,
   republished in place, same URL) — Huzaifa asked for darker-leaning options after picking C.
   E (Cedar Smoke), F (Umber Dusk), G (Plum Mist) sit alongside the original four, all still a
   light theme rather than a dark one.

No schema, Edge Function, or query change. Build, typecheck and lint stayed clean throughout.

### Client changes, 2026-08-29 (sixth round — canvas E chosen)

**Option E, Cedar Smoke, is now live**, superseding C from the previous round.
`index.css`'s three canvas tokens are `#e7e1d8` / `#d3c7b4` / `#b8a688` — smoky, grey-warm,
deeper and moodier than C without leaning as hard into one hue as F (Umber Dusk) does. The
`--glow-*` ambient wash is unchanged, same as every prior swap. Re-verified with a headless
browser on the home page and `/products`: renders correctly, zero console errors, no contrast
or legibility issues at a glance across body text, nav, badges and buttons.

No schema, Edge Function, or query change. Build, typecheck and lint stayed clean throughout.

### Client changes, 2026-08-29 (seventh round — canvas G chosen)

**Option G, Plum Mist, is now live**, superseding E from the previous round — Huzaifa changed
his mind after seeing E live. `index.css`'s three canvas tokens are `#e8e3e2` / `#d6cbcd` /
`#bcabb0`, the one option of the seven built from the brand's own plum rather than the gold
family. Verified more thoroughly than the last two swaps, since the ask was explicitly to
confirm the colour was really applying, not just edited in source: `grep`'d the new hex values
into the actual built CSS output (`storefront/dist/assets/*.css`, not just `index.css`), then
loaded the running dev server and read `getComputedStyle` on `document.documentElement` and
`document.body` directly — both resolved to the new colour, not a stale or cached one — before
screenshotting the home page, `/products` and the footer to confirm the render itself matches.

No schema, Edge Function, or query change. Build, typecheck and lint stayed clean throughout.

### Checkout works end to end now, 2026-08-30 — a local demo simulation

Huzaifa reported checkout was not placing an order and asked for it fixed "whether db or
localstorage" — his own words, and the deciding factor in which of two fixes to reach for.

**The two options, and why the database one was not it.** The reason checkout could not
complete was never a bug — it is the sequencing fact this file has documented since the
Supabase migration: the storefront reads a throwaway demo catalog, whose product ids do not
exist in Postgres, so `place_order()` correctly refuses every order (there is genuinely nothing
in the database to sell). Fixing that at the database layer would mean writing real-looking
products into the live `products` table — which is **Huzaifa's own standing instruction,
repeated multiple times in this file**: "NEVER seed mock data into the live database... the
schema is deployed and deliberately empty." Overriding that to make a demo work would have
traded one deliberate rule for a convenience, and it is not this developer's rule to override
unilaterally even with today's request in hand — he offered "localstorage" as the explicit
alternative, and it is the one that does not touch that rule at all.

**So the fix lives entirely in the browser, and the real backend is untouched.**
`lib/placeOrder.ts` now checks `isLiveSource()` (`lib/queries.ts`) before doing anything else:
in demo mode it never reaches the network, and instead builds a `PlaceOrderResult` locally —
using the exact `subtotal`/`deliveryCharge`/`total` `useCartContents` already computed and was
already showing the customer in the order summary, not re-derived a second way. The result is
handed to `saveReceipt` exactly as a real one would be, so `/order/confirmed` — which has never
read anything but the `sessionStorage` receipt, real orders included — cannot tell the
difference and needed no changes at all.

**What a demo order deliberately is NOT, so nobody mistakes one for real:**

- **Not written to Supabase.** Nothing crosses the network. The database stays exactly as
  empty as every prior write-up in this file promised it would.
- **Not decremented from demo stock.** `demoData.ts`'s stock numbers are static; a demo
  purchase does not reduce what the next visitor sees available. Worth revisiting only if that
  specific realism is ever asked for — it would need a localStorage overlay `demoSource` reads
  from, which is a real feature, not a small addition.
- **Not visible in a signed-in customer's order history.** `lib/myOrders.ts` reads only
  Supabase (see the correction added to the accounts write-up above) — a demo order exists
  solely in the tab that placed it.
- **Marked unmistakably.** The order number is `DEMO-VW-YYMMDD-XXXXX` — the real format
  (`VW-YYMMDD-XXXXX`, from `place_order()`) with a `DEMO-` prefix that cannot appear on a real
  order. `CheckoutPage`'s `DemoNotice` was reworded from "orders cannot be completed... will be
  refused" (no longer true) to say plainly that the order that is about to be placed is a demo
  that will not be written to the real store — said before the fact, not discovered afterward.

**One pre-existing, unrelated limitation, not made worse by this:** the confirmation page's
review composer (section 16) would still fail if actually submitted from a demo order, because
`submit-review` looks the order up in a database it was never written to. This was already true
before today — a demo order's product ids do not exist in Postgres either way — so this fix
does not change that surface at all, only whether the order screen is reachable in the first
place.

**Verified by actually placing one**, not just by reading the new code: a headless Playwright
browser added a real product to the bag, filled the checkout form, submitted it, and confirmed
it landed on `/order/confirmed` with an order number in the `DEMO-VW-` shape, the correct line
item, price and total, and zero console errors throughout. Build, typecheck and lint are clean.

## 9. Open questions — ask before inventing

- ~~Brand identity and logo~~ — **resolved in section 1.** Logo, palette and typography are
  built and in use. Huzaifa can still ask for changes; edit the tokens in `index.css` and
  `Logo.tsx`, never override colours in a component.
- **Product images — decided and built.** No real photography exists. Demo images are
  **generated flat-lay illustrations committed to the repo** under `storefront/public/{products,banners,categories}` and served by
  Vercel's CDN: free, fast, no billing, deleted in one commit when real photography arrives.
  Both `thumb` and `full` variants, WebP, known dimensions. **Ask the client for real
  photography — these must be replaced before sign-off.**
- ~~Waiting on a canvas/theme pick~~ — **resolved, 2026-08-29**, through three rounds: C (Muted
  Greige) → E (Cedar Smoke) → **G (Plum Mist), live now**. All seven options are still laid out
  in the published Artifact "Velora Canvas Study" if a different one is wanted later — swap
  `--color-canvas`/`-alt`/`-deep` in `index.css`; `--glow-*` never needs to change.
- **`developerb.md` is new, 2026-08-29** — full admin-dashboard onboarding doc at the repo
  root. See the "fifth round" write-up above for what it covers. Contact email for Developer B
  coordination: `wearvelora84@gmail.com`.
- ~~Placeholder contact details~~ — **fully resolved, 2026-08-29.** The footer's Instagram,
  TikTok, Facebook and WhatsApp links, the WhatsApp number, the location, and the support email
  (`wearvelora84@gmail.com`, added in the fifth round) are all the brand's real details now.
  Nothing in the footer's contact block is a placeholder any more.
- ~~Blaze plan~~ — **gone with Firebase.** Supabase Edge Functions are on the free tier, so
  nothing is paywalled. There is no billing blocker on this project any more.
- **Demo data is temporary, and lives in the frontend** (`lib/demoData.ts`), not in the
  database. It is deleted once the admin dashboard can create real products, at which point
  `VITE_DATA_SOURCE` flips to `supabase`.
- **NEVER seed mock data into the live database.** Huzaifa's explicit instruction, and the
  right call: placeholder products and invented customer reviews do not belong in a
  production database. The schema is deployed and deliberately **empty**. It was seeded once
  during the migration purely to verify row level security, then cleared — verified back to
  zero rows.
- ~~Landing-page testimonials after the switch~~ — **resolved by the migration.**
  `supabaseSource.listTestimonials()` is one indexed query. The featured-reviews node that
  Firebase would have needed is not required.
- ~~Category URL shape~~ — **resolved in section 5.** `/products?category=<slug>` is the one
  canonical category URL, `/categories` is the index, and `lib/routes.ts` is the only place
  either is written. There is no `/category/:slug` route, and there should not be one.
- **`Category.description` is a new OPTIONAL field** in `shared/types.ts`, added in section
  5. It is additive, so nothing of Developer B's breaks — but **tell him it exists**, so the
  admin dashboard offers it when it gets to categories.
- **Category artwork.** The `/categories` index and the category page headers reuse the same
  generated demo tiles as the landing bento. Real category photography is part of the same
  ask as the product photography above.
- **The shirt SLUGS still carry the fabric word** (`meridian-oxford-shirt`) while the names
  now say "Oversized Drop Shoulder". That is deliberate: a slug is a stable identifier and
  renaming a product should not break its URL. Change it only if the client asks.
- **The trousers and shoes are invented.** The client asked for the categories; the seven
  products in them are placeholder copy and generated artwork, like the rest of the demo
  catalog. Confirm the real range with him before sign-off.
- ~~Where the cart lives~~ — **resolved in section 6.** `localStorage`, via an external
  store, holding identity only. Not a decision to revisit without a write path.
- **The bag is per-device and per-browser.** It does not follow a customer to their phone,
  and clearing site data empties it. That is a consequence of having no server, not an
  oversight — say so if the client asks. A saved bag needs auth, which §7 explicitly does
  not require.
- **Nothing is blocked.** Sections 1-17 are done and shipped (16's admin-moderation piece is
  Developer B's — see the note below; 17's one gap, rate limiting on search, is architectural,
  not a to-do — see its write-up). Sections 18 and 19 are audited (see their write-up) rather
  than a discrete build, and section 20 is a responsibilities document, confirmed rather than
  built. Section 8 is Developer B's, in full.
- **`orders_user` index migration is written but NOT applied.**
  `supabase/migrations/20260829000006_orders_user_index.sql`, found by the section 18/19 audit:
  `listMyOrders()` reads `orders` filtered by RLS on `user_id` with no index behind that column.
  Apply it via the Management API the next time `SUPABASE_ACCESS_TOKEN` is available (section
  4) — nothing is broken meanwhile, the query is just slower than it needs to be.
- **Admin review moderation (requirements section 16's own "Admin" subsection) is NOT built,
  and is not ours to build.** Section 20's ownership table puts the admin dashboard on
  Developer B (section 8) in full, and "hide or remove a review that is abusive or spam" is
  admin-dashboard UI. The database is already ready for it — the `hidden` column has existed
  since the very first migration, and `"visible reviews are public"` already excludes a hidden
  review from every read the storefront or a customer makes. **Tell Developer B**: nothing needs
  to change on the database side; the admin dashboard just needs a control that sets
  `reviews.hidden = true`, which `is_admin()`'s existing `"admins manage reviews"` policy already
  permits.
- **The `payment_method` migration is applied and verified.**
  `supabase/migrations/20260829000003_payment_method.sql` was applied to the live project on
  2026-08-29 with `SUPABASE_ACCESS_TOKEN`, and `place_order` was exercised end to end inside a
  rolled-back transaction — the column, the enum and the restated function all behave as
  written, and the database was confirmed empty afterwards. **Tell Developer B the
  `payment_method` column exists** so the admin dashboard's order list can show it rather than
  hardcoding "COD".
- **A second payment method is a product decision, not a task.** Section 9 says online payment
  "may be added in the future if required". The enum and the column are ready for one; nothing
  else is. Ask the client before assuming it is wanted.
- **"Low stock" is now ONE rule, in `shared/stock.ts`, and it was not before.** Section 11
  found that the SQL view, the demo catalog and the size selector each computed it slightly
  differently — a piece with 5 units left was "Low stock" in demo mode and "In stock" against
  the database at the shipped threshold of 4. Any future stock-related surface (the admin
  dashboard's low-stock alerts included) should read `stockLevel()` rather than reimplementing
  the comparison — that is exactly the mistake this file exists to stop repeating.
- ~~The happy path of checkout cannot be tested end to end yet~~ — **it can, since 2026-08-30,
  through a local demo simulation** — see that write-up. **A REAL order still cannot be
  written**, because the storefront is still on demo data whose product ids do not exist in the
  database, so `place_order()` would still refuse every one — that part is still a sequencing
  fact, not a bug, and still resolves only when the admin dashboard creates real products and
  `VITE_DATA_SOURCE` flips to `supabase`. **The checkout page still says so on screen**, in a
  notice reworded to describe the demo order rather than claim orders are refused outright.
- ~~RATE LIMITING ON ORDER PLACEMENT AND REVIEW SUBMISSION IS NOT BUILT~~ **Built in section
  17, 2026-08-29, and verified by actually tripping each limit against the live project** — 8
  per 15 minutes on `place-order`, 15 per 15 minutes on `submit-review`, 20 per 15 minutes on
  `find_order_for_review` (a real gap section 17's review found that nothing had flagged
  before). **Rate limiting search is NOT built and stays that way — see section 17's write-up
  for why the architecture makes it impractical without a redesign nobody has asked for.**
- **Section 16 — reviews — is deployed and verified against the live project, 2026-08-29.**
  `supabase/migrations/20260829000004_reviews.sql` (the `reviews.updated_at` column and
  `find_order_for_review`) is applied, and `submit-review` is deployed with `--no-verify-jwt`.
  All three ownership paths (signed-in session, guest token, guest order-number-and-email) were
  exercised against a temporary order created and then fully deleted — see the section 16
  write-up above for the full list of what was checked. **The database was confirmed empty
  afterward.**
- **Section 17 — validation and security — is deployed and verified against the live project,
  2026-08-29.** `supabase/migrations/20260829000005_rate_limits.sql` (the `rate_limits` table,
  `check_rate_limit()`, and `find_order_for_review()` restated to rate-limit itself) is applied;
  `place-order` and `submit-review` were both redeployed with the check wired in. See the
  section 17 write-up above for the two real bugs this caught (a check that never ran because it
  sat after an early return, and a function `PUBLIC` could call directly) before either shipped.
- **No email is sent when an order is placed.** There is no mail service on this project, so
  the confirmation page deliberately does not promise one; it tells the customer to keep
  their order number. If the client wants an order email, that is a new decision — it needs
  a provider, and it belongs in the Edge Function.
- **Checkout validation is defined in TWO files that must agree**: `shared/checkout.ts` and
  `supabase/functions/place-order/index.ts`. The Edge Function cannot import the shared one
  (the Supabase CLI bundles only what is under `supabase/`). Change one, change the other,
  and re-run the drift check described in the section 7 notes above.
- ~~Search is prefix-only~~ — **fixed by the migration.** Postgres `ilike` over a trigram
  index does substring matching, so "shirt" now finds "Oxford Shirt". The demo source still
  matches on prefix only, so search feels narrower in demo mode than it will in production;
  that difference disappears when the flag flips. *(Superseded note kept below for context.)*
- ~~Prefix-only search was a limitation to raise with the client.~~ **Raise it
  with the client before they notice it themselves.**
- **No price-range or size filter.** Size stock is on `products/{id}.sizes`, not on the
  summary, so filtering by it needs a denormalised field agreed with Developer B rather than
  reading full products for a grid (§19).
- ~~Auth provider — email/password, Google, or phone?~~ **Decided and built,
  2026-08-29: email/password, via Supabase Auth.** Google needs an OAuth app registered
  with a client id and secret from an external console, which nobody had to hand; phone
  needs an SMS provider. Email/password needed neither. Section 16's review form, when it
  is built, gets this for free — it is the same `useAuth()`.
- **Optional customer accounts — built, 2026-08-29.** Sign up, sign in, sign out, and
  order history at `/account`. Guest checkout is untouched — see the write-up below.
  **Password reset is NOT built.** It needs a real email provider; Supabase's shared
  default mailer is the only one configured and is not meant for production volume.
  Build it when the client supplies SMTP credentials — until then, a customer who forgets
  their password has no self-serve recovery.
- **Delivery charges** (section 10) — the mechanism is built and the admin configures one
  flat charge plus an optional free-delivery threshold, which is what §10 asks for. **Per-city
  rates are still undecided** and would be a schema change (`settings` holds one number), so
  agree it with the client and Developer B before building it.
- **Admin dashboard spec** (section 8) — still pending from the client.

---

## 10. Deployment

**Live URL (this is the link the client gets):** <https://velora-wears.vercel.app>

Deployed on **Vercel**, under the `huzaifas-projects-eabfae35` scope, project `velora-wears`.
The GitHub repo is connected, so **every push to `main` deploys automatically**.

The database and the Edge Function are deployed SEPARATELY, to Supabase — pushing to `main`
does not touch them. See section 5 for those commands.

Each requirements section ships when it is pushed, always to the same URL, so the client's
link never changes.

```bash
git push origin main           # THIS is the deploy - Vercel builds the commit
npx vercel env ls              # confirm the 3 VITE_* vars, 3 environments each
```

`vercel deploy --prod --yes` exists and works, but after a push it is redundant — it uploads
the working tree and rebuilds the same commit Vercel is already building. Only reach for it
to ship something that is deliberately not on `main`.

`vercel.json` at the repo root drives the build:

| Setting | Value |
| --- | --- |
| Root Directory | repo root (**not** `storefront/`) — the storefront is an npm workspace |
| Build command | `npm run build` |
| Output directory | `storefront/dist` |
| Rewrites | all routes to `/index.html` — required, this is an SPA |

### Environment variables — already configured, do not re-add

Three variables, each set for **Production, Preview and Development** (9 rows). Updated
2026-08-29: the seven `VITE_FIREBASE_*` variables were removed and these added.

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://owbnbzutqslihhnzdnyo.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon key — public by design |
| `VITE_DATA_SOURCE` | `demo` |

Flipping the storefront to the live database means changing `VITE_DATA_SOURCE` to `supabase`
there and redeploying.

`VITE_` variables need `npx vercel env add <NAME> <env> --type config`. The CLI refuses them
without an explicit type, because the prefix publishes the value to every visitor. **`config`
is correct here**: the Supabase URL and anon key are public by design and must be inlined
into the bundle for the client to work at all. The security boundary is row level security,
not secrecy. Do not "fix" this by making them secrets — it would break the client.

**The service role key is NOT here and must never be.** Edge Functions get it from the
platform.

> Vite inlines these at **build** time, so changing one requires a redeploy to take effect.
