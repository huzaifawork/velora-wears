# Velora Wears

E-commerce storefront for **Velora Wears**, a fashion and clothing brand, backed by the
**Firebase Realtime Database**.

> **Status: scaffold only.** No product features are implemented yet.
> Start from [`context.md`](context.md), then read [`Requirements.md`](Requirements.md).

## Stack

| Layer | Choice |
| --- | --- |
| Storefront | React 19 + Vite 7 + TypeScript |
| Styling | Tailwind CSS v4 |
| Routing | React Router |
| Data | Firebase **Realtime Database** |
| Trusted writes | Firebase **Cloud Functions** (Admin SDK) |
| Package manager | npm (workspaces) |

## Repository layout

```
storefront/   React + Vite storefront
admin/        Admin dashboard - owned by the second developer
functions/    Cloud Functions - trusted server-side code
shared/       Shared TypeScript types - the data contract
```

`storefront` and `shared` are npm workspaces. `functions/` installs its own dependencies
separately, because Firebase deploys that folder on its own.

## Architecture

The storefront is a browser SPA, so it **cannot** hold the Admin SDK service account key —
that would give any visitor full control of the database. So:

- The browser **reads** the public catalog directly with the Firebase client SDK.
- Anything touching money, stock, or customer data — placing an order, submitting a review —
  goes through **Cloud Functions** running trusted server-side code.
- Database rules deny all direct client writes.

## Credentials

**Admin SDK service account key.** Required only for local scripts and the emulator;
deployed functions use the runtime service account.

- Place the key file locally yourself — it is not in this repository.
- Its path is configurable via `FIREBASE_SERVICE_ACCOUNT_PATH`.
- It is **never committed**. `.gitignore` blocks `*serviceAccountKey.json`,
  `*firebase-adminsdk*.json`, `*service-account*.json`, `secrets/`, and `credentials/`.

If a key is ever exposed, revoke it in **Firebase Console → Project settings → Service
accounts** and issue a new one.

**Storefront web config.** The `VITE_FIREBASE_*` values are compiled into the browser bundle
and are **public by design** — that is how the Firebase web SDK works. They are not secrets;
security comes from the database rules.

## Getting started

```bash
npm install                       # storefront + shared workspaces

cp storefront/.env.example storefront/.env.local
# fill in with: firebase apps:sdkconfig WEB --project velora-wears

npm run dev                       # Vite dev server, default port 5173
```

For the order flow, install functions dependencies once by running `npm install` inside
`functions/`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Storefront dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run emulators` | Local database + functions emulators |
| `npm run deploy:rules` | Deploy `database.rules.json` — **overwrites live rules** |
| `npm run deploy:functions` | Deploy Cloud Functions — **requires the Blaze plan** |

## Team

Two developers share this repository and one database:

- **Developer A** — storefront, Cloud Functions, order flow.
- **Developer B** — admin dashboard (see [`admin/README.md`](admin/README.md)).

[`shared/types.ts`](shared/types.ts) is the **single source of truth** for stored data.
Changing a type there is a breaking change for the other developer — agree it first.
