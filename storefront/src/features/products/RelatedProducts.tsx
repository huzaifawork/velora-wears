import { Link } from "react-router-dom";

import type { Category, ProductSummary } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductGrid } from "@/features/products/ProductGrid";

/**
 * "More from this category" under a product (requirements sections 4 and 5 —
 * browsing on by category).
 *
 * It reuses the summaries the detail page already reads and the shared
 * `ProductGrid`, so it costs no new query shape and cannot drift from the way
 * cards look everywhere else (section 18).
 */
const SHOWN = 4;

export function RelatedProducts({
  products,
  categories,
  categorySlug,
  categoryName,
  currentProductId,
  loading,
}: {
  products: ProductSummary[] | undefined;
  categories: Category[] | undefined;
  categorySlug: string;
  categoryName: string;
  currentProductId: string;
  loading: boolean;
}) {
  const others = products?.filter((p) => p.id !== currentProductId).slice(0, SHOWN);

  // Nothing to suggest — a category of one. Omit the section entirely.
  if (!loading && (!others || others.length === 0)) return null;

  return (
    <section className="py-16 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Keep looking"
          title={`More from ${categoryName}`}
          action={
            <Link
              to={`/products?category=${categorySlug}`}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              View the category
            </Link>
          }
        />
        <ProductGrid
          className="mt-12"
          products={others}
          categories={categories}
          loading={loading}
          skeletonCount={SHOWN}
        />
      </Container>
    </section>
  );
}
