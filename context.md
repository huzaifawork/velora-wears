# Velora Wears — Session Context

**Read this first in a new session, then read [`Requirements.md`](Requirements.md) in full.**
This file is the *state of the work*; `Requirements.md` is the spec.

Last updated: 2026-08-29. Scaffold complete. **Requirements sections 1-7, 9, 10, 13 and 14
are built** — brand, landing, products, product details, categories, the cart, checkout,
payment, delivery charges, search, and filters and sorting.

**MIGRATED TO SUPABASE on 2026-08-29.** The Firebase project has been deleted by its owner
and every trace of Firebase is out of this repository. The stack is now Supabase — Postgres,
Supabase Realtime, and Edge Functions. Read section 2 and section 4 before touching data code.

**Nothing is blocked any more.** Edge Functions are on the Supabase free tier, so the Blaze
paywall that blocked checkout is gone. Section 10 (delivery charges) was delivered inside
section 7, and **section 9 (payment) was reviewed as its own section and finished**; sections
11, 12 and 16 are next. Section 8 is Developer B's.

> **One migration is written but NOT yet applied to the live database.**
> `supabase/migrations/20260829000003_payment_method.sql` adds the `payment_method` column
> and restates `place_order()`. Applying it needs `SUPABASE_ACCESS_TOKEN` — see section 4.
> Until it is applied the storefront still works (a response without the method reads as
> cash on delivery), but the column the admin dashboard needs does not exist yet.

**Checkout cannot be completed end to end yet, and that is a sequencing fact, not a bug.**
The storefront still reads the demo catalog, whose product ids do not exist in the database,
so `place_order()` refuses every order. The checkout page says so on screen. It resolves when
the admin dashboard creates real products and `VITE_DATA_SOURCE` flips to `supabase`.

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
| Routing | react-router-dom, `/`, `/products`, `/products/:slug`, `/categories`, `/cart`, `/checkout` and `/order/confirmed`, lazy-loaded, scroll reset on navigate. **Every internal link is built by `lib/routes.ts`** |
| Supabase client | `lib/supabase.ts`, anon key in `storefront/.env.local` and on Vercel |
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
| Checkout | **Done (section 7).** `/checkout` — guest-only form, shared validation rules, COD, delivery charge, and `/order/confirmed`. **No order can complete while the catalog is demo data** |
| Search | **Done (section 13).** Header search row + the products page. Enter or the button, never per keystroke. Prefix match |
| Filters and sorting | **Done (section 14).** Category chips, in-stock filter, four sorts, Load more |
| Demo catalog | **19 products, 5 categories**, settings — all typed against `shared/types.ts` |
| Demo reviews | **36 mock reviews across all 12 products**, one hidden as spam. Product ratings are derived from them, not typed by hand |
| Demo images | 48 product WebPs + hero, 2 promos, 3 category tiles. **430 KB total**, committed |
| Product features | Listing, detail, category browsing, the bag, checkout, search, filters and sorting. No auth, review UI, admin |
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
  src/features/categories/ CategoryTile (shared: landing bento + /categories), CategoryNav
  src/features/reviews/    ReviewCard (shared with the landing strip), ProductReviews
  src/pages/               HomePage, ProductsPage, ProductDetailPage, CategoriesPage,
                           CartPage, CheckoutPage, OrderConfirmedPage, NotFoundPage
  src/lib/supabase.ts      client init - anon key only, NEVER the service role key
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
  src/lib/cartStore.ts     the bag as an external store over localStorage
  src/hooks/useAsync.ts    the one data-loading hook
admin/               Developer B's dashboard - placeholder + contract notes
supabase/
  migrations/        THE DATABASE. Schema, RLS policies, place_order().
                     0001+0002 deployed; 0003 (payment_method) NOT YET APPLIED.
                     0003 holds the live place_order() - 0002 is superseded history.
  functions/
    place-order/     Edge Function (Deno) - validation + the call into place_order()
  config.toml        CLI config
shared/types.ts      DATA CONTRACT - shared with Developer B
shared/checkout.ts   CHECKOUT RULES - mirrors the Edge Function's validation exactly
shared/payment.ts    PAYMENT METHODS (section 9) - the enum and the words for it
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
                    verified_purchase, hidden           <- unique (order_id, product_id)
orders              customer PII, subtotal/delivery/total, payment_method,
                    review_token                                   SERVER-WRITTEN ONLY
order_items         snapshot of name/slug/thumb/size/qty/unit_price at order time
settings            ONE row: delivery_charge, free_delivery_threshold, low_stock_threshold
settings_private    admin only
admins              user_id FK auth.users            <- is_admin() reads this

product_summaries   *** A VIEW ***
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
| 11 | Stock and availability | mostly done — badges, per-size gating, and checkout blocked on an unfulfillable bag. **Next** |
| 12 | Order success animation | to do |
| 13 | Search | **Done** |
| 14 | Filters and sorting | **Done** |
| 15 | Mobile responsiveness | ongoing, every section |
| 16 | Reviews and ratings | to do |
| 17 | Validation and security | checkout is done (shared rules, server re-validation). **Rate limiting is NOT built** |
| 18 | Stack and component reuse | ongoing, every section |
| 19 | Performance | ongoing, every section |

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

**Not built, deliberately:** section 12's success animation (its own section — it replaces
the mark at the top of the confirmation page and leaves everything below it alone), the
review link on the confirmation (section 16 — the `reviewToken` is already stored for it),
sign-in (section 7 forbids requiring it, and nothing else needs it yet), and saved addresses,
which need an account.

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

### The next task — section 11, stock and availability

Most of it is already standing: `StockBadge`, per-size gating on the product page, the bag's
three problem states, and checkout refusing an unfulfillable bag. What is left is a review of
the whole surface against §11 — the badge thresholds, whether the available quantity should
be shown anywhere else, and the out-of-stock states on the grid and in search.

Then section 12 (the order animation) and section 16 (reviews). **Both need a real order**,
so both sit behind the same demo-catalog fact as the happy path of checkout.

## 9. Open questions — ask before inventing

- ~~Brand identity and logo~~ — **resolved in section 1.** Logo, palette and typography are
  built and in use. Huzaifa can still ask for changes; edit the tokens in `index.css` and
  `Logo.tsx`, never override colours in a component.
- **Product images — decided and built.** No real photography exists. Demo images are
  **generated flat-lay illustrations committed to the repo** under `storefront/public/{products,banners,categories}` and served by
  Vercel's CDN: free, fast, no billing, deleted in one commit when real photography arrives.
  Both `thumb` and `full` variants, WebP, known dimensions. **Ask the client for real
  photography — these must be replaced before sign-off.**
- **Placeholder contact details, still to be replaced.** The footer's Instagram, WhatsApp and
  Facebook links, `hello@velorawears.pk`, `+92 000 0000000`, and the `@velorawears` handle in
  the Instagram strip are invented. Get the brand's real accounts from the client.
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
- **Nothing is blocked.** Sections 1-7, 9, 10, 13 and 14 are done and shipped. Section 11 is
  next; sections 12 and 16 follow. Section 8 is Developer B's.
- **THE `payment_method` MIGRATION IS NOT APPLIED TO THE LIVE DATABASE.**
  `supabase/migrations/20260829000003_payment_method.sql` is committed but unapplied — it
  needs `SUPABASE_ACCESS_TOKEN` (section 4). Apply it with the Management API, then
  redeploy nothing: the Edge Function passes the function's result straight through and does
  not need rebuilding. **Tell Developer B the `payment_method` column exists** so the admin
  dashboard's order list shows it rather than hardcoding "COD".
- **A second payment method is a product decision, not a task.** Section 9 says online payment
  "may be added in the future if required". The enum and the column are ready for one; nothing
  else is. Ask the client before assuming it is wanted.
- **The happy path of checkout cannot be tested end to end yet**, because the storefront is
  still on demo data whose product ids do not exist in the database, so `place_order()`
  refuses every order. That is a sequencing fact, not a bug — it resolves when the admin
  dashboard creates real products. **The checkout page says so on screen**, in a notice that
  disappears on its own when `VITE_DATA_SOURCE` becomes `supabase`. What HAS been exercised
  is everything up to and including the request: the form, its rules, the payload, and every
  error the server can return.
- **RATE LIMITING ON ORDER PLACEMENT IS NOT BUILT**, and §17 asks for it. The `place-order`
  Edge Function accepts unlimited requests from anyone. It has to be solved server-side —
  a client-side limit is not a limit — and it must be in place before the shop takes real
  orders. The same applies to review submission when section 16 lands.
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
- **Auth provider** for reviews (section 16) — email/password, Google, or phone? Undecided.
  Note that checkout does **not** need it: section 7 forbids requiring an account, and the
  storefront has no sign-in anywhere.
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
