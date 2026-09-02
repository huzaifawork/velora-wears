import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { parentOfCategory, subcategoriesOf } from "@shared/categories";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Image } from "@/components/ui/Image";
import { Skeleton } from "@/components/ui/Skeleton";
import { CategoryNav } from "@/features/categories/CategoryNav";
import { ProductFilters } from "@/features/products/ProductFilters";
import { ProductGrid } from "@/features/products/ProductGrid";
import { SearchBar } from "@/features/products/SearchBar";
import { useAsync } from "@/hooks/useAsync";
import { formatPieceCount, prettifySlug } from "@/lib/format";
import { DEFAULT_SORT, SORT_OPTIONS, getCategories, listProducts } from "@/lib/queries";
import type { SortOption } from "@/lib/queries";
import { CATEGORIES, HOME, PRODUCTS, categoryPath } from "@/lib/routes";

/**
 * The products page — the catalog (section 3), a single category (section 5),
 * search results (section 13), and the filter and sort controls (section 14).
 *
 * They are all the SAME page in different states, and every one of those states
 * lives in the URL. That is the decision this file is built around: a search, a
 * category, a sort order and the availability filter are query parameters, so
 * every combination of them is linkable, shareable, survives the back button,
 * and composes with the others for free. None of it is component state, so
 * there is nothing to keep in sync with anything.
 *
 * The alternative — a separate /search page — would have needed its own grid,
 * its own filters and its own sort, and half of them would have quietly not
 * worked together.
 */

/**
 * How many pieces a page shows before "Load more".
 *
 * This is not cursor pagination, and deliberately so. The Realtime Database can
 * only order by one field per query, so a category, a search and the in-stock
 * filter cannot all run on the server — whichever one does not, runs in the
 * browser over a bounded window. A `startAfter` cursor cannot page through a
 * result set that is partly assembled client-side. Raising the bound and
 * re-reading is correct, stays bounded (which is what section 19 requires), and
 * is served from the cache for everything already fetched. Revisit it when a
 * single category is big enough to need a composite index.
 */
const PAGE_SIZE = 12;

/** The category art is written at this intrinsic size (see the shared contract). */
const CATEGORY_IMAGE = { width: 800, height: 1000 } as const;

/** A hand-typed or stale `?sort=` must not break the page. */
function parseSort(raw: string | null): SortOption {
  return SORT_OPTIONS.some((option) => option.value === raw) ? (raw as SortOption) : DEFAULT_SORT;
}

export function ProductsPage() {
  const [params, setParams] = useSearchParams();

  const categorySlug = params.get("category")?.trim() || undefined;
  const search = params.get("q")?.trim() ?? "";
  const sort = parseSort(params.get("sort"));
  const inStockOnly = params.get("stock") === "in";

  /**
   * Every parameter change goes through here, so one control can never wipe
   * another's — changing the sort while searching inside a category has to keep
   * the search and the category. Removing a value drops the key entirely rather
   * than leaving `?q=` in the URL.
   *
   * `preserveScroll` is for a refinement to a grid the visitor is already
   * looking at — sort, the in-stock toggle — as opposed to a fresh search,
   * which reads as a new result set and is allowed to jump to the top the way
   * a category link does. See `ScrollToTop`'s notes for why this has to be a
   * `history.state` flag rather than something `ScrollToTop` can infer.
   */
  const updateParams = (
    changes: Record<string, string | undefined>,
    options?: { preserveScroll?: boolean },
  ) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, options?.preserveScroll ? { state: { preserveScroll: true } } : undefined);
  };

  /**
   * Identifies the current result set. Everything that changes what is being
   * asked for is in it, which makes it both the reload trigger and the thing
   * "load more" has to reset against.
   */
  const queryKey = `${categorySlug ?? "all"}:${search}:${sort}:${inStockOnly}`;

  /**
   * How many pages have been asked for, STAMPED with the query they were asked
   * for. Searching again while on page three must show page one of the new
   * results, not page three — and comparing against the current key resets it
   * during the same render, with no effect and no flash of the wrong page.
   */
  const [paging, setPaging] = useState({ key: queryKey, pages: 1 });
  const pages = paging.key === queryKey ? paging.pages : 1;
  const limit = pages * PAGE_SIZE;

  const state = useAsync(
    () =>
      Promise.all([
        listProducts({ categorySlug, search, inStockOnly, sort, limit }),
        getCategories(),
      ]),
    `products:${queryKey}:${limit}`,
  );

  const [products, categories] = state.data ?? [undefined, undefined];
  const category = categorySlug ? categories?.find((c) => c.slug === categorySlug) : undefined;

  /**
   * Where this category sits (requirements section 5 — subcategories).
   *
   * A subcategory has a `parent`; a parent category has `children`. Both are
   * resolved from the SAME categories read the chips already use, so knowing
   * the shape of the branch costs nothing extra. Both are empty/undefined for
   * a flat catalog, which is what every shop had before subcategories existed
   * — so every line below that reads them is inert until one is created.
   */
  const parent = categories && categorySlug ? parentOfCategory(categories, categorySlug) : undefined;
  const children = categories && categorySlug ? subcategoriesOf(categories, categorySlug) : [];

  /** A `?category=` that no category matches — a stale or hand-typed link. */
  const unknownCategory = Boolean(categorySlug && categories && !category);

  const count = products?.length ?? 0;
  const searching = search.length > 0;

  // A full page back means there is probably another one. It can be wrong by
  // one read at the exact boundary, which costs a fetch that returns nothing
  // new — cheaper than a count query on every page.
  const mayHaveMore = !state.loading && count === limit;

  const filtered = searching || inStockOnly || Boolean(categorySlug);

  // Named from the slug while the categories are still in flight, so the title
  // does not flip from "the whole collection" to "Hoodies" as the data lands.
  const categoryName = category?.name ?? (categorySlug ? prettifySlug(categorySlug) : undefined);

  /**
   * A subcategory carries no tile art of its own — the shop renders children as
   * links under their parent's tile, never as tiles — so it borrows its
   * parent's rather than dropping the image and leaving the header visibly
   * plainer than the category it sits inside.
   */
  const categoryThumb = category?.thumb ?? parent?.thumb;

  const title = searching
    ? `Results for “${search}”`
    : (categoryName ?? "The whole collection");

  const description = searching
    ? categoryName
      ? `Searching ${categoryName}. Search matches the beginning of a product name.`
      : "Search matches the beginning of a product name — try “hood” or “oxford”."
    : category?.description
      ? category.description
      : children.length > 0
        ? // A parent shows its own products AND its subcategories' — the chips
          // under the title are how a visitor narrows from here.
          `Everything in ${categoryName}, including its ${children.length === 1 ? "sub-collection" : "sub-collections"}. Narrow it below, or open any piece for its fabric, fit and available sizes.`
        : categorySlug
          ? "Every piece in this edit. Open any one for its fabric, fit and available sizes."
          : "Oversized shirts, winter layers, trousers, shoes and everyday essentials, made in small runs. Open any piece for its fabric, fit and available sizes.";

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", to: HOME },
          ...(searching
            ? [{ label: "Shop", to: PRODUCTS }, { label: "Search" }]
            : categorySlug
              ? [
                  { label: "Categories", to: CATEGORIES },
                  // A subcategory sits under its parent, so the trail says so —
                  // Home / Categories / Shirts / Oxford & Poplin. Absent for a
                  // top-level category, which is every category in a flat shop.
                  ...(parent ? [{ label: parent.name, to: categoryPath(parent.slug) }] : []),
                  { label: title },
                ]
              : [{ label: "Shop" }]),
        ]}
      />

      <PageHeader
        /* A subcategory's eyebrow names the category it is inside, so the
           heading pair reads "Shirts / Oxford & Poplin". */
        eyebrow={searching ? "Search" : categorySlug ? (parent?.name ?? "Category") : "Shop"}
        title={title}
        description={unknownCategory ? undefined : description}
        media={
          categorySlug && !searching && !unknownCategory ? (
            state.loading ? (
              <Skeleton className="aspect-4/5 w-full rounded-sm" />
            ) : categoryThumb ? (
              <Image
                src={categoryThumb}
                alt={`${categoryName} at Velora Wears`}
                width={CATEGORY_IMAGE.width}
                height={CATEGORY_IMAGE.height}
                eager
                className="aspect-4/5 w-full rounded-sm object-cover"
              />
            ) : undefined
          ) : undefined
        }
      >
        <SearchBar
          className="mt-8 max-w-xl"
          value={search}
          onSearch={(term) => updateParams({ q: term || undefined })}
        />

        {/* The category switcher sits in the header in every state, so it is
            always the same control in the same place (section 5). */}
        <CategoryNav
          className="mt-6"
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
            <h2 className="text-2xl">
              There is no &ldquo;{prettifySlug(categorySlug!)}&rdquo; edit
            </h2>
            <p className="mx-auto mt-4 max-w-prose leading-relaxed text-ink-soft">
              That category has either been renamed or retired. The ones that are live are
              listed above, and the whole collection is always one tap away.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to={PRODUCTS} className={buttonClasses()}>
                Shop the collection
              </Link>
              <Link to={CATEGORIES} className={buttonClasses({ variant: "secondary" })}>
                Browse categories
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-line pb-5">
              <p
                aria-live="polite"
                className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase"
              >
                {state.loading
                  ? "Loading"
                  : mayHaveMore
                    ? `Showing ${count}`
                    : formatPieceCount(count)}
              </p>

              <ProductFilters
                sort={sort}
                onSortChange={(next) =>
                  updateParams(
                    { sort: next === DEFAULT_SORT ? undefined : next },
                    { preserveScroll: true },
                  )
                }
                inStockOnly={inStockOnly}
                onInStockChange={(only) =>
                  updateParams({ stock: only ? "in" : undefined }, { preserveScroll: true })
                }
              />
            </div>

            {filtered && (
              <p className="mt-5">
                <Link
                  to={PRODUCTS}
                  className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase underline underline-offset-4 transition hover:text-accent"
                >
                  Clear search and filters
                </Link>
              </p>
            )}

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
                  : searching
                    ? `Nothing matches “${search}”. Search looks at the start of a product name, so try a shorter word — or clear the search and browse the collection.`
                    : inStockOnly
                      ? "Everything here is sold out at the moment. Turn off “in stock only” to see the full edit."
                      : categorySlug
                        ? "Nothing in this edit yet. Try another category above — the whole collection is one tap away."
                        : "Nothing in the collection yet. Check back shortly."
              }
            />

            {mayHaveMore && (
              <div className="mt-14 flex justify-center">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setPaging({ key: queryKey, pages: pages + 1 })}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </Container>
    </>
  );
}
