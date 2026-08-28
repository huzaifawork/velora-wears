import { Link } from "react-router-dom";

import type { Category, ProductSummary } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ProductGrid } from "@/features/products/ProductGrid";

/**
 * The featured products strip (requirements section 2). It is deliberately just
 * the shared `ProductGrid` with a heading — the landing page and the products
 * page must never drift into two different-looking grids (section 18).
 */
export function FeaturedProducts({
  products,
  categories,
  loading,
}: {
  products: ProductSummary[] | undefined;
  categories: Category[] | undefined;
  loading: boolean;
}) {
  return (
    <section className="bg-canvas-alt py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Featured"
          title="This season's most-worn pieces"
          description="A short edit of what is selling and what we would put on this week."
          action={
            <Link to="/products" className={buttonClasses({ variant: "secondary" })}>
              View all products
            </Link>
          }
        />

        <ProductGrid
          className="mt-12"
          products={products}
          categories={categories}
          loading={loading}
          skeletonCount={8}
          emptyMessage="The collection is being photographed. Check back shortly."
        />
      </Container>
    </section>
  );
}
