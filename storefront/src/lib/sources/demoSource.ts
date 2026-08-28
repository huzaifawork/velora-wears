import type { Category, Product, ProductSummary, Review, Settings } from "@shared/types";
import {
  demoCategories,
  demoProducts,
  demoReviews,
  demoSettings,
  demoSummaries,
} from "@/lib/demoData";
import {
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
 *  - results are filtered by `active`, sorted, and limited exactly the way
 *    `firebaseSource` does, through the same shared `sortSummaries` helper;
 *  - search is a PREFIX match on `searchText`, because that is all a Realtime
 *    Database `startAt`/`endAt` query can do — matching mid-string here would
 *    quietly break the day the flag flips.
 *
 * Deleted together with `demoData.ts` when the switch happens.
 */

/** Copy on the way out — callers must not be able to mutate the catalog. */
function clone<T>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

async function listProducts({
  categorySlug,
  sort,
  limit,
}: ResolvedListOptions): Promise<ProductSummary[]> {
  const rows = demoSummaries.filter(
    (p) => p.active && (!categorySlug || p.categorySlug === categorySlug),
  );
  return sortSummaries(clone(rows), sort).slice(0, limit);
}

async function getProductBySlug(slug: string): Promise<Product | null> {
  const found = demoProducts.find((p) => p.slug === slug && p.active);
  return found ? structuredClone(found) : null;
}

async function searchProducts(term: string, limit: number): Promise<ProductSummary[]> {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  const rows = demoSummaries.filter((p) => p.active && p.searchText.startsWith(t));
  return clone(rows).slice(0, limit);
}

async function getCategories(): Promise<Category[]> {
  return clone(demoCategories).sort((a, b) => a.sortOrder - b.sortOrder);
}

async function getSettings(): Promise<Settings | null> {
  return { ...demoSettings };
}

async function listTestimonials(limit: number): Promise<Review[]> {
  const rows = demoReviews.filter((r) => !r.hidden && r.verifiedPurchase);
  return clone(rows)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export const demoSource: CatalogSource = {
  listProducts,
  getProductBySlug,
  searchProducts,
  getCategories,
  getSettings,
  listTestimonials,
};
