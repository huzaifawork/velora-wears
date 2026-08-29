import type {
  Category,
  Product,
  ProductSummary,
  Review,
  Settings,
  SiteImage,
} from "@shared/types";
import { DEFAULT_SORT, normaliseSearch } from "@/lib/sources/CatalogSource";
import type {
  CatalogSource,
  ListProductsOptions,
  SortOption,
} from "@/lib/sources/CatalogSource";

export type { ListProductsOptions, SortOption };
export { DEFAULT_SORT, SORT_OPTIONS } from "@/lib/sources/CatalogSource";

/**
 * The storefront's read layer — the ONLY module pages and components may import
 * catalog data from.
 *
 * It does two things: it caches responses, and it picks where the data comes
 * from. Which source is live is decided once, here, by `VITE_DATA_SOURCE`:
 *
 *   demo      lib/sources/demoSource      frontend demo catalog
 *   supabase  lib/sources/supabaseSource  the live Postgres database
 *
 * Both satisfy the same `CatalogSource` interface, so switching is a one-line
 * change in the environment and nothing above this file is touched. The source
 * module is imported dynamically, which also keeps the Supabase SDK out of the
 * bundle entirely while we are in demo mode (requirements section 19).
 *
 * Never import `lib/demoData.ts` from a component. Import from here.
 */

const DATA_SOURCE = import.meta.env.VITE_DATA_SOURCE ?? "demo";

/**
 * True when the storefront is reading the real database rather than the demo
 * catalog. Realtime asks, because there is nothing to subscribe to in demo mode.
 */
export function isLiveSource(): boolean {
  return DATA_SOURCE === "supabase";
}

let sourcePromise: Promise<CatalogSource> | undefined;

function source(): Promise<CatalogSource> {
  if (!sourcePromise) {
    sourcePromise = isLiveSource()
      ? import("@/lib/sources/supabaseSource").then((m) => m.supabaseSource)
      : import("@/lib/sources/demoSource").then((m) => m.demoSource);
  }
  return sourcePromise;
}

/**
 * Response cache. A PostgREST request is a plain HTTP call with no client-side
 * cache of its own, so moving between pages would otherwise refetch unchanged
 * data (requirements section 19). In-flight promises are cached too, so two
 * components mounting at once share a single read.
 *
 * Supabase Realtime is what keeps this honest: when the catalog changes in the
 * database, `useCatalogRealtime` drops the cache and the mounted pages re-read,
 * so a cached price can never be shown after it has been edited.
 */
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
const TTL_MS = 60_000;

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;

  const value = load().catch((err) => {
    cache.delete(key); // never cache a failure
    throw err;
  });
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Drops every cached read. Used after a write, and by tests. */
export function clearCatalogCache(): void {
  cache.clear();
}

/**
 * Product grid data — always summaries, never full products.
 *
 * This is the ONE list read: the products page, a category, a search and the
 * landing strips all come through here (requirements sections 3, 5, 13 and 14).
 * The cache key has to name every option, or two different pages of results
 * would share an entry.
 */
export function listProducts({
  categorySlug,
  search,
  inStockOnly = false,
  sort = DEFAULT_SORT,
  limit = 24,
}: ListProductsOptions = {}): Promise<ProductSummary[]> {
  const term = normaliseSearch(search);
  const key = `list:${categorySlug ?? "all"}:${term}:${inStockOnly}:${sort}:${limit}`;

  return cached(key, async () =>
    (await source()).listProducts({
      categorySlug,
      search: term || undefined,
      inStockOnly,
      sort,
      limit,
    }),
  );
}

/** Detail view — one full product, fetched only when the user opens it. */
export function getProductBySlug(slug: string): Promise<Product | null> {
  return cached(`product:${slug}`, async () => (await source()).getProductBySlug(slug));
}

/**
 * The list projection for one product, read alongside the full record on the
 * detail page. It carries the PRECOMPUTED rating average, review count and
 * stock flags, which the full `Product` record does not — the storefront must
 * never average reviews at read time (requirements sections 16 and 19).
 */
export function getProductSummaryBySlug(slug: string): Promise<ProductSummary | null> {
  return cached(`summary:${slug}`, async () => (await source()).getProductSummaryBySlug(slug));
}

export function getCategories(): Promise<Category[]> {
  return cached("categories", async () => (await source()).getCategories());
}

export function getSettings(): Promise<Settings | null> {
  return cached("settings", async () => (await source()).getSettings());
}

/** Visible reviews for one product, newest first (requirements section 16). */
export function listReviews(productId: string, limit = 20): Promise<Review[]> {
  return cached(`reviews:${productId}:${limit}`, async () =>
    (await source()).listReviews(productId, limit),
  );
}

/** Verified customer reviews for the landing page (requirements sections 2 and 16). */
export function listTestimonials(limit = 6): Promise<Review[]> {
  return cached(`testimonials:${limit}`, async () => (await source()).listTestimonials(limit));
}

/**
 * The landing page's featured strip (requirements section 8).
 *
 * Chosen and ordered by the admin dashboard. When nothing has been chosen the
 * source falls back to the newest N — which is what this strip always showed
 * before the admin could pick — so the section is never empty and nothing about
 * the page changes for a shop that has not used the feature.
 */
export function listFeatured(limit = 8): Promise<ProductSummary[]> {
  return cached(`featured:${limit}`, async () => (await source()).listFeatured(limit));
}

/**
 * The hero images and promo banners the admin has uploaded (section 8).
 *
 * ONE read for both slots, because the landing page renders both and they live
 * in one table — two reads would be two round trips for one screen. An empty
 * array is the normal answer for a shop that has not uploaded anything, and
 * every component that takes these keeps its own default image and copy.
 */
export function listSiteImages(): Promise<SiteImage[]> {
  return cached("site-images", async () => (await source()).listSiteImages());
}
