# Admin Dashboard

**Owned by the second developer** (Huzaifa's friend). Not built by the storefront developer.

This folder is a placeholder so the dashboard can live in the same repository as the
storefront, sharing one Firebase Realtime Database.

## Before writing any code, read

- [`../shared/types.ts`](../shared/types.ts) — the **data contract**. Both apps must
  conform to it. Changing a type there is a breaking change for the other developer;
  agree it between both sides first.
- [`../Requirements.md`](../Requirements.md) sections 8, 10, 11, 18, 19, and 20.
- [`../database.rules.json`](../database.rules.json) — what the dashboard is allowed to do.

## What the dashboard is responsible for

- Managing products, categories, images, and per-size stock (§11).
- Viewing and managing confirmed orders (§8).
- Configuring delivery charges, which flow into checkout totals (§10).
- Moderating customer reviews (§16).

## Two obligations that the storefront depends on

1. **Keep `productSummaries/{id}` in sync with `products/{id}`.** The storefront's list,
   search, and category views read only `productSummaries`, because it is small and
   carries a card-sized image. Whenever a product is created or edited, rewrite its
   summary in the same operation. A stale summary shows customers the wrong price.

2. **Write both image variants.** Every product image needs a small `thumb` for cards
   and a `full` for the detail gallery (§19). Uploading only a full-size image makes the
   product grid slow on mobile.

## Access

Client writes are denied by default. The dashboard authenticates with Firebase Auth, and
the signed-in user's UID must be present under `admins/{uid} = true` in the database.
Add that node manually in the Firebase console for each admin account.
