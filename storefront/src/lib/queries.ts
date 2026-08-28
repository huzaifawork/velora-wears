import type { Category, Product, ProductSummary, Review, Settings } from "@shared/types";
import type {
  CatalogSource,
  ListProductsOptions,
  SortOption,
} from "@/lib/sources/CatalogSource";

export type { ListProductsOptions, SortOption };

/**
 * The storefront's read layer — the ONLY module pages and components may import
 * catalog data from.
 *
 * It does two things: it caches responses, and it picks where the data comes
 * from. Which source is live is decided once, here, by `VITE_DATA_SOURCE`:
 *
 *   demo      lib/sources/demoSource      frontend demo catalog (current)
 *   firebase  lib/sources/firebaseSource  Realtime Database (once Blaze is on)
 *
 * Both satisfy the same `CatalogSource` interface, so switching is a one-line
 * change in the environment and nothing above this file is touched. The source
 * module is imported dynamically, which also keeps the Firebase SDK out of the
 * bundle entirely while we are in demo mode (requirements section 19).
 *
 * Never import `lib/demoData.ts` from a component. Import from here.
 */

const DATA_SOURCE = import.meta.env.VITE_DATA_SOURCE ?? "demo";

let sourcePromise: Promise<CatalogSource> | undefined;

function source(): Promise<CatalogSource> {
  if (!sourcePromise) {
    sourcePromise =
      DATA_SOURCE === "firebase"
        ? import("@/lib/sources/firebaseSource").then((m) => m.firebaseSource)
        : import("@/lib/sources/demoSource").then((m) => m.demoSource);
  }
  return sourcePromise;
}

/**
 * Response cache. RTDB's `get()` does not cache the way a realtime listener
 * does, so moving between pages would otherwise refetch unchanged data
 * (requirements section 19). In-flight promises are cached too, so two
 * components mounting at once share a single read.
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

/** Product grid data — always summaries, never full products. */
export function listProducts({
  categorySlug,
  sort = "newest",
  limit = 24,
}: ListProductsOptions = {}): Promise<ProductSummary[]> {
  return cached(`list:${categorySlug ?? "all"}:${sort}:${limit}`, async () =>
    (await source()).listProducts({ categorySlug, sort, limit }),
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

/** Search (requirements section 13 — runs on Enter/button, not per keystroke). */
export function searchProducts(term: string, limit = 24): Promise<ProductSummary[]> {
  return cached(`search:${term.trim().toLowerCase()}:${limit}`, async () =>
    (await source()).searchProducts(term, limit),
  );
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
