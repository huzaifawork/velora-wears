# Velora Wears — Session Context

**Read this first in a new session.** It captures everything decided and built so far, so
you can start feature work without re-deriving the setup.

Last updated: 2026-08-28. Setup is complete; **no product features are built yet.**

---

## 1. What this project is

An e-commerce storefront for **Velora Wears**, a Pakistani fashion/clothing brand. The full
specification lives in [`Requirements.md`](Requirements.md) — read it in full before
building. This file is the *state of the work*, not a replacement for the spec.

Defining constraints from the spec:

- **Guest checkout is mandatory.** Orders must be placeable without signing in (§7).
- **Cash on Delivery only.** No payment gateway in v1 (§9).
- **Reviews are tied to purchases, not accounts.** Both signed-in buyers and guests with a
  confirmed order can review (§16).
- **Server-side validation is non-negotiable.** Never trust client-sent prices or totals;
  recompute on the server (§17).
- Delivery charges are admin-configurable and must flow into the checkout total (§10).
- Stock is tracked **per size**, and out-of-stock options must not be purchasable (§11).
- Mobile-first responsiveness is a hard requirement (§15).

---

## 2. Current state

Setup is finished and verified end to end. Two commits on `main`, pushed, working tree clean.

| Area | State |
| --- | --- |
| Scaffold | Next.js 15.5 App Router + TypeScript, builds and typechecks clean |
| Styling | Tailwind CSS v4 (via `@tailwindcss/postcss`), no component library chosen yet |
| Firebase | Admin SDK wired, **live connection verified** against Realtime Database |
| Database rules | Deny-all, deployed and verified (anonymous read returns 401) |
| Product features | **None.** No products, cart, checkout, auth, reviews, or admin |
| Design | No logo, no design system, no brand palette chosen yet |

### What exists in code

```
src/
├── app/
│   ├── api/health/route.ts   # setup smoke check — reports config presence only
│   ├── layout.tsx            # bare shell, no header/footer yet
│   ├── page.tsx              # placeholder page
│   └── globals.css           # Tailwind import + minimal light/dark tokens
├── components/               # EMPTY
└── lib/
    ├── env.ts                # server-side env accessors
    └── firebase/
        ├── admin.ts          # Admin SDK singleton (server-only)
        └── db.ts             # readPath / writePath helpers — thin, extend these
database.rules.json           # deny-all, deployed
firebase.json                 # rules + emulator config
.firebaserc                   # project link (committed, no secrets)
```

---

## 3. Firebase facts

| | |
| --- | --- |
| Project ID | `velora-wears` |
| Project number | `290582204238` |
| RTDB instance | `velora-wears-default-rtdb` |
| Region | `asia-southeast1` |
| Database URL | `https://velora-wears-default-rtdb.asia-southeast1.firebasedatabase.app` |
| CLI account | `mhuzaifatariq7@gmail.com` |

**The database is currently empty.** No seed data exists.

Credentials: the Admin SDK service account JSON lives at
`./secrets/velora-wears-firebase-adminsdk-fbsvc-5f0b34bfb9.json` — gitignored, never
committed. `.env.local` (also gitignored) points at it and is already filled in with real
values. Do not print, copy, or commit the key contents.

Because rules are deny-all, **all database access must go through server-side code** using
the Admin SDK. There is no client-side Firebase SDK in this project, and adding one would
require deliberately opening rules — discuss before doing that.

---

## 4. Running it

```bash
npm run dev          # dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run emulators    # local RTDB emulator on :9000
npm run deploy:rules # deploy database.rules.json — overwrites LIVE rules
```

> **Port note:** port 3000 is occupied by another process on this machine, so Next
> falls back to **http://localhost:3001**. Check the dev server output for the actual port.

Smoke check: `curl http://localhost:3001/api/health` → both `databaseUrlConfigured` and
`serviceAccountConfigured` should be `true`.

---

## 5. Conventions to follow

- **No `Co-Authored-By` trailers in commits.** The user explicitly does not want Claude
  appearing as a co-author on GitHub. Write commit messages without them.
- Anything touching `firebase-admin` must `import "server-only"` — it must never reach a
  client bundle. `next.config.ts` also lists it in `serverExternalPackages`.
- Secrets stay out of git. `.gitignore` already blocks `.env*` (except `.env.example`),
  `*firebase-adminsdk*.json`, `*serviceAccountKey.json`, `secrets/`, `credentials/`.
- Repo is **public** — assume anything committed is world-readable.
- Path alias `@/*` maps to `src/*`.

---

## 6. Proposed data model (not built — confirm before implementing)

A starting shape for the Realtime Database. Nothing here is written yet.

```
products/{productId}
  name, slug, description, category, price
  images: [url]
  sizes: { S: {stock}, M: {stock}, L: {stock} }
  active, createdAt
categories/{categoryId}
  name, slug, sortOrder
orders/{orderId}
  orderNumber, status, createdAt
  customer: { fullName, email, phone, address, city, postalCode? }
  items: [{ productId, name, size, qty, unitPrice }]
  subtotal, deliveryCharge, total     # all computed SERVER-SIDE
  isGuest, userId?
reviews/{productId}/{reviewId}
  rating, comment, displayName, createdAt
  orderId, verifiedPurchase, hidden
settings/
  deliveryCharge, ...
```

Notes: RTDB has no queries across nested keys, so denormalise for listing and filtering.
Order totals must be recomputed server-side at confirmation (§17), and stock re-checked at
the same moment (§11).

---

## 7. Suggested build order

Each step should end in something runnable and visible.

1. **Foundation + catalog** ← *start here*
2. Product details page with size selection and stock states
3. Cart (with size + quantity)
4. Checkout with full validation (§17) and server-side total calculation
5. Order success page with the delivery animation (§12)
6. Landing page (hero, featured, categories, testimonials, footer) (§2)
7. Search, filters, sorting (§13, §14)
8. Auth + reviews (§16)
9. Admin dashboard — *spec still pending from the client*

### First task in detail

**Foundation + catalog.** Establish the data model and prove it end to end with real data:

- Agree the RTDB schema in section 6 above.
- Write a seed script that populates a handful of realistic products (shirts, hoodies) with
  per-size stock and placeholder images.
- Build server-side data access in `src/lib/firebase/` for listing products and fetching one
  by slug.
- Build the shared UI shell — header, footer, brand palette, typography — and the Products
  page rendering real data from the database.

This proves the whole stack works with real data and gives every later step something to
build on.

---

## 8. Open questions for the user

- **Logo and brand identity** — the spec asks for a custom logo (§1). No colours,
  typography, or logo direction have been chosen. Ask before inventing a brand look.
- **Product images** — no real product photography exists. Placeholders for now?
- **Admin dashboard spec** — explicitly deferred by the client (§8). Only the requirement
  that confirmed orders are stored and visible is known.
- **Auth provider** — sign-in is needed for reviews (§16), but no method has been chosen
  (email/password, Google, etc.). Note that rules are deny-all and there is no client
  Firebase SDK, so this needs a deliberate decision.
- **Delivery charge rules** — flat rate, or per city? Admin-configurable is all that's
  specified.
