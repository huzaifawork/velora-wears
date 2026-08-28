import { Link } from "react-router-dom";

import type { ProductSummary } from "@shared/types";
import { Image } from "@/components/ui/Image";
import { Rating } from "@/components/ui/Rating";
import { Skeleton } from "@/components/ui/Skeleton";
import { StockBadge } from "@/features/products/StockBadge";
import { formatPrice, prettifySlug } from "@/lib/format";

/**
 * THE product card. Built here for the landing page's featured strip and reused
 * unchanged by the products page, the category pages, and search results
 * (requirements sections 2, 3, 5, 13 — one component, never re-implemented).
 *
 * It reads a `ProductSummary`, never a full `Product`: a grid must not pull
 * descriptions and full-resolution images it does not show (section 19).
 */

/**
 * Cards render a 3:4 crop of the `thumb` variant. Declaring the intrinsic size
 * here lets the browser reserve the space before the file arrives, so the grid
 * does not shift as images load. The admin dashboard writes thumbs at this
 * ratio (see the shared contract in requirements section 20).
 */
const CARD_IMAGE = { width: 600, height: 800 } as const;

export function ProductCard({
  product,
  categoryName,
  eager = false,
}: {
  product: ProductSummary;
  /** Display name for the category chip; falls back to the slug. */
  categoryName?: string;
  /** Above the fold? Only the first row of the first grid on a page. */
  eager?: boolean;
}) {
  const soldOut = !product.inStock;

  return (
    <article className="group">
      <Link
        to={`/products/${product.slug}`}
        className="block focus-visible:outline-none"
        aria-label={`${product.name} — ${formatPrice(product.price)}`}
      >
        <div className="relative isolate overflow-hidden rounded-sm bg-canvas-deep">
          <Image
            src={product.thumb}
            alt={product.name}
            width={CARD_IMAGE.width}
            height={CARD_IMAGE.height}
            eager={eager}
            className={`aspect-3/4 w-full object-cover transition duration-700 ease-brand ${
              soldOut ? "opacity-60 saturate-50" : "group-hover:scale-[1.05]"
            }`}
          />

          <div className="absolute top-3 left-3">
            <StockBadge product={product} />
          </div>

          {/* Hover affordance: on a phone there is no hover, so the whole card
              is the tap target and this simply never shows. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-linear-to-t from-ink/85 to-transparent p-4 pt-10 text-center opacity-0 transition duration-400 ease-brand group-hover:translate-y-0 group-hover:opacity-100"
          >
            <span className="text-[0.625rem] tracking-eyebrow text-canvas uppercase">
              {soldOut ? "Sold out" : "View product"}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
            {categoryName ?? prettifySlug(product.categorySlug)}
          </p>
          <h3 className="text-lg leading-snug text-ink transition group-hover:text-accent">
            {product.name}
          </h3>
          {product.ratingCount > 0 && (
            <Rating rating={product.ratingAvg} count={product.ratingCount} />
          )}
          <p className="mt-0.5 flex items-baseline gap-2 text-base font-medium text-ink">
            {formatPrice(product.price)}
            <span
              aria-hidden="true"
              className="h-px w-0 bg-accent transition-all duration-500 ease-brand group-hover:w-8"
            />
          </p>
        </div>
      </Link>
    </article>
  );
}

/** Matches the card's layout exactly, so nothing moves when the data lands. */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="aspect-3/4 w-full" />
      <Skeleton className="h-2.5 w-16" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
