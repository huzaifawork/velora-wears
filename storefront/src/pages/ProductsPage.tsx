import { Link, useSearchParams } from "react-router-dom";

import { PageHeader } from "@/components/layout/PageHeader";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { ProductGrid } from "@/features/products/ProductGrid";
import { useAsync } from "@/hooks/useAsync";
import { prettifySlug } from "@/lib/format";
import { getCategories, listProducts } from "@/lib/queries";

/**
 * The products page (requirements section 3) — every active product, as cards
 * carrying image, name, price and category.
 *
 * It composes; it does not draw. The cards and the grid are the same
 * `ProductCard` / `ProductGrid` the landing page's featured strip uses, so the
 * two can never drift into looking like different shops (section 18).
 *
 * `?category=` is honoured because the header, footer, category tiles and promo
 * banners already link here with it. That is URL state only — the filter and
 * sort CONTROLS are requirements section 14, and search is section 13; neither
 * is built yet.
 */

/**
 * Matches the default in `listProducts`. Beyond this a "load more" needs a real
 * cursor — Realtime Database pagination is `startAfter` on the ordering key,
 * not an offset — which arrives with the filtering work in section 14. The
 * catalog is well under this today.
 */
const LIST_LIMIT = 24;

export function ProductsPage() {
  const [params] = useSearchParams();
  const categorySlug = params.get("category")?.trim() || undefined;

  // Both reads go out together: the grid needs the summaries, the cards and the
  // title need the categories' display names.
  const state = useAsync(
    () => Promise.all([listProducts({ categorySlug, limit: LIST_LIMIT }), getCategories()]),
    `products:${categorySlug ?? "all"}:${LIST_LIMIT}`,
  );

  const [products, categories] = state.data ?? [undefined, undefined];
  const category = categorySlug
    ? categories?.find((c) => c.slug === categorySlug)
    : undefined;

  /** A `?category=` that no category matches — a stale or hand-typed link. */
  const unknownCategory = Boolean(categorySlug && categories && !category);

  // Named from the slug while the categories are still in flight, so the title
  // does not flip from "the whole collection" to "Hoodies" as the data lands.
  const title = categorySlug
    ? (category?.name ?? prettifySlug(categorySlug))
    : "The whole collection";

  const description = categorySlug
    ? "Every piece in this edit. Open any one for its fabric, fit and available sizes."
    : "Shirts, hoodies and everyday essentials, made in small runs. Open any piece for its fabric, fit and available sizes.";

  const count = products?.length ?? 0;

  return (
    <>
      <PageHeader eyebrow="Shop" title={title} description={description}>
        {categorySlug && (
          <p className="mt-8">
            <Link
              to="/products"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              View the whole collection
            </Link>
          </p>
        )}
      </PageHeader>

      <Container className="py-14 sm:py-20">
        {/* The count sits on its own rule above the grid — this row is where
            section 14's sort control and filter chips will go. */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
          <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
            {state.loading
              ? "Loading the collection"
              : `${count} ${count === 1 ? "piece" : "pieces"}`}
          </p>
        </div>

        <ProductGrid
          className="mt-12"
          products={products}
          categories={categories}
          loading={state.loading}
          skeletonCount={8}
          eagerCount={4}
          emptyMessage={
            state.error
              ? "The collection could not be loaded just now. Please refresh the page."
              : unknownCategory
                ? "That category does not exist. Try the whole collection instead."
                : "Nothing in this edit yet. Check back shortly."
          }
        />
      </Container>
    </>
  );
}
