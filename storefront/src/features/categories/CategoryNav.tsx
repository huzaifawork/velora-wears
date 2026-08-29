import { Link } from "react-router-dom";

import type { Category } from "@shared/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { CATEGORIES, PRODUCTS, categoryPath } from "@/lib/routes";

/**
 * The category switcher (requirements section 5 — "users should be able to view
 * and browse products based on their selected category").
 *
 * A row of chips: the whole collection, then one per category, each carrying
 * its precomputed piece count. It is the control that makes category browsing
 * real rather than something you can only reach by clicking a tile on the
 * landing page, and it sits at the top of the products page in every state, so
 * a visitor can move sideways between categories without going back.
 *
 * Every chip is a plain `Link` to the canonical category URL, so the browser
 * back button, sharing and bookmarking all work the way they should — the
 * selected category is URL state, never component state.
 *
 * NOT the filter system: requirements section 14 adds sorting and multi-select
 * filtering to the same page. This is deliberately one axis, one selection.
 */

const chip =
  "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[0.625rem] font-medium tracking-eyebrow uppercase transition duration-200 ease-brand";

const selected = "border-brand bg-brand text-canvas";
const unselected = "border-line-strong bg-canvas text-ink-soft hover:border-accent hover:text-accent";

function Chip({
  to,
  label,
  count,
  active,
}: {
  to: string;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`${chip} ${active ? selected : unselected}`}
    >
      {label}
      {count !== undefined && (
        <span className={active ? "text-accent-soft" : "text-ink-muted"}>{count}</span>
      )}
    </Link>
  );
}

export function CategoryNav({
  categories,
  /** The slug currently being browsed; undefined on the whole collection. */
  activeSlug,
  loading = false,
  className = "",
}: {
  categories: Category[] | undefined;
  activeSlug?: string;
  loading?: boolean;
  className?: string;
}) {
  // The total is the sum of the precomputed counts — the storefront must not
  // read the catalog just to say how big it is (requirements section 19).
  const total = categories?.reduce((sum, c) => sum + c.productCount, 0);

  return (
    <nav
      aria-label="Product categories"
      /* Chips overflow into a horizontal scroll on a phone rather than wrapping
         into three ragged rows (requirements section 15). */
      className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 ${className}`}
    >
      {loading ? (
        Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-28 shrink-0 rounded-full" />
        ))
      ) : (
        <>
          <Chip
            to={PRODUCTS}
            label="Everything"
            count={total}
            active={activeSlug === undefined}
          />
          {categories?.map((category) => (
            <Chip
              key={category.slug}
              to={categoryPath(category.slug)}
              label={category.name}
              count={category.productCount}
              active={category.slug === activeSlug}
            />
          ))}
          <Link
            to={CATEGORIES}
            className={`${chip} border-transparent text-ink-muted hover:text-accent`}
          >
            All categories
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </>
      )}
    </nav>
  );
}
