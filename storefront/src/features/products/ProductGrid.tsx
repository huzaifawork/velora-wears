import type { Category, ProductSummary } from "@shared/types";
import { ProductCard, ProductCardSkeleton } from "@/features/products/ProductCard";

/**
 * The product grid — loading, empty, and loaded states in one place, so the
 * landing page, the products page, category pages, and search results all
 * behave identically (requirements sections 2, 3, 5, 13, 15).
 *
 * Two columns on a phone, three on a tablet, four on a desktop.
 */
export function ProductGrid({
  products,
  categories = [],
  loading = false,
  skeletonCount = 4,
  emptyMessage = "No products to show yet.",
  /** How many cards are above the fold and should load eagerly. */
  eagerCount = 0,
  className = "",
}: {
  products: ProductSummary[] | undefined;
  /** Used to show a category's display name on each card. */
  categories?: Category[];
  loading?: boolean;
  skeletonCount?: number;
  emptyMessage?: string;
  eagerCount?: number;
  className?: string;
}) {
  const grid = `grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 lg:grid-cols-4 ${className}`;

  if (loading) {
    return (
      <div className={grid}>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-soft">{emptyMessage}</p>;
  }

  const names = new Map(categories.map((c) => [c.slug, c.name]));

  return (
    <div className={grid}>
      {products.map((product, i) => (
        <ProductCard
          key={product.id}
          product={product}
          categoryName={names.get(product.categorySlug)}
          eager={i < eagerCount}
        />
      ))}
    </div>
  );
}
