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
| Styling | Tailwind CSS v4 |
| Routing | React Router |
| Data | **Supabase Postgres**, read with the anon key under row level security |
| Live updates | **Supabase Realtime** — every table published |
| Trusted writes | **Supabase Edge Functions** (Deno, service role key) |
| Package manager | npm (workspaces) |

## Repository layout

```
storefront/            React + Vite storefront
admin/                 Admin dashboard - owned by the second developer
supabase/
  migrations/          THE DATABASE - schema, RLS policies, place_order()
  functions/place-order/   Edge Function - trusted server-side code
shared/                Shared TypeScript types - the data contract
```

`storefront` and `shared` are npm workspaces. `supabase/functions/` is Deno, not Node — it
has no `package.json` and is deployed by the Supabase CLI.

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

npm run dev                       # Vite dev server, default port 5173
```

The catalog is served from demo data in the frontend (`VITE_DATA_SOURCE=demo`) until the
admin dashboard exists to create real products. **The live database is deliberately empty;
mock data is never written to it.**

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Storefront dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run functions:deploy` | Deploy the `place-order` Edge Function |
| `npm run db:types` | Regenerate `shared/database.types.ts` from the live schema |

Supabase commands need `SUPABASE_ACCESS_TOKEN` exported and the project ref — see
[`context.md`](context.md) section 5.

## Team

Two developers share this repository and one database:

- **Developer A** — storefront, Edge Functions, order flow.
- **Developer B** — admin dashboard (see [`admin/README.md`](admin/README.md)).

[`supabase/migrations/`](supabase/migrations/) is the source of truth for the database, and
[`shared/types.ts`](shared/types.ts) for the shape the applications pass around. Changing
either is a breaking change for the other developer — agree it first.
