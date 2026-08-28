import type { Category, Product, ProductSummary, Review, Settings } from "@shared/types";

/**
 * The catalog read contract.
 *
 * Two implementations satisfy it — `firebaseSource` (the Realtime Database, the
 * real thing) and `demoSource` (the throwaway frontend catalog we review
 * against until the client buys Blaze). `lib/queries.ts` picks one at runtime
 * from `VITE_DATA_SOURCE` and nothing above it can tell the difference.
 *
 * Keeping this interface here — rather than letting each implementation define
 * its own shape — is what guarantees the two stay signature-compatible: adding
 * a method to one without the other stops compiling.
 */

export type SortOption = "newest" | "price-asc" | "price-desc";

export interface ListProductsOptions {
  categorySlug?: string;
  sort?: SortOption;
  limit?: number;
}

/** Options after `queries.ts` has applied its defaults — implementations get concrete values. */
export interface ResolvedListOptions {
  categorySlug?: string;
  sort: SortOption;
  limit: number;
}

export interface CatalogSource {
  listProducts(options: ResolvedListOptions): Promise<ProductSummary[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
  /** The list projection for ONE product — its precomputed rating and stock flags. */
  getProductSummaryBySlug(slug: string): Promise<ProductSummary | null>;
  searchProducts(term: string, limit: number): Promise<ProductSummary[]>;
  getCategories(): Promise<Category[]>;
  getSettings(): Promise<Settings | null>;
  /** Visible reviews for one product, newest first (section 16). */
  listReviews(productId: string, limit: number): Promise<Review[]>;
  /** Recent reviews for the landing page testimonials (sections 2 and 16). */
  listTestimonials(limit: number): Promise<Review[]>;
}

/** Shared by both implementations so ordering cannot drift between them. */
export function sortSummaries(rows: ProductSummary[], sort: SortOption): ProductSummary[] {
  switch (sort) {
    case "price-asc":
      return rows.sort((a, b) => a.price - b.price);
    case "price-desc":
      return rows.sort((a, b) => b.price - a.price);
    default:
      return rows.sort((a, b) => b.createdAt - a.createdAt);
  }
}
