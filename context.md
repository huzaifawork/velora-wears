# Velora Wears — Session Context

**Read this first in a new session, then read [`Requirements.md`](Requirements.md) in full.**
This file is the *state of the work*; `Requirements.md` is the spec.

Last updated: 2026-08-29. Scaffold complete. **Requirements sections 1 (brand identity),
2 (landing page), 3 (products page), 4 (product details page), 5 (categories) and
6 (shopping cart) are built.** Section 7 (checkout) is next, and is **blocked on the Blaze
plan** — it needs the `placeOrder` Cloud Function.

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
- **Realtime Database, not Firestore** (§18). Firestore was mentioned in conversation; the
  confirmed decision is RTDB, which is what is live and configured.
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

The storefront is a browser SPA, so it **cannot** hold the Admin SDK service account key —
that would hand full database control to any visitor. Hence the split:

```
Browser (React + Vite)
   |
   +-- Firebase CLIENT SDK --read--> Realtime Database
   |     public catalog only; rules allow read on
   |     products, productSummaries, categories,
   |     settings/public, reviews
   |
   +-- Cloud Functions (callable) --write--> Realtime Database
         trusted server code, Admin SDK
         recomputes totals, re-checks stock, writes orders
```

Client writes are denied everywhere. The admin dashboard writes via Firebase Auth, with the
admin's UID listed under `admins/{uid}`.

> **What the free (Spark) plan does and does not block.** The client has not bought Blaze
> yet. Verified on 2026-08-28 by probing the live project:
>
> - **Realtime Database writes via the Admin SDK work.** A write + read-back + delete probe
>   succeeded on Spark, so **seeding demo data needs no billing**. Sections 2-6 (landing,
>   products, product details, categories, cart) can all be built and demoed in full.
> - **Cloud Storage is NOT provisioned** — `velora-wears.firebasestorage.app` returns 404,
>   because new Firebase projects require Blaze for Storage. So **product images must not be
>   uploaded to Firebase Storage.** See the image decision in section 9.
> - **Cloud Functions cannot deploy** without Blaze. This is the one hard stop: it blocks
>   `placeOrder`, and therefore checkout — `Requirements.md` section 7.

---

## 3. Current state

Storefront builds clean; functions typecheck clean.

| Area | State |
| --- | --- |
| Storefront | React 19 + Vite 7 + TS + Tailwind v4, **builds clean** |
| Routing | react-router-dom, `/`, `/products`, `/products/:slug`, `/categories` and `/cart`, lazy-loaded, scroll reset on navigate. **Every internal link is built by `lib/routes.ts`** |
| Firebase client | Wired, web app registered, config in `storefront/.env.local` |
| Query layer | Two interchangeable sources behind `lib/queries.ts`; demo one is live |
| Data source | `VITE_DATA_SOURCE=demo`. Switches to `firebase` when Blaze is bought |
| Cloud Functions | Scaffolded, typechecks; `placeOrder` **throws "unimplemented"** |
| Database rules | Deployed — catalog readable, all client writes denied |
| Data contract | `shared/types.ts` written |
| Brand identity | **Done (section 1).** Logo, palette, and type scale are agreed and in use |
| Landing page | **Done (section 2).** Hero, categories, featured grid, promos, story, reviews, Instagram strip, CTA, footer |
| Products page | **Done (section 3).** `/products`, honours `?category=`, reuses `ProductGrid` |
| Product details | **Done (section 4).** `/products/:slug` — gallery, size selection, reviews, related |
| Categories | **Done (section 5).** `/categories` index, the category view on `/products?category=`, category chips, data-driven header and footer nav |
| Shopping cart | **Done (section 6).** `/cart`, a mini-bag drawer, quantity and removal, live re-pricing against the catalog. **localStorage — there is no server** |
| Demo catalog | 12 products, 3 categories, settings — all typed against `shared/types.ts` |
| Demo reviews | **36 mock reviews across all 12 products**, one hidden as spam. Product ratings are derived from them, not typed by hand |
| Demo images | 48 product WebPs + hero, 2 promos, 3 category tiles. **430 KB total**, committed |
| Product features | Listing, detail, category browsing and the bag. No checkout, auth, review UI, search, sorting, admin |
| Seed data | **Database is empty — intentionally.** Catalog comes from demo data |
| Lint | `npm run lint` **passes clean** — flat config in `storefront/eslint.config.js` |

### Layout

```
storefront/          React + Vite (Developer A)
  public/                  favicon.svg, logo-mark.svg - standalone brand assets
  public/products/         DEMO product images, thumb + full WebP (throwaway)
  public/banners/          DEMO hero and promo art (throwaway)
  public/categories/       DEMO category tiles (throwaway)
  src/components/brand/    Logo.tsx - the ONLY definition of the logo
  src/components/ui/       Button, Badge, Rating, Image, Marquee, SectionHeading, Skeleton
  src/components/layout/   Container, PageHeader, Breadcrumbs, ValueProps, ScrollToTop,
                           Header (mobile nav + announcement), Footer
  src/features/home/       landing sections - Hero, CategoryStrip, FeaturedProducts,
                           PromoBanners, BrandIntro, Testimonials, InstagramStrip,
                           CtaBand
  src/features/products/   ProductCard, ProductGrid, StockBadge - reused by sections 3/5/13
                           ProductGallery, SizeSelector, RelatedProducts
  src/features/cart/       CartContext + CartProvider, CartButton, CartDrawer (lazy host),
                           CartDrawerPanel, CartLineRow, CartSummary, QuantityStepper,
                           useCartContents - the hook that prices the bag
  src/features/categories/ CategoryTile (shared: landing bento + /categories), CategoryNav
  src/features/reviews/    ReviewCard (shared with the landing strip), ProductReviews
  src/pages/               HomePage, ProductsPage, ProductDetailPage, CategoriesPage,
                           CartPage, NotFoundPage
  src/lib/firebase.ts      client SDK init
  src/lib/queries.ts       read layer + cache + THE SOURCE SWITCH
  src/lib/sources/         CatalogSource (the interface), firebaseSource, demoSource
  src/lib/demoData.ts      throwaway demo catalog - never import from a component
  src/lib/format.ts        formatPrice / formatRating / formatDate / prettifySlug
  src/lib/sizes.ts         SIZES + SIZE_LABELS - the order sizes are shown in
  src/lib/routes.ts        EVERY internal URL - the one definition of a category link
  src/lib/cart.ts          bag rules: validation, mutations, pricing. PURE
  src/lib/cartStore.ts     the bag as an external store over localStorage
  src/hooks/useAsync.ts    the one data-loading hook
admin/               Developer B's dashboard - placeholder + contract notes
functions/           Cloud Functions, Admin SDK, own node_modules (NOT a workspace)
shared/types.ts      DATA CONTRACT - shared with Developer B
database.rules.json  deployed
```

npm workspaces cover `storefront` and `shared` only. `functions/` installs separately
(run `npm install` inside that folder) — this is deliberate, because Firebase deploys that
folder on its own and hoisted dependencies break it.

---

## 4. Firebase facts

| | |
| --- | --- |
| Project ID | `velora-wears` |
| RTDB instance | `velora-wears-default-rtdb`, region `asia-southeast1` |
| Database URL | `https://velora-wears-default-rtdb.asia-southeast1.firebasedatabase.app` |
| Web app ID | `1:290582204238:web:e6e3b2b3caad444d7a581f` |
| CLI account | `mhuzaifatariq7@gmail.com` |
| Functions region | `asia-southeast1` (set in `functions/src/index.ts`) |

**Credentials.** The Admin SDK key is at
`secrets/velora-wears-firebase-adminsdk-fbsvc-5f0b34bfb9.json` — gitignored, never commit,
never print. It is only for local scripts; deployed functions use the runtime service account.

The `VITE_FIREBASE_*` values in `storefront/.env.local` are **public by design** — they are
compiled into the browser bundle. That is normal for Firebase web config; security comes from
the database rules.

---

## 5. Commands

```bash
npm install                 # root - installs storefront + shared workspaces
npm run dev                 # storefront dev server
npm run build               # storefront production build
npm run typecheck
npm run deploy:rules        # deploys database.rules.json to LIVE
npm run deploy:functions    # needs Blaze plan
npm run emulators           # local database + functions
```

Deploying is `git push origin main` — Vercel builds it. See section 10.

Functions dependencies install separately, once: change into `functions/` and run
`npm install`.

> **Port note:** port 3000 is occupied by another process on this machine. Vite defaults to
> **5173** — check the dev server output for the actual port.

---

## 6. Conventions

- **No `Co-Authored-By` trailers in commits.** The user does not want Claude appearing as a
  co-author on GitHub.
- **The Admin SDK must never appear in `storefront/`.** If something needs privileged access,
  it belongs in `functions/`.
- **Every new `orderByChild` needs a matching `.indexOn`** in `database.rules.json`, added in
  the same change. Missing indexes are the main cause of slow RTDB apps.
- **List views read `productSummaries`, never `products`.**
- **Never write an internal URL by hand.** Import `categoryPath` / `productPath` from
  `lib/routes.ts`. Six surfaces link to a category; they must agree on one URL.
- **The bag never stores a price, a name or an image** — only ids, size and quantity.
  Everything else is re-read from the catalog on render. A cached price would only ever
  end up disagreeing with the server, which recomputes every total (§17).
- **Never import `lib/demoData.ts` from a component or page.** Go through
  `lib/queries.ts` — that indirection is what makes switching to the database a
  one-file change instead of a rewrite.
- **Build a shared component before writing markup twice** (§18). Extend `Button` with a
  variant rather than styling a one-off button somewhere else.
- No hardcoded colours in components — use the tokens in `storefront/src/index.css`.
- **Never redraw the logo.** Import `Logo` / `LogoMark` from
  `storefront/src/components/brand/Logo.tsx` and pick a variant.
- For a link that should look like a button, use `buttonClasses()` from `ui/Button.tsx`
  rather than restyling an anchor.
- Repo is **public**: assume anything committed is world-readable.
- Path aliases: `@/*` maps to `storefront/src/*`, `@shared/*` maps to `shared/*`.

---

## 7. Data model

Defined in [`shared/types.ts`](shared/types.ts) — read it before writing queries. Shape:

```
products/{id}            full detail: description, all images, per-size stock
productSummaries/{id}    small list projection: name, price, thumb, inStock, rating
categories/{slug}
orders/{id}              server-written only; customer PII; reviewToken for guest reviews
reviews/{productId}/{id}
settings/public          deliveryCharge etc, readable by checkout
settings/private         admin only
admins/{uid}             grants admin write access
```

The `products` / `productSummaries` split is the core performance decision (§19): grids read
summaries with card-sized images; full records load only on the detail page.

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
| 7 | Checkout — guest + signed in | **Next** — blocked on Blaze |
| 8 | *Admin dashboard — **Developer B**, not us* | not ours |
| 9 | Payment — COD only | to do |
| 10 | Delivery charges | to do |
| 11 | Stock and availability | to do |
| 12 | Order success animation | to do |
| 13 | Search | to do |
| 14 | Filters and sorting | to do |
| 15 | Mobile responsiveness | ongoing, every section |
| 16 | Reviews and ratings | to do |
| 17 | Validation and security | to do |
| 18 | Stack and component reuse | ongoing, every section |
| 19 | Performance | ongoing, every section |

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

### The next task — section 7, checkout

**This is the first section that CANNOT be finished without the Blaze plan.** It needs the
`placeOrder` Cloud Function, `functions/src/index.ts` currently throws `unimplemented`, and
Cloud Functions will not deploy on Spark. Everything up to here has shipped without billing;
this is the hard stop noted in section 2.

What section 7 asks for: guest checkout with **no mandatory authentication**, the field list
in §7 as clarified by §17 (postal code is OPTIONAL), validation that blocks confirmation
while anything required is missing or invalid, and an order that lands in the admin
dashboard.

What already exists:

1. **The bag is ready to hand over.** A stored `CartItem` is deliberately a superset of
   `PlaceOrderInput["items"]` — drop `slug` and it is the payload. `buildCart` already knows
   which lines are orderable.
2. `OrderCustomer`, `PlaceOrderInput` and `PlaceOrderResult` are already in
   `shared/types.ts`, and `orders/` is already server-write-only in the rules.
3. `CHECKOUT` is already in `lib/routes.ts` and already linked from the bag.

Before writing anything:

- **Ask Huzaifa whether Blaze has been bought.** If not, the honest options are to build the
  form and validation against a stubbed `placeOrder` and ship the rest, or to pause section 7
  and do sections 13/14 (search, filters and sorting) first — both are pure storefront work
  that needs no billing. **Section 12's order-success animation is also blocked**, since it
  needs a real order to show.
- **Validation belongs in one place.** §17 requires the same rules on the client and again on
  the server. Put them in `shared/` so `functions/` and the storefront cannot drift — that is
  a shared-contract addition, so agree it with Developer B.

*(Section 6's brief is above, under "What section 6 delivered".)*

**When Blaze is bought and the switch happens**, the checklist is:

1. write the seed script (Admin SDK, dual-writes `products` + `productSummaries`, idempotent,
   with a `--clear` flag);
2. decide what happens to the **36 mock reviews**. They are demo content, not real customer
   feedback, so they must NOT be seeded into the live database as if they were genuine — the
   honest options are to ship with no reviews until real customers leave them, or to ask the
   client for real feedback from their Instagram orders and seed that. Either way the
   testimonials strip hides itself when there is nothing to show;
3. agree the featured-reviews node with Developer B (see the note below), because
   `listTestimonials()` returns nothing on the database path until it exists;
4. flip `VITE_DATA_SOURCE` to `firebase` locally and on Vercel, verify every index;
5. delete `demoData.ts`, `demoSource.ts` and the demo images.

> **Known gap, by design:** `firebaseSource.listTestimonials()` returns an empty array, so the
> testimonials section hides itself when the flag flips. Reviews live at
> `reviews/{productId}/{id}` with no flat node to read the newest few from, and reading every
> product's reviews is exactly what section 19 forbids. Section 16 resolves it with a
> denormalised, admin-maintained featured-reviews node — agree that node with Developer B
> before building it, because it is a shared-contract change.

## 9. Open questions — ask before inventing

- ~~Brand identity and logo~~ — **resolved in section 1.** Logo, palette and typography are
  built and in use. Huzaifa can still ask for changes; edit the tokens in `index.css` and
  `Logo.tsx`, never override colours in a component.
- **Product images — decided and built.** No real photography exists, and Firebase Storage
  is unavailable without Blaze. Demo images are **generated flat-lay illustrations committed
  to the repo** under `storefront/public/{products,banners,categories}` and served by
  Vercel's CDN: free, fast, no billing, deleted in one commit when real photography arrives.
  Both `thumb` and `full` variants, WebP, known dimensions. **Ask the client for real
  photography — these must be replaced before sign-off.**
- **Placeholder contact details, still to be replaced.** The footer's Instagram, WhatsApp and
  Facebook links, `hello@velorawears.pk`, `+92 000 0000000`, and the `@velorawears` handle in
  the Instagram strip are invented. Get the brand's real accounts from the client.
- **Blaze plan.** Not enabled, and the client has not bought it yet. Blocks *only* Cloud
  Functions — so checkout (section 7) and `placeOrder`. Everything up to and including the
  cart can be finished without it. Seeding does **not** need it.
- **Demo data is temporary, and lives in the frontend for now** (`lib/demoData.ts`), not in
  the database — Huzaifa's staging decision while the client has not bought Blaze. It is
  deleted once the admin dashboard can create real products. The seed script that replaces
  it must be idempotent and ship a `--clear` flag, so the handover is one command.
- **Landing-page testimonials after the switch** — the demo path serves six reviews; the
  Realtime Database path returns none until section 16 defines a featured-reviews node.
  Agree that node with Developer B before section 16 starts.
- **The database is deliberately empty and stays that way for now.** Do not seed it without
  asking — the storefront is not reading from it yet.
- ~~Category URL shape~~ — **resolved in section 5.** `/products?category=<slug>` is the one
  canonical category URL, `/categories` is the index, and `lib/routes.ts` is the only place
  either is written. There is no `/category/:slug` route, and there should not be one.
- **`Category.description` is a new OPTIONAL field** in `shared/types.ts`, added in section
  5. It is additive, so nothing of Developer B's breaks — but **tell him it exists**, so the
  admin dashboard offers it when it gets to categories.
- **Category artwork.** The `/categories` index and the category page headers reuse the same
  generated demo tiles as the landing bento. Real category photography is part of the same
  ask as the product photography above.
- ~~Where the cart lives~~ — **resolved in section 6.** `localStorage`, via an external
  store, holding identity only. Not a decision to revisit without a write path.
- **The bag is per-device and per-browser.** It does not follow a customer to their phone,
  and clearing site data empties it. That is a consequence of having no server, not an
  oversight — say so if the client asks. A saved bag needs auth, which §7 explicitly does
  not require.
- **Blaze is now on the critical path.** Sections 1-6 are done and shipped without it.
  Section 7 (checkout), section 12 (the order animation) and the review form in section 16
  all need Cloud Functions. Sections 13 and 14 (search, filters, sorting) do NOT — they are
  the work to do if Blaze is still not bought.
- **Auth provider** for reviews (section 16) — email/password, Google, or phone? Undecided.
- **Delivery charges** (section 10) — flat rate or per city? Undecided.
- **Admin dashboard spec** (section 8) — still pending from the client.

---

## 10. Deployment

**Live URL (this is the link the client gets):** <https://velora-wears.vercel.app>

Deployed on **Vercel**, under the `huzaifas-projects-eabfae35` scope, project `velora-wears`.
The GitHub repo is connected, so **every push to `main` deploys automatically**. Firebase
Hosting config still exists in `firebase.json` but is not the deployment path.

Each requirements section ships when it is pushed, always to the same URL, so the client's
link never changes.

```bash
git push origin main           # THIS is the deploy - Vercel builds the commit
vercel env ls                  # confirm the 7 VITE_FIREBASE_* vars, 3 environments each
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

`VITE_DATA_SOURCE` is set to `demo` for **Production, Preview and Development**. Flipping the
storefront to the Realtime Database means changing it there and redeploying — Vite inlines it
at build time.

All seven `VITE_FIREBASE_*` variables are set for **Production, Preview and Development**
(21 rows). `storefront/.env.local` is gitignored, so Vercel could not have got them from the
repo.

Two of them — `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_DATABASE_URL` — need
`vercel env add <NAME> <env> --type config`. The CLI refuses them without an explicit type,
because a `VITE_` prefix publishes the value to every visitor. **`config` is correct here**:
Firebase web config is public by design and must be inlined into the browser bundle for the
client SDK to work at all. The security boundary is `database.rules.json`, not secrecy. Do
not "fix" this by making them secrets — it would break the client SDK.

> Vite inlines these at **build** time, so changing one requires a redeploy to take effect.
