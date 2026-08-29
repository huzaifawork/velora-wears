import {
  endAt,
  equalTo,
  get,
  limitToFirst,
  limitToLast,
  orderByChild,
  query,
  ref,
  startAt,
} from "firebase/database";

import type { Category, Product, ProductSummary, Review, Settings } from "@shared/types";
import { getDb } from "@/lib/firebase";
import {
  applyFilters,
  normaliseSearch,
  sortSummaries,
  type CatalogSource,
  type ResolvedListOptions,
} from "@/lib/sources/CatalogSource";

/**
 * The REAL read layer — Realtime Database via the Firebase client SDK.
 *
 * Currently dormant: `VITE_DATA_SOURCE` is `demo` until the client buys the
 * Blaze plan and the catalog is seeded. Do not delete it; flipping that flag is
 * the whole switch. Everything here is loaded lazily by `queries.ts`, so in
 * demo mode the Firebase SDK is never even downloaded by the browser.
 *
 * Rules of thumb enforced here (requirements sections 18-19):
 *
 *  1. LIST views read `productSummaries`, never `products`. Summaries are small
 *     and carry a card-sized `thumb`, so a grid of 24 products does not pull 24
 *     full descriptions and full-resolution image URLs.
 *  2. Every `orderByChild` field must have a matching `.indexOn` in
 *     database.rules.json, or Firebase sorts client-side after downloading the
 *     whole node — the single most common cause of a slow RTDB app.
 *  3. Always bound reads with a limit. Never read an unbounded collection.
 *
 * Response caching lives one level up, in `queries.ts`, so both sources share it.
 */

function toArray<T>(val: Record<string, T> | null): T[] {
  return val ? Object.values(val) : [];
}

/**
 * How much to over-fetch when a filter has to be finished in the browser.
 *
 * THE CONSTRAINT: a Realtime Database query may use only ONE `orderByChild`, so
 * "search for shirt AND only in hoodies AND sort by price" cannot be expressed
 * server-side. Whichever filter the server applied, the rest run in memory —
 * and the server's `limit` is applied BEFORE those, so asking for exactly 24
 * and then discarding half of them would return 12 and wrongly look like the
 * end of the catalog.
 *
 * So when a filter is left over, the window is widened and the page is trimmed
 * afterwards. It stays bounded, which is what section 19 actually requires.
 */
const OVERFETCH = 4;
const MAX_FETCH = 200;

/**
 * Picks the single indexed query that fetches the smallest correct window, and
 * reports whether anything is left to do in memory.
 *
 * The order of preference matters: search is the narrowest filter there is, a
 * category is the next narrowest, and only when neither is present is it worth
 * spending the one `orderByChild` on the sort field itself.
 */
async function fetchWindow(options: ResolvedListOptions): Promise<ProductSummary[]> {
  const { categorySlug, search, sort, limit } = options;
  const base = ref(getDb(), "productSummaries");
  const term = normaliseSearch(search);

  // Anything the server cannot express is finished in the browser, so the
  // window has to be wide enough to survive it.
  const leftover = Boolean((term && categorySlug) || options.inStockOnly || term);
  const window = Math.min(leftover ? limit * OVERFETCH : limit, MAX_FETCH);

  if (term) {
    // Prefix match against the denormalised lowercase `searchText`
    // (requirements section 13). `` is the highest code point Firebase
    // will match, which is how RTDB expresses "everything starting with".
    const q = query(
      base,
      orderByChild("searchText"),
      startAt(term),
      endAt(`${term}`),
      limitToFirst(window),
    );
    return toArray<ProductSummary>((await get(q)).val());
  }

  if (categorySlug) {
    const q = query(base, orderByChild("categorySlug"), equalTo(categorySlug), limitToFirst(window));
    return toArray<ProductSummary>((await get(q)).val());
  }

  // No filter to spend the index on, so spend it on the sort. `price` is
  // indexed; "highest first" is `limitToLast`, which is how RTDB expresses it.
  if (sort === "price-asc") {
    return toArray<ProductSummary>(
      (await get(query(base, orderByChild("price"), limitToFirst(window)))).val(),
    );
  }
  if (sort === "price-desc") {
    return toArray<ProductSummary>(
      (await get(query(base, orderByChild("price"), limitToLast(window)))).val(),
    );
  }

  // `rating` has no index and is not worth one: sorting by it without a filter
  // means reading a page of the catalog either way, so it reads the newest.
  return toArray<ProductSummary>(
    (await get(query(base, orderByChild("createdAt"), limitToLast(window)))).val(),
  );
}

/**
 * The one list read — browsing, category filtering, search, the in-stock
 * filter and sorting (requirements sections 3, 5, 11, 13 and 14).
 */
async function listProducts(options: ResolvedListOptions): Promise<ProductSummary[]> {
  const rows = await fetchWindow(options);
  return sortSummaries(applyFilters(rows, options), options.sort).slice(0, options.limit);
}

/** Detail view — one full product, fetched only when the user opens it. */
async function getProductBySlug(slug: string): Promise<Product | null> {
  const q = query(ref(getDb(), "products"), orderByChild("slug"), equalTo(slug), limitToFirst(1));
  return toArray<Product>((await get(q)).val())[0] ?? null;
}

/**
 * The SUMMARY for one product, read alongside the full record on the detail
 * page (requirements sections 16 and 19).
 *
 * The rating average and the stock flags are precomputed at write time and live
 * only on the summary — the detail page must display them, not recompute an
 * average by reading every review. One indexed lookup of a small node.
 */
async function getProductSummaryBySlug(slug: string): Promise<ProductSummary | null> {
  const q = query(
    ref(getDb(), "productSummaries"),
    orderByChild("slug"),
    equalTo(slug),
    limitToFirst(1),
  );
  return toArray<ProductSummary>((await get(q)).val()).filter((p) => p.active)[0] ?? null;
}

async function getCategories(): Promise<Category[]> {
  const rows = toArray<Category>((await get(ref(getDb(), "categories"))).val());
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** `settings/public` — the only settings branch the rules expose to the browser. */
async function getSettings(): Promise<Settings | null> {
  return (await get(ref(getDb(), "settings/public"))).val();
}

/**
 * Reviews for one product, newest first.
 *
 * Reads `reviews/{productId}` only — never the whole `reviews` node — ordered by
 * the indexed `createdAt` and bounded with `limitToLast`, which is how RTDB
 * expresses "the most recent N". Hidden reviews are filtered client-side: the
 * rules keep them readable, and an admin hiding spam must not leave a gap in
 * the page (requirements sections 16 and 19).
 */
async function listReviews(productId: string, limit: number): Promise<Review[]> {
  const q = query(
    ref(getDb(), `reviews/${productId}`),
    orderByChild("createdAt"),
    limitToLast(limit),
  );
  return toArray<Review>((await get(q)).val())
    .filter((r) => !r.hidden)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Landing-page testimonials.
 *
 * Reviews are stored per product (`reviews/{productId}/{reviewId}`), so there is
 * no flat node to read the newest few from — pulling them would mean reading
 * every product's reviews, which section 19 forbids. Requirements section 16
 * resolves this with a denormalised, admin-maintained node of featured reviews;
 * until that section is built this returns nothing and the landing page simply
 * omits the strip.
 */
async function listTestimonials(): Promise<Review[]> {
  return [];
}

export const firebaseSource: CatalogSource = {
  listProducts,
  getProductBySlug,
  getProductSummaryBySlug,
  getCategories,
  getSettings,
  listReviews,
  listTestimonials,
};
