/**
 * Every internal URL the storefront links to, in one place.
 *
 * This exists because of requirements section 5. A category is reachable from
 * the header, the footer, the landing bento, the /categories index, the
 * breadcrumbs on a product, and the "more from this category" strip — six
 * surfaces that must agree on ONE canonical URL, or the same category ends up
 * with two addresses and the active-state logic in the header stops matching.
 *
 * The canonical shape for a category is `/products?category=<slug>`: the
 * category view and the full catalog are the same page in different states,
 * which is also the URL requirements section 14's filter controls will write
 * to. If that decision is ever revisited, `categoryPath` is the only thing that
 * changes — nothing else in the app builds a category link by hand.
 */

export const HOME = "/";
export const PRODUCTS = "/products";
export const CATEGORIES = "/categories";

/** The bag (requirements section 6). The drawer is a shortcut over this page. */
export const CART = "/cart";

/** Checkout (requirements section 7). Guest and signed-in alike — no account needed. */
export const CHECKOUT = "/checkout";

/**
 * The order success page (requirements section 7).
 *
 * It takes no order number in the URL, deliberately. The storefront cannot read
 * an order back — `orders` is invisible to the anon key because it holds the
 * customer's name, phone and address (section 17) — so a URL carrying the
 * number could not load anything, and a shared or bookmarked link would render
 * an empty page that looks broken. The confirmation is handed over in
 * `lib/orderReceipt.ts` instead, and the page is one visit long.
 */
export const ORDER_CONFIRMED = "/order/confirmed";

/** The canonical URL for browsing one category (requirements section 5). */
export function categoryPath(slug: string): string {
  return `${PRODUCTS}?category=${encodeURIComponent(slug)}`;
}

/** The product detail page (requirements section 4). */
export function productPath(slug: string): string {
  return `${PRODUCTS}/${encodeURIComponent(slug)}`;
}

/** Search results (requirements section 13) — a state of the products page. */
export function searchPath(term: string): string {
  return `${PRODUCTS}?q=${encodeURIComponent(term)}`;
}
