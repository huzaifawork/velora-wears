import type { Category, Product, ProductSummary, Review, Settings } from "@shared/types";

/**
 * The catalog read contract.
 *
 * Two implementations satisfy it — `supabaseSource` (Postgres, the real thing)
 * and `demoSource` (the throwaway frontend catalog we review against until the
 * admin dashboard can create real products). `lib/queries.ts` picks one at
 * runtime from `VITE_DATA_SOURCE` and nothing above it can tell the difference.
 *
 * Keeping this interface here — rather than letting each implementation define
 * its own shape — is what guarantees the two stay signature-compatible: adding
 * a method to one without the other stops compiling.
 */

export type SortOption = "newest" | "price-asc" | "price-desc" | "rating";

/** The sort control's options, in the order they are offered (section 14). */
export const SORT_OPTIONS: ReadonlyArray<{ value: SortOption; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Best rated" },
];

export const DEFAULT_SORT: SortOption = "newest";

/**
 * Everything the products page can ask for (requirements sections 13 and 14).
 *
 * Search is an OPTION here rather than a separate method, because searching and
 * browsing produce the same thing — a filtered, sorted page of summaries — and
 * a visitor who searches must still be able to narrow by category, hide what is
 * sold out, and sort by price. Two entry points would have meant two sets of
 * filtering code, one of which would quietly not support half of them.
 */
export interface ListProductsOptions {
  categorySlug?: string;
  /** Free text (requirements section 13). Substring on Postgres; prefix in demo mode. */
  search?: string;
  /** Hide what cannot be bought (requirements sections 11 and 14). */
  inStockOnly?: boolean;
  sort?: SortOption;
  limit?: number;
}

/** Options after `queries.ts` has applied its defaults — implementations get concrete values. */
export interface ResolvedListOptions {
  categorySlug?: string;
  search?: string;
  inStockOnly: boolean;
  sort: SortOption;
  limit: number;
}

export interface CatalogSource {
  /**
   * The one list read. Handles browsing, category filtering, search, the
   * in-stock filter and sorting. Postgres applies all of it in one statement;
   * the demo source reproduces the same rules in memory through the shared
   * `applyFilters` and `sortSummaries` helpers below, so the two cannot drift.
   */
  listProducts(options: ResolvedListOptions): Promise<ProductSummary[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
  /** The list projection for ONE product — its precomputed rating and stock flags. */
  getProductSummaryBySlug(slug: string): Promise<ProductSummary | null>;
  getCategories(): Promise<Category[]>;
  getSettings(): Promise<Settings | null>;
  /** Visible reviews for one product, newest first (section 16). */
  listReviews(productId: string, limit: number): Promise<Review[]>;
  /** Recent reviews for the landing page testimonials (sections 2 and 16). */
  listTestimonials(limit: number): Promise<Review[]>;
}

/** Normalised the same way on both sources, and by the page that builds the URL. */
export function normaliseSearch(term: string | undefined): string {
  return (term ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Shared by both implementations so ordering cannot drift between them.
 *
 * Sorting is finished in memory even when the server ordered the read, because
 * a query can only order by one field and the page may have been narrowed after
 * that. Sorting an already-sorted, bounded array costs nothing.
 *
 * Every comparison falls back to `createdAt`, so two pieces at the same price
 * or the same rating always come out in the same order rather than shuffling
 * between reads.
 */
export function sortSummaries(rows: ProductSummary[], sort: SortOption): ProductSummary[] {
  const newestFirst = (a: ProductSummary, b: ProductSummary) => b.createdAt - a.createdAt;

  switch (sort) {
    case "price-asc":
      return rows.sort((a, b) => a.price - b.price || newestFirst(a, b));
    case "price-desc":
      return rows.sort((a, b) => b.price - a.price || newestFirst(a, b));
    case "rating":
      // An unrated piece is not a zero-star piece — it sorts below everything
      // rated rather than competing with the worst review in the shop.
      return rows.sort(
        (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount || newestFirst(a, b),
      );
    default:
      return rows.sort(newestFirst);
  }
}

/**
 * The filter rules, in one place, so the demo source cannot drift from what the
 * database does.
 *
 * `supabaseSource` does NOT call this — Postgres applies every filter in the
 * query itself, which is the whole advantage of a relational database here.
 * This is the demo source's implementation of the same rules, kept beside the
 * interface they belong to rather than hidden inside one implementation.
 *
 * `searchText` is the denormalised lowercase "name + category". Matching here is
 * PREFIX-only while Postgres does substring, which makes demo search narrower
 * than production — the one deliberate difference between the two sources.
 */
export function applyFilters(
  rows: ProductSummary[],
  { categorySlug, search, inStockOnly }: ResolvedListOptions,
): ProductSummary[] {
  const term = normaliseSearch(search);

  return rows.filter((row) => {
    if (!row.active) return false;
    if (categorySlug && row.categorySlug !== categorySlug) return false;
    if (inStockOnly && !row.inStock) return false;
    if (term && !row.searchText.startsWith(term)) return false;
    return true;
  });
}
