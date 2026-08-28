# Velora Wears — Session Context

**Read this first in a new session, then read [`Requirements.md`](Requirements.md) in full.**
This file is the *state of the work*; `Requirements.md` is the spec.

Last updated: 2026-08-28. Scaffold complete. **Requirements section 1 (brand identity) is
built.** Everything from section 2 onward is still to do.

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
| Query layer | Written and documented — **not yet exercised against real data** |
| Cloud Functions | Scaffolded, typechecks; `placeOrder` **throws "unimplemented"** |
| Database rules | Deployed — catalog readable, all client writes denied |
| Data contract | `shared/types.ts` written |
| Brand identity | **Done (section 1).** Logo, palette, and type scale are agreed and in use |
| Product features | **None.** No catalog, cart, checkout, auth, reviews, admin |
| Landing page | **Not built (section 2 — next).** Home is a brand holding page |
| Seed data | **Database is empty.** Nothing to render yet |
| Lint | `npm run lint` **fails** — `storefront/eslint.config.js` does not exist |

### Layout

```
storefront/          React + Vite (Developer A)
  public/                  favicon.svg, logo-mark.svg - standalone brand assets
  src/components/brand/    Logo.tsx - the ONLY definition of the logo
  src/components/ui/       reusable primitives - Button exists as the pattern
  src/components/layout/   Container, Header, Footer
  src/features/            EMPTY - product/cart/checkout/reviews go here
  src/pages/               HomePage placeholder
  src/lib/firebase.ts      client SDK init
  src/lib/queries.ts       read layer - READ THE COMMENTS, they encode section 19
  src/hooks/               EMPTY
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
| 2 | Landing page — hero, featured, categories, testimonials, footer | **Next** |
| 3 | Products page — grid, cards | to do |
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

### The next task in detail — section 2, the landing page

The landing page needs a Featured Products section and a Categories section, so **the
database has to have data first**. Agreed with Huzaifa: write a seed script.

1. **Seed script** (Node + Admin SDK, run locally with the key in `secrets/`) that writes a
   handful of realistic shirts and hoodies with per-size stock, plus categories and
   `settings/public`. It must write `products` **and** `productSummaries` together — that
   dual write is exactly what Developer B's dashboard will have to do. Placeholder images
   are fine, but store both `thumb` and `full`.
   *Note: `firebase-admin` is not currently a root dependency — add it as a devDependency.*
   The script must be **idempotent** (safe to re-run) and must support **`--clear`** to
   remove everything it wrote, since this data is thrown away once the admin dashboard
   can create real products.
   Images go in `storefront/public/products/` and are referenced by path — **not** Firebase
   Storage, which is unavailable without Blaze.
2. **Verify `storefront/src/lib/queries.ts` against real data.** It has never actually run.
   **Known bug to fix:** `getSettings()` reads `settings`, but the rules only expose
   `settings/public` — that read will be denied. Confirm every index works.
3. **Build the landing page** from reusable components. `ProductCard` built here is the same
   one the products page uses in section 3 — build it once, properly.

## 9. Open questions — ask before inventing

- ~~Brand identity and logo~~ — **resolved in section 1.** Logo, palette and typography are
  built and in use. Huzaifa can still ask for changes; edit the tokens in `index.css` and
  `Logo.tsx`, never override colours in a component.
- **Product images — decided.** No real photography exists, and Firebase Storage is
  unavailable without Blaze (see section 2). So demo images are **committed to the repo**
  under `storefront/public/products/` and served by Vercel's CDN: free, fast, no billing,
  and deleted in one commit when real photography arrives. Store both a `thumb` and a
  `full` variant per image, in WebP, with known dimensions — section 19 still applies to
  placeholders. **These must be replaced before the client sees a finished site.**
- **Blaze plan.** Not enabled, and the client has not bought it yet. Blocks *only* Cloud
  Functions — so checkout (section 7) and `placeOrder`. Everything up to and including the
  cart can be finished without it. Seeding does **not** need it.
- **Demo data is temporary.** It gets deleted once Developer B's admin dashboard can create
  real products. The seed script must therefore ship a `--clear` flag that removes
  everything it wrote, so the handover is one command and not a manual cleanup.
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
