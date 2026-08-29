import { Link } from "react-router-dom";

import type { Category } from "@shared/types";
import { Image } from "@/components/ui/Image";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatPieceCount } from "@/lib/format";
import { categoryPath } from "@/lib/routes";

/**
 * THE category tile (requirements sections 2 and 5).
 *
 * Written once here and used by both surfaces that show a category as a picture
 * — the landing page's bento strip and the /categories index — so the two can
 * never drift into looking like different shops (section 18). The variants
 * change proportion and type scale only; the composition, the ink scrim and the
 * hover behaviour are shared.
 *
 * An EMPTY category is deliberately not a link. A tile that promises pieces and
 * opens an empty grid is worse than one that says the edit is on its way, and
 * `productCount` is precomputed on the record so nothing has to be counted to
 * know (section 19).
 */

export type CategoryTileVariant = "feature" | "compact" | "portrait";

/** Category art is written at this intrinsic size, so the space is reserved before it lands. */
const TILE_IMAGE = { width: 800, height: 1000 } as const;

const imageClasses: Record<CategoryTileVariant, string> = {
  feature: "aspect-4/5 sm:h-full",
  compact: "aspect-16/10 sm:aspect-3/2",
  portrait: "aspect-4/5",
};

const titleClasses: Record<CategoryTileVariant, string> = {
  feature: "text-3xl sm:text-4xl",
  compact: "text-2xl",
  portrait: "text-2xl sm:text-3xl",
};

export function CategoryTile({
  category,
  variant = "compact",
  /** Position in the strip, shown as an editorial 01 / 02 / 03 marker. */
  index,
  /** Show the category's line of copy inside the tile. Off in the tight bento. */
  showDescription = false,
  /** Above the fold? Only the first tile of the first grid on a page. */
  eager = false,
  className = "",
}: {
  category: Category;
  variant?: CategoryTileVariant;
  index?: number;
  showDescription?: boolean;
  eager?: boolean;
  className?: string;
}) {
  const empty = category.productCount === 0;
  const shell = `group relative isolate block overflow-hidden rounded-sm bg-canvas-deep ${className}`;

  const body = (
    <>
      {category.thumb && (
        <Image
          src={category.thumb}
          alt={`${category.name} at Velora Wears`}
          width={TILE_IMAGE.width}
          height={TILE_IMAGE.height}
          eager={eager}
          className={`w-full object-cover transition duration-700 ease-brand ${
            imageClasses[variant]
          } ${empty ? "opacity-70 saturate-50" : "group-hover:scale-[1.06]"}`}
        />
      )}

      {/* Ink scrim, so the label stays readable over any photograph. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-ink/85 via-ink/25 to-transparent transition duration-500 group-hover:from-ink/90"
      />

      {index !== undefined && (
        <span className="absolute top-5 left-5 font-display text-xs text-canvas/60">
          {String(index + 1).padStart(2, "0")}
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <h3 className={`text-canvas ${titleClasses[variant]}`}>{category.name}</h3>
          {showDescription && category.description && (
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-pretty text-canvas/75">
              {category.description}
            </p>
          )}
          <p className="mt-2 text-[0.625rem] tracking-eyebrow text-canvas/70 uppercase">
            {empty ? "Coming soon" : formatPieceCount(category.productCount)}
          </p>
        </div>
        {!empty && (
          <span className="flex shrink-0 items-center gap-2 text-[0.625rem] tracking-eyebrow text-accent-soft uppercase">
            Shop
            <span
              aria-hidden="true"
              className="inline-block transition duration-300 ease-brand group-hover:translate-x-1"
            >
              &rarr;
            </span>
          </span>
        )}
      </div>
    </>
  );

  if (empty) return <div className={shell}>{body}</div>;

  return (
    <Link
      to={categoryPath(category.slug)}
      className={shell}
      aria-label={`${category.name} — ${formatPieceCount(category.productCount)}`}
    >
      {body}
    </Link>
  );
}

/** Matches the tile's proportions exactly, so nothing moves when the data lands. */
export function CategoryTileSkeleton({
  variant = "compact",
  className = "",
}: {
  variant?: CategoryTileVariant;
  className?: string;
}) {
  return <Skeleton className={`w-full ${imageClasses[variant]} ${className}`} />;
}
