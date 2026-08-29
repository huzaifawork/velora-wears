import { productPath as shopProductPath, HOME as SHOP_HOME } from "@/lib/routes";

/**
 * Every URL the dashboard links to, in one place — the same discipline
 * `storefront/src/lib/routes.ts` holds the shop to, and for the same reason:
 * the sidebar, the breadcrumbs, a redirect after a save and a deep link from
 * the dashboard home all have to agree on ONE address per screen.
 *
 * ---------------------------------------------------------------------------
 * EVERYTHING LIVES UNDER `/admin`
 * ---------------------------------------------------------------------------
 * The dashboard is mounted inside the storefront application (see
 * `storefront/vite.config.ts` for why), so its routes share an address space
 * with the shop's. `/products` is the customer's catalogue; `/admin/products`
 * is the one that edits it. The prefix is written once, here.
 *
 * ---------------------------------------------------------------------------
 * "VIEW IN SHOP" IS NOW AN ORDINARY LINK
 * ---------------------------------------------------------------------------
 * It used to be an absolute URL to another deployment, opened in a new tab.
 * The shop is the same application now, so these are plain in-app paths built
 * from the storefront's OWN route helpers — which means a change to the
 * canonical product URL cannot leave the dashboard pointing at a dead one.
 */

const ADMIN = "/admin";

export const DASHBOARD = ADMIN;
export const PRODUCTS = `${ADMIN}/products`;
export const PRODUCT_NEW = `${ADMIN}/products/new`;
export const CATEGORIES = `${ADMIN}/categories`;
export const ORDERS = `${ADMIN}/orders`;
export const CUSTOMERS = `${ADMIN}/customers`;
export const FEATURED = `${ADMIN}/featured`;
export const SITE_IMAGES = `${ADMIN}/site-images`;
export const INVENTORY = `${ADMIN}/inventory`;
export const REVIEWS = `${ADMIN}/reviews`;
export const DELIVERY = `${ADMIN}/delivery`;
export const ACCOUNT = `${ADMIN}/account`;

/** The product editor for one existing product. */
export function productPath(id: string): string {
  return `${PRODUCTS}/${encodeURIComponent(id)}`;
}

/**
 * One order, as a deep-linkable URL rather than drawer state.
 *
 * An admin on the phone to a customer needs to be able to send themselves the
 * order they are looking at, and a list whose selection lives only in React
 * state cannot be linked to or reloaded onto.
 */
export function orderPath(id: string): string {
  return `${ORDERS}/${encodeURIComponent(id)}`;
}

/** Products filtered to one category — the link from the categories table. */
export function productsInCategoryPath(slug: string): string {
  return `${PRODUCTS}?category=${encodeURIComponent(slug)}`;
}

/** Inventory filtered to what needs attention — the link from the dashboard cards. */
export function inventoryPath(filter: "low" | "out" | "all" = "all"): string {
  return filter === "all" ? INVENTORY : `${INVENTORY}?stock=${filter}`;
}

/** Orders filtered to one status — the link from the dashboard cards. */
export function ordersWithStatusPath(status: string): string {
  return `${ORDERS}?status=${encodeURIComponent(status)}`;
}

/* ---------------------------------------------------------------------------
 * The shop, as the customer sees it. In-app routes — the same application.
 * ------------------------------------------------------------------------ */

/** A product's public page. Only meaningful for an ACTIVE product. */
export function shopProductUrl(slug: string): string {
  return shopProductPath(slug);
}

export function shopHomeUrl(): string {
  return SHOP_HOME;
}
