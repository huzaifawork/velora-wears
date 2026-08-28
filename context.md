# Velora Wears — Session Context

**Read this first in a new session, then read [`Requirements.md`](Requirements.md) in full.**
This file is the *state of the work*; `Requirements.md` is the spec.

Last updated: 2026-08-28. Setup and scaffold complete. **No product features are built yet.**

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

> **Cloud Functions needs the Blaze (pay-as-you-go) plan.** The free tier is generous, but
> billing must be enabled on the Firebase project before the order flow can deploy. This is
> not done yet and will block build step 4.

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
| Product features | **None.** No catalog, cart, checkout, auth, reviews, admin |
| Design | **No logo, no brand palette agreed.** Tokens in `index.css` are provisional |
| Seed data | **Database is empty.** Nothing to render yet |

### Layout

```
storefront/          React + Vite (Developer A)
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

1. **Catalog foundation** — start here
2. Product details page — gallery, size selection, stock states (§4, §11)
3. Cart — size, quantity, totals (§6)
4. Checkout + `placeOrder` Cloud Function, full §17 validation *(needs Blaze plan)*
5. Order success page with the delivery animation (§12)
6. Landing page — hero, featured, categories, testimonials, footer (§2)
7. Search, filters, sorting (§13, §14)
8. Auth + reviews, including the guest review flow (§16)
9. *Admin dashboard — Developer B, not Developer A*

### First task in detail — catalog foundation

Goal: real products rendering from the real database, proving the whole stack works.

1. **Confirm the schema** in `shared/types.ts` — agree it with Developer B before seeding,
   since changing it later breaks his dashboard.
2. **Write a seed script** (Node + Admin SDK, run locally using the key in `secrets/`) that
   populates a handful of realistic shirts and hoodies with per-size stock, categories, and
   `settings/public`. Write `products` **and** `productSummaries` together — that dual write
   is exactly what Developer B's dashboard will have to do. Placeholder images are fine, but
   store both `thumb` and `full`.
3. **Verify `storefront/src/lib/queries.ts` against real data.** It is written but has never
   run. Confirm the indexes work and that no query downloads more than it needs.
4. **Build the products grid** — a reusable `ProductCard`, a responsive grid, loading
   skeletons, lazy-loaded images with reserved dimensions, and empty and error states.

Done when the products page renders real database data on mobile and desktop, with no
duplicated markup and no unindexed query.

---

## 9. Open questions — ask before inventing

- **Brand identity and logo.** §1 requires a custom logo; no colours, typography, or
  direction have been agreed. The palette in `index.css` is a placeholder. **Ask.**
- **Product images.** No real photography exists. Placeholders for now?
- **Blaze plan.** Not enabled. Blocks build step 4.
- **Auth provider** for reviews (§16) — email/password, Google, or phone? Undecided.
- **Delivery charges** (§10) — flat rate or per city?
- **Admin dashboard spec** (§8) — still pending from the client.
