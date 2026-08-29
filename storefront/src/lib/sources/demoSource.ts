import type { Category, Product, ProductSummary, Review, Settings } from "@shared/types";
import {
  demoCategories,
  demoProducts,
  demoReviews,
  demoSettings,
  demoSummaries,
} from "@/lib/demoData";
import {
  applyFilters,
  sortSummaries,
  type CatalogSource,
  type ResolvedListOptions,
} from "@/lib/sources/CatalogSource";

/**
 * The TEMPORARY read layer — serves `lib/demoData.ts` while the client has not
 * bought the Blaze plan (requirements section 18, "Data source").
 *
 * It deliberately imitates the Realtime Database rather than being convenient:
 *
 *  - every function is async, so no caller can accidentally depend on data
 *    being available synchronously;
 *  - filtering and ordering go through the SAME `applyFilters` and
 *    `sortSummaries` helpers `firebaseSource` uses, so the two cannot disagree
 *    about what a search or a sort means;
 *  - search is therefore a PREFIX match on `searchText`, because that is all a
 *    Realtime Database `startAt`/`endAt` query can do — matching mid-string
 *    here would quietly break the day the flag flips.
 *
 * The one thing it does not imitate is the over-fetch window: there is no
 * server round trip to bound, so it filters the whole demo catalog and trims.
 * That difference is invisible above this file.
 *
 * Deleted together with `demoData.ts` when the switch happens.
 */

/** Copy on the way out — callers must not be able to mutate the catalog. */
function clone<T>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

/**
 * The one list read — browsing, category filtering, search, the in-stock
 * filter and sorting (requirements sections 3, 5, 11, 13 and 14).
 */
async function listProducts(options: ResolvedListOptions): Promise<ProductSummary[]> {
  const rows = applyFilters(demoSummaries, options);
  return sortSummaries(clone(rows), options.sort).slice(0, options.limit);
}

async function getProductBySlug(slug: string): Promise<Product | null> {
  const found = demoProducts.find((p) => p.slug === slug && p.active);
  return found ? structuredClone(found) : null;
}

async function getProductSummaryBySlug(slug: string): Promise<ProductSummary | null> {
  const found = demoSummaries.find((p) => p.slug === slug && p.active);
  return found ? { ...found } : null;
}

async function getCategories(): Promise<Category[]> {
  return clone(demoCategories).sort((a, b) => a.sortOrder - b.sortOrder);
}

async function getSettings(): Promise<Settings | null> {
  return { ...demoSettings };
}

/** Newest first, hidden reviews excluded — an admin hides spam (section 16). */
async function listReviews(productId: string, limit: number): Promise<Review[]> {
  const rows = demoReviews.filter((r) => r.productId === productId && !r.hidden);
  return clone(rows)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Testimonials take the best review of each product rather than the newest
 * overall, so the landing strip shows a spread of the collection instead of
 * three reviews of the same hoodie. Anything hidden, unverified, or below four
 * stars is never a testimonial.
 */
async function listTestimonials(limit: number): Promise<Review[]> {
  const bestPerProduct = new Map<string, Review>();

  for (const review of demoReviews) {
    if (review.hidden || !review.verifiedPurchase || review.rating < 4) continue;
    const held = bestPerProduct.get(review.productId);
    const better =
      !held ||
      review.rating > held.rating ||
      (review.rating === held.rating && review.createdAt > held.createdAt);
    if (better) bestPerProduct.set(review.productId, review);
  }

  return clone([...bestPerProduct.values()])
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export const demoSource: CatalogSource = {
  listProducts,
  getProductBySlug,
  getProductSummaryBySlug,
  getCategories,
  getSettings,
  listReviews,
  listTestimonials,
};
