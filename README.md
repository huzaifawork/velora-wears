# Velora Wears

E-commerce storefront for **Velora Wears**, a Pakistani fashion and clothing brand, backed by
**Supabase**.

> Start from [`context.md`](context.md) — it is the state of the work — then read
> [`Requirements.md`](Requirements.md), which is the spec.

> **Migrated 2026-08-29.** This project previously ran on the Firebase Realtime Database.
> That project has been deleted and every trace of Firebase removed. Supabase Realtime is not
> a second database: Supabase *is* Postgres, and Realtime streams row changes from it.

## Stack

| Layer | Choice |
| --- | --- |
| Storefront | React 19 + Vite 7 + TypeScript |
| Admin dashboard | The same application, mounted at `/admin` — one build, one origin, one login |
| Styling | Tailwind CSS v4 |
| Routing | React Router |
| Data | **Supabase Postgres**, read with the anon key under row level security |
| Live updates | **Supabase Realtime** — every table published |
| Trusted writes | **Supabase Edge Functions** (Deno, service role key) |
| Package manager | npm (workspaces) |

## Repository layout

```
storefront/            THE application - React + Vite
admin/src/             the admin dashboard, compiled into it and served at /admin
supabase/
  migrations/          THE DATABASE - schema, RLS policies, place_order()
  functions/place-order/   Edge Function - trusted server-side code
shared/                Shared TypeScript types - the data contract
```

`storefront` and `shared` are npm workspaces. **`admin/` is not** — it has no `package.json`
and no build of its own; `storefront/vite.config.ts` aliases `@admin` at `admin/src` and
compiles it in. `supabase/functions/` is Deno, not Node — it is deployed by the Supabase CLI.

The dashboard is part of this application rather than a second one for one reason: **a
Supabase session belongs to a single origin.** Two deployments would mean two sessions and
therefore two login forms, and this project has exactly one. See
[`admin/README.md`](admin/README.md).

## Architecture

The storefront is a browser SPA, so it **cannot** hold the Supabase service role key — that
key bypasses row level security and would give any visitor full control of the database. So:

- The browser **reads** the public catalog with the **anon key**, constrained by row level
  security.
- The browser **subscribes** to Supabase Realtime, so stock and prices update without a
  refresh. Realtime re-checks row level security per subscriber.
- Anything touching money, stock, or customer data — placing an order, submitting a review —
  goes through an **Edge Function** running trusted server-side code.
- Row level security denies all direct client writes. `orders` has no insert policy for
  anonymous users at all.

The money and the stock live in SQL, not TypeScript: `place_order()` runs in one transaction
with `for update` locks, so two customers cannot both buy the last shirt.

## Credentials

**Nothing secret is in this repository, and nothing secret may be added to it — it is
public.**

| What | Where | Notes |
| --- | --- | --- |
| Supabase URL + anon key | `storefront/.env.local`, and Vercel | **Public by design.** Compiled into the browser bundle; security comes from row level security |
| Service role key | Supabase platform only | Injected into Edge Functions automatically. Never needed locally, never in `storefront/` |
| Personal access token | <https://supabase.com/dashboard/account/tokens> | For the CLI. Grants full account control — treat as a password |

If a key is ever exposed, rotate it in the Supabase dashboard.

## Getting started

```bash
npm install                       # storefront + shared workspaces

cp storefront/.env.example storefront/.env.local
# fill in from Supabase dashboard -> Project Settings -> API

npm run dev                       # http://localhost:5173        - the shop
                                  # http://localhost:5173/admin  - the dashboard
```

The catalog is still served from demo data in the frontend (`VITE_DATA_SOURCE=demo`). Flip it
to `supabase` once real products exist in the database — the admin dashboard is what creates
them. **The live database is deliberately empty; mock data is never written to it.**

The dashboard needs `supabase/migrations/20260830000001_admin_dashboard.sql` applied, and your
Supabase Auth user id present in the `admins` table. See [`admin/README.md`](admin/README.md).

## Signing in

**There is one sign-in form**, at `/account/sign-in`, and one kind of account. An
administrator is a customer account whose user id appears in the `admins` table — so the same
email and password that buy a hoodie open the dashboard, if that row exists.

After a successful sign-in the app asks the database `is_admin()` and routes on the answer:
an administrator lands on `/admin`, everyone else on their account (or on `?next=`, if they
were sent to sign in from somewhere specific — that always wins, so "sign in to check out"
still returns an admin to checkout).

Guest checkout (requirements section 7) is untouched by all of this and still requires no
account at all.

**Signing up creates a row in `public.profiles`**, written by a database trigger on
`auth.users` rather than by the form — so it cannot be skipped, forged or lost if the tab is
closed mid-flow. That table is what makes a customer visible to anything: `auth.users` is
never exposed over the API, and the name Supabase stores in user metadata is writable by the
user themselves, so neither could serve as a record. A customer edits their name and phone on
`/account`; an admin reads the directory at `/admin/customers`.

An order still keeps its own snapshot of the name, phone and address it was placed with.
Correcting a profile must never rewrite an address on a delivery already dispatched.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server (5173) — shop and dashboard |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript, no emit — covers `admin/src` too |
| `npm run lint` | ESLint — covers `admin/src` too |
| `npm run functions:deploy` | Deploy the `place-order` Edge Function |
| `npm run db:types` | Regenerate `shared/database.types.ts` from the live schema |

Supabase commands need `SUPABASE_ACCESS_TOKEN` exported and the project ref — see
[`context.md`](context.md) section 5.

## Team

Two developers share this repository and one database:

- **Developer A** — storefront, Edge Functions, order flow.
- **Developer B** — admin dashboard (see [`admin/README.md`](admin/README.md)).

The two halves now ship together, so the boundary is a code boundary rather than a deployment
one: `admin/src` imports the storefront only for the auth context, the shop's routes and the
Supabase client, and the storefront imports `admin/src` only to lazily mount it at `/admin`.
Everything else they share goes through [`shared/`](shared/).

[`supabase/migrations/`](supabase/migrations/) is the source of truth for the database, and
[`shared/types.ts`](shared/types.ts) for the shape the applications pass around. Changing
either is a breaking change for the other developer — agree it first.
