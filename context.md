# Velora Wears — Session Context

**Read this first in a new session, then read [`Requirements.md`](Requirements.md) in full.**
This file is the *state of the work*; `Requirements.md` is the spec.

Last updated: 2026-08-29. Scaffold complete. **Requirements sections 1 (brand identity) and
2 (landing page) are built.** Everything from section 3 onward is still to do.

> **Working agreement:** we build in `Requirements.md` **section order**, one section at a
> time. Huzaifa reviews each section and says when to start the next. Do not run ahead.
>
> **Routine at the end of every section:** build and typecheck clean → commit in focused
> commits (**no `Co-Authored-By` trailer**) → push to `main` → `vercel deploy --prod --yes`
> → update this file. The client's link never changes, so every section ships to the same
> URL: <https://velora-wears.vercel.app>

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
| Routing | react-router-dom, one placeholder route |
| Firebase client | Wired, web app registered, config in `storefront/.env.local` |
| Query layer | Two interchangeable sources behind `lib/queries.ts`; demo one is live |
| Data source | `VITE_DATA_SOURCE=demo`. Switches to `firebase` when Blaze is bought |
| Cloud Functions | Scaffolded, typechecks; `placeOrder` **throws "unimplemented"** |
| Database rules | Deployed — catalog readable, all client writes denied |
| Data contract | `shared/types.ts` written |
| Brand identity | **Done (section 1).** Logo, palette, and type scale are agreed and in use |
| Landing page | **Done (section 2).** Hero, categories, featured grid, promos, story, reviews, Instagram strip, CTA, footer |
| Demo catalog | 12 products, 3 categories, settings — all typed against `shared/types.ts` |
| Demo reviews | **36 mock reviews across all 12 products**, one hidden as spam. Product ratings are derived from them, not typed by hand |
| Demo images | 48 product WebPs + hero, 2 promos, 3 category tiles. **430 KB total**, committed |
| Product features | **None yet.** No products page, cart, checkout, auth, reviews, admin |
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
  src/components/layout/   Container, Header (mobile nav + announcement), Footer
  src/features/home/       landing sections - Hero, CategoryStrip, FeaturedProducts,
                           PromoBanners, BrandIntro, Testimonials, InstagramStrip,
                           ValueProps, CtaBand
  src/features/products/   ProductCard, ProductGrid, StockBadge - reused by sections 3/5/13
  src/pages/               HomePage, NotFoundPage
  src/lib/firebase.ts      client SDK init
  src/lib/queries.ts       read layer + cache + THE SOURCE SWITCH
  src/lib/sources/         CatalogSource (the interface), firebaseSource, demoSource
  src/lib/demoData.ts      throwaway demo catalog - never import from a component
  src/lib/format.ts        formatPrice / formatRating
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
vercel deploy --prod --yes  # deploy to https://velora-wears.vercel.app (see section 10)
```

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
| 3 | Products page — grid, cards | **Next** |
| 4 | Product details — gallery, size selection | to do |
| 5 | Categories | to do |
| 6 | Shopping cart | to do |
| 7 | Checkout — guest + signed in | to do |
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

### The next task — section 3, the products page

Requirements section 3: a dedicated page at `/products` listing everything, with image, name,
price and category on each card.

1. **Reuse `ProductGrid`.** It already handles loading, empty and loaded states. If the page
   needs something new, add a prop — do not fork it.
2. Read through `listProducts({ categorySlug, sort, limit })`. The `?category=` query
   parameter is already what the header, footer, category tiles and promo banners link to.
3. Filters and sorting are **section 14**, and search is **section 13** — build section 3
   first and stop, unless Huzaifa says otherwise.
4. Pagination: `listProducts` is limited to 24. A "load more" needs a real cursor; RTDB
   pagination is `startAfter` on the ordering key, not an offset.

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
- **Auth provider** for reviews (section 16) — email/password, Google, or phone? Undecided.
- **Delivery charges** (section 10) — flat rate or per city? Undecided.
- **Admin dashboard spec** (section 8) — still pending from the client.

---

## 10. Deployment

**Live URL (this is the link the client gets):** <https://velora-wears.vercel.app>

Deployed on **Vercel**, under the `huzaifas-projects-eabfae35` scope, project `velora-wears`.
The GitHub repo is connected, so **every push to `main` deploys automatically**. Firebase
Hosting config still exists in `firebase.json` but is not the deployment path.

We redeploy after finishing each requirements section, always to the same URL, so the
client's link never changes.

```bash
vercel deploy --prod --yes     # deploy the current working tree to the live URL
vercel env ls                  # confirm the 7 VITE_FIREBASE_* vars, 3 environments each
```

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
