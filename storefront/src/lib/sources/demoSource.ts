import type {
  Category,
  Product,
  ProductSummary,
  Review,
  Settings,
  SiteImage,
} from "@shared/types";
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
 * The TEMPORARY read layer — serves `lib/demoData.ts` until the admin dashboard
 * exists to create real products (requirements section 18, "Data source").
 * The live database is deliberately EMPTY; mock data is never written to it.
 *
 * It deliberately imitates the Realtime Database rather than being convenient:
 *
 *  - every function is async, so no caller can accidentally depend on data
 *    being available synchronously;
 *  - filtering and ordering go through the SAME `applyFilters` and
 *    `sortSummaries` helpers `supabaseSource` uses, so the two cannot disagree
 *    about what a search or a sort means;
 *  - search is a PREFIX match on `searchText`. Postgres does full SUBSTRING
 *    matching, so search is genuinely NARROWER here than in production — the
 *    one place the two sources deliberately differ. Widening it would be
 *    harmless, but the demo catalog is 12 products and prefix matching keeps
 *    this file honest about being a stand-in rather than a second engine.
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

/**
 * The featured strip.
 *
 * The demo catalog has no admin and therefore nothing marked featured, so this
 * is the newest N — exactly what the landing page showed before the featured
 * feature existed. That is not a stub: it is the same fallback the live source
 * applies when a real shop has not chosen anything yet, so demo mode and an
 * un-configured live shop look the same, which is the point of this file.
 */
async function listFeatured(limit: number): Promise<ProductSummary[]> {
  const rows = applyFilters(demoSummaries, {
    inStockOnly: false,
    sort: "newest",
    limit,
  });
  return sortSummaries(clone(rows), "newest").slice(0, limit);
}

/**
 * Admin-managed landing page imagery.
 *
 * Always EMPTY here, deliberately. There is no admin dashboard behind the demo
 * catalog, and every component that reads these keeps its own committed default
 * image and copy — so returning nothing is what makes demo mode render the
 * landing page precisely as it did before this method existed.
 */
async function listSiteImages(): Promise<SiteImage[]> {
  return [];
}

export const demoSource: CatalogSource = {
  listProducts,
  getProductBySlug,
  getProductSummaryBySlug,
  getCategories,
  getSettings,
  listReviews,
  listTestimonials,
  listFeatured,
  listSiteImages,
};
