import { Link, useSearchParams } from "react-router-dom";

import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Image } from "@/components/ui/Image";
import { Skeleton } from "@/components/ui/Skeleton";
import { CategoryNav } from "@/features/categories/CategoryNav";
import { ProductGrid } from "@/features/products/ProductGrid";
import { useAsync } from "@/hooks/useAsync";
import { formatPieceCount, prettifySlug } from "@/lib/format";
import { getCategories, listProducts } from "@/lib/queries";
import { CATEGORIES, HOME, PRODUCTS } from "@/lib/routes";

/**
 * The products page (requirements section 3) AND the category listing
 * (section 5) — they are the same page in two states, which is why there is one
 * canonical URL for a category rather than two (`lib/routes.ts`).
 *
 * With no `?category=` it is the whole collection. With one it becomes that
 * category's own page: its name as the `h1`, its line of copy, its picture, and
 * a breadcrumb trail back through the categories index. In both states the
 * chips above the grid let a visitor move sideways to another category without
 * going back first, which is what "browse products based on their selected
 * category" actually asks for.
 *
 * It composes; it does not draw. The cards and the grid are the same
 * `ProductCard` / `ProductGrid` the landing page's featured strip uses, so the
 * two can never drift into looking like different shops (section 18).
 *
 * The filter and sort CONTROLS are requirements section 14, and search is
 * section 13; neither is built. The row above the grid is where they go.
 */

/**
 * Matches the default in `listProducts`. Beyond this a "load more" needs a real
 * cursor — Realtime Database pagination is `startAfter` on the ordering key,
 * not an offset — which arrives with the filtering work in section 14. The
 * catalog is well under this today.
 */
const LIST_LIMIT = 24;

/** The category art is written at this intrinsic size (see the shared contract). */
const CATEGORY_IMAGE = { width: 800, height: 1000 } as const;

export function ProductsPage() {
  const [params] = useSearchParams();
  const categorySlug = params.get("category")?.trim() || undefined;

  // Both reads go out together: the grid needs the summaries, and the chips,
  // the title and the cards all need the categories' display names.
  const state = useAsync(
    () => Promise.all([listProducts({ categorySlug, limit: LIST_LIMIT }), getCategories()]),
    `products:${categorySlug ?? "all"}:${LIST_LIMIT}`,
  );

  const [products, categories] = state.data ?? [undefined, undefined];
  const category = categorySlug ? categories?.find((c) => c.slug === categorySlug) : undefined;

  /** A `?category=` that no category matches — a stale or hand-typed link. */
  const unknownCategory = Boolean(categorySlug && categories && !category);

  // Named from the slug while the categories are still in flight, so the title
  // does not flip from "the whole collection" to "Hoodies" as the data lands.
  const title = categorySlug
    ? (category?.name ?? prettifySlug(categorySlug))
    : "The whole collection";

  const description = category?.description
    ? category.description
    : categorySlug
      ? "Every piece in this edit. Open any one for its fabric, fit and available sizes."
      : "Shirts, hoodies and everyday essentials, made in small runs. Open any piece for its fabric, fit and available sizes.";

  const count = products?.length ?? 0;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", to: HOME },
          ...(categorySlug
            ? [{ label: "Categories", to: CATEGORIES }, { label: title }]
            : [{ label: "Shop" }]),
        ]}
      />

      <PageHeader
        eyebrow={categorySlug ? "Category" : "Shop"}
        title={title}
        description={unknownCategory ? undefined : description}
        media={
          categorySlug && !unknownCategory ? (
            state.loading ? (
              <Skeleton className="aspect-4/5 w-full rounded-sm" />
            ) : category?.thumb ? (
              <Image
                src={category.thumb}
                alt={`${category.name} at Velora Wears`}
                width={CATEGORY_IMAGE.width}
                height={CATEGORY_IMAGE.height}
                eager
                className="aspect-4/5 w-full rounded-sm object-cover"
              />
            ) : undefined
          ) : undefined
        }
      >
        {/* The category switcher sits in the header on BOTH states, so it is
            always the same control in the same place (requirements section 5). */}
        <CategoryNav
          className="mt-8"
          categories={categories}
          activeSlug={category?.slug}
          loading={state.loading}
        />
      </PageHeader>

      <Container className="py-14 sm:py-20">
        {unknownCategory ? (
          /* Not `NotFoundPage`: the URL is a real page in an unreal state, and
             the visitor is one tap from a category that does exist. */
          <div className="py-8 text-center">
            <h2 className="text-2xl">There is no &ldquo;{prettifySlug(categorySlug!)}&rdquo; edit</h2>
            <p className="mx-auto mt-4 max-w-prose leading-relaxed text-ink-soft">
              That category has either been renamed or retired. The ones that are live are
              listed above, and the whole collection is always one tap away.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to={PRODUCTS} className={buttonClasses()}>
                Shop the collection
              </Link>
              <Link
                to={CATEGORIES}
                className={buttonClasses({ variant: "secondary" })}
              >
                Browse categories
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* The count sits on its own rule above the grid — this row is where
                section 14's sort control and filter chips will go. */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
              <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
                {state.loading
                  ? "Loading the collection"
                  : formatPieceCount(count)}
              </p>
              {categorySlug && !state.loading && (
                <Link
                  to={PRODUCTS}
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  View the whole collection
                </Link>
              )}
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
                  : categorySlug
                    ? "Nothing in this edit yet. Try another category above — the whole collection is one tap away."
                    : "Nothing in the collection yet. Check back shortly."
              }
            />
          </>
        )}
      </Container>
    </>
  );
}
