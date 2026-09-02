import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { Size } from "@shared/types";
import { FALLBACK_LOW_STOCK_THRESHOLD, availableSizes, joinNames, stockInSize } from "@shared/stock";
import { parentOfCategory } from "@shared/categories";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/layout/Container";
import { ValueProps } from "@/components/layout/ValueProps";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Rating } from "@/components/ui/Rating";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCart } from "@/features/cart/CartContext";
import { ProductGallery } from "@/features/products/ProductGallery";
import { RelatedProducts } from "@/features/products/RelatedProducts";
import { SizeSelector } from "@/features/products/SizeSelector";
import { StockBadge } from "@/features/products/StockBadge";
import { QuantityStepper } from "@/features/cart/QuantityStepper";
import { ProductReviews } from "@/features/reviews/ProductReviews";
import { WriteReview } from "@/features/reviews/WriteReview";
import { useAsync } from "@/hooks/useAsync";
import { formatPrice, prettifySlug } from "@/lib/format";
import {
  getCategories,
  getProductBySlug,
  getProductSummaryBySlug,
  getSettings,
  listProducts,
  listReviews,
} from "@/lib/queries";
import { sizeLabel } from "@/lib/sizes";
import { CATEGORIES, CHECKOUT, HOME, PRODUCTS, categoryPath } from "@/lib/routes";

/**
 * The product detail page (requirements section 4) — name, price, description,
 * category, an image gallery, and size selection before adding to the cart.
 *
 * This is the ONE page allowed to read a full `products` record; every list view
 * reads the small summaries instead (section 19). It reads the summary too,
 * because the rating average, review count and stock flags are precomputed and
 * live only there — the storefront must never average reviews at read time.
 *
 * Reads come in two waves. The first is everything keyed by the slug in the URL.
 * The reviews and the related products depend on values that wave returns — the
 * product id and its category — so they follow, each with its own key and its
 * own skeleton, and a slow reviews read never holds up the product itself.
 */

/** Most recent reviews shown; the count above them is the precomputed total. */
const REVIEW_LIMIT = 6;

/** Enough of the category to fill the related strip after removing this product. */
const RELATED_LIMIT = 8;



export function ProductDetailPage() {
  const slug = useParams().slug ?? "";
  const navigate = useNavigate();

  const { add, openDrawer } = useCart();

  /**
   * The chosen size and quantity are STAMPED with the slug they were chosen
   * for.
   *
   * Following a related product swaps the route parameter without unmounting
   * this component, so a plain `useState` would carry "M" over to the next
   * piece — where M may well be sold out, leaving a sold-out size selected and
   * the add button live. Comparing against the current slug resets the choice
   * during the same render, with no effect and no flash of the stale selection.
   * The quantity has exactly the same trap: 3 of one shirt must not become 3 of
   * the next one.
   */
  const [chosen, setChosen] = useState<{ slug: string; size?: Size; qty: number }>({
    slug,
    qty: 1,
  });
  const current = chosen.slug === slug ? chosen : undefined;
  const size = current?.size;
  const qty = current?.qty ?? 1;

  const main = useAsync(
    () =>
      Promise.all([
        getProductBySlug(slug),
        getProductSummaryBySlug(slug),
        getCategories(),
        getSettings(),
      ]),
    `product:${slug}`,
  );

  const [product, summary, categories, settings] = main.data ?? [
    undefined,
    undefined,
    undefined,
    undefined,
  ];

  const reviews = useAsync(
    () => (product ? listReviews(product.id, REVIEW_LIMIT) : Promise.resolve([])),
    `reviews:${product?.id ?? "none"}:${REVIEW_LIMIT}`,
  );

  /**
   * The category "more from this category" reads — the product's own, or its
   * PARENT when the product sits in a subcategory (requirements section 5).
   *
   * Widening is the point. A subcategory is by definition a slice of a
   * category, so a strip drawn from it alone would often be one or two pieces
   * and would disappear entirely for the only piece in a new sub-collection.
   * Reading the parent gives the strip everything under the same heading —
   * which is what a shopper looking at an oxford shirt means by "more like
   * this" — and browsing a parent already includes its children, so this is
   * one read, not several.
   *
   * `categories` and `product` land in the SAME `Promise.all` above, so this
   * never resolves to the child first and then flips to the parent.
   */
  const relatedCategorySlug = product
    ? (parentOfCategory(categories ?? [], product.categorySlug)?.slug ?? product.categorySlug)
    : undefined;

  const related = useAsync(
    () =>
      relatedCategorySlug
        ? listProducts({ categorySlug: relatedCategorySlug, limit: RELATED_LIMIT })
        : Promise.resolve([]),
    `related:${relatedCategorySlug ?? "none"}:${RELATED_LIMIT}`,
  );

  if (main.loading) return <ProductDetailSkeleton />;

  // `getProductBySlug` returns null for an unknown OR an inactive product, so a
  // retired piece and a mistyped URL land in the same honest place.
  if (main.error || !product) return <ProductMissing failed={Boolean(main.error)} />;

  const categoryName =
    categories?.find((c) => c.slug === product.categorySlug)?.name ??
    prettifySlug(product.categorySlug);

  /** Set only when this product's category sits inside another one. */
  const parentCategory = parentOfCategory(categories ?? [], product.categorySlug);

  const soldOut = availableSizes(product.sizes, product.sizeScale).length === 0;

  /** Stock in the chosen size — the cap on what can go into the bag. */
  const availableInSize = size ? stockInSize(product.sizes, size) : 0;

  /**
   * Adding is gated on a size that actually has stock, so an unavailable option
   * can never be purchased (requirements section 11). The drawer opens straight
   * after, because a button that changes nothing the visitor can see does not
   * read as having worked — and it is also the route to checkout that section 6
   * asks for.
   */
  const addToBag = () => {
    if (!size || availableInSize === 0) return;
    add({ productId: product.id, slug: product.slug, size }, qty, availableInSize);
    setChosen({ slug, size, qty: 1 });
    openDrawer();
  };

  /**
   * "Buy now" — the client's request alongside the existing add-to-bag button:
   * the same size/stock gate and the same cart write, but it skips the drawer
   * and takes the visitor straight to `/checkout` instead of leaving them on
   * the product page. Nothing about `/checkout` itself changes; it reads
   * whatever is in the bag exactly as it does when reached from the drawer or
   * the cart page (section 6).
   */
  const buyNow = () => {
    if (!size || availableInSize === 0) return;
    add({ productId: product.id, slug: product.slug, size }, qty, availableInSize);
    setChosen({ slug, size, qty: 1 });
    navigate(CHECKOUT);
  };

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", to: HOME },
          { label: "Categories", to: CATEGORIES },
          // Home / Categories / Shirts / Oxford & Poplin / Meridian… — the
          // parent rung appears only for a product in a subcategory, so a flat
          // catalog keeps the trail it has always had.
          ...(parentCategory
            ? [{ label: parentCategory.name, to: categoryPath(parentCategory.slug) }]
            : []),
          { label: categoryName, to: categoryPath(product.categorySlug) },
          { label: product.name },
        ]}
      />

      <Container className="py-10 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-16">
          {/* The gallery stays put while the description scrolls past it. */}
          <div className="lg:sticky lg:top-28">
            <ProductGallery images={product.images} name={product.name} />
          </div>

          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to={categoryPath(product.categorySlug)}
                  className="text-[0.625rem] tracking-eyebrow text-accent uppercase transition hover:text-ink"
                >
                  {categoryName}
                </Link>
                {summary && <StockBadge product={summary} />}
              </div>

              <h1 className="text-3xl leading-tight text-balance sm:text-4xl">{product.name}</h1>

              {summary && summary.ratingCount > 0 && (
                <a href="#reviews" className="w-fit">
                  <Rating rating={summary.ratingAvg} count={summary.ratingCount} />
                </a>
              )}

              <p className="text-2xl font-medium text-ink">{formatPrice(product.price)}</p>
            </div>

            <p className="leading-relaxed text-pretty text-ink-soft">{product.description}</p>

            <div className="border-t border-line pt-7">
              <SizeSelector
                sizes={product.sizes}
                scaleId={product.sizeScale}
                selected={size}
                onSelect={(next) => setChosen({ slug, size: next, qty: 1 })}
                lowStockThreshold={settings?.lowStockThreshold ?? FALLBACK_LOW_STOCK_THRESHOLD}
              />
            </div>

            <div className="flex flex-col gap-4">
              {/* The size gate is real: no size, no button — and an entirely
                  sold-out piece can never be added (requirements sections 4
                  and 11). */}
              {!soldOut && (
                <div className="flex items-center gap-4">
                  <span className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
                    Quantity
                  </span>
                  <QuantityStepper
                    qty={qty}
                    max={size ? availableInSize : 1}
                    disabled={!size}
                    label={product.name}
                    onChange={(next) =>
                      setChosen({ slug, size, qty: Math.max(1, next) })
                    }
                  />
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  disabled={soldOut || !size}
                  onClick={addToBag}
                  className="w-full sm:w-auto"
                >
                  {soldOut ? "Sold out" : "Add to bag"}
                </Button>
                {!soldOut && (
                  <Button
                    variant="accent"
                    size="lg"
                    disabled={!size}
                    onClick={buyNow}
                    className="w-full sm:w-auto"
                  >
                    Buy now
                  </Button>
                )}
              </div>

              <p className="text-sm text-ink-soft">
                Cash on delivery. Nothing is reserved until an order is placed.
              </p>
            </div>

            <dl className="grid gap-3 border-t border-line pt-7 text-sm">
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
                  Category
                </dt>
                <dd className="text-ink-soft">{categoryName}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
                  Sizes
                </dt>
                <dd className="text-ink-soft">
                  {soldOut
                    ? "None left — every size is sold out"
                    : joinNames(
                        availableSizes(product.sizes, product.sizeScale).map((s) =>
                          sizeLabel(product.sizeScale, s),
                        ),
                      )}
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
                  Payment
                </dt>
                <dd className="text-ink-soft">Cash on delivery, nationwide</dd>
              </div>
            </dl>
          </div>
        </div>
      </Container>

      <ValueProps settings={settings} />

      <ProductReviews
        reviews={reviews.data}
        loading={reviews.loading}
        ratingAvg={summary?.ratingAvg ?? 0}
        ratingCount={summary?.ratingCount ?? 0}
        writeReviewSlot={<WriteReview productId={product.id} productName={product.name} />}
      />

      <RelatedProducts
        products={related.data}
        categories={categories}
        /* Named after whatever the strip actually read — the parent for a
           product in a subcategory — so "More from X" and the link under it
           agree with the pieces shown. */
        categorySlug={relatedCategorySlug ?? product.categorySlug}
        categoryName={parentCategory?.name ?? categoryName}
        currentProductId={product.id}
        loading={related.loading}
      />
    </>
  );
}

/** Mirrors the real layout, so nothing jumps when the product lands. */
function ProductDetailSkeleton() {
  return (
    <Container className="py-10 sm:py-14">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <Skeleton className="aspect-3/4 w-full" />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-13 w-full sm:w-56" />
        </div>
      </div>
    </Container>
  );
}

/** Unknown slug, a retired piece, or a read that failed. */
function ProductMissing({ failed }: { failed: boolean }) {
  return (
    <Container className="flex flex-col items-center py-28 text-center sm:py-36">
      <p className="text-[0.625rem] tracking-eyebrow text-accent uppercase">
        {failed ? "Something went wrong" : "Not available"}
      </p>
      <h1 className="mt-5 max-w-xl text-3xl leading-tight text-balance sm:text-4xl">
        {failed ? "This product could not be loaded." : "We could not find that piece."}
      </h1>
      <p className="mt-5 max-w-prose leading-relaxed text-ink-soft">
        {failed
          ? "Please refresh the page, or browse the rest of the collection while we sort it out."
          : "It may have been retired, or the link may be out of date. The rest of the collection is right here."}
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link to={PRODUCTS} className={buttonClasses({ size: "lg" })}>
          Shop the collection
        </Link>
        <Link to="/" className={buttonClasses({ variant: "secondary", size: "lg" })}>
          Back to home
        </Link>
      </div>
    </Container>
  );
}
