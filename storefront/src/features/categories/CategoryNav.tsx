import { Link } from "react-router-dom";

import type { Category } from "@shared/types";
import { buildCategoryTree } from "@shared/categories";
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
 *
 * ---------------------------------------------------------------------------
 * SUBCATEGORIES ARE A SECOND ROW, NOT MORE CHIPS
 * ---------------------------------------------------------------------------
 * The top row is the top-level categories and nothing else. A subcategory only
 * appears once its parent is the category being browsed, on a row of its own
 * underneath — so the first row never grows, and where you are reads as "this
 * heading, then this edit inside it".
 *
 * Flattening both levels into one row was the alternative, and it loses exactly
 * that: "Shirts, Oxford & Poplin, Linen & Viscose, Winter Collection" reads as
 * four unrelated headings, and the row gets longer with every subcategory
 * anybody adds. A hover dropdown per category was the other, and it hides the
 * shop's structure behind a click on the one screen whose job is to show it.
 *
 * The parent chip stays lit while a child is selected, because a child IS
 * inside it — and the child row leads with an "All <parent>" chip, so widening
 * back out is one tap rather than a trip through the back button.
 */

const chip =
  "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[0.625rem] font-medium tracking-eyebrow uppercase transition duration-200 ease-brand";

const selected = "border-brand bg-brand text-canvas";
const unselected = "border-line-strong bg-canvas text-ink-soft hover:border-accent hover:text-accent";

/* The subcategory row sits UNDER the row that owns it, so its chips are lighter
   — a dashed edge, no fill — and read as a refinement of the lit chip above
   rather than as a second set of headings competing with it. */
const selectedSubtle = "border-accent bg-accent/10 text-accent";
const unselectedSubtle =
  "border-line border-dashed bg-transparent text-ink-muted hover:border-accent hover:text-accent";

function Chip({
  to,
  label,
  count,
  active,
  subtle = false,
}: {
  to: string;
  label: string;
  count?: number;
  active: boolean;
  /** Second-row styling, for a subcategory. */
  subtle?: boolean;
}) {
  const tone = subtle
    ? active
      ? selectedSubtle
      : unselectedSubtle
    : active
      ? selected
      : unselected;

  return (
    <Link to={to} aria-current={active ? "page" : undefined} className={`${chip} ${tone}`}>
      {label}
      {count !== undefined && (
        <span className={active && !subtle ? "text-accent-soft" : "text-ink-muted"}>{count}</span>
      )}
    </Link>
  );
}

/* Chips overflow into a horizontal scroll on a phone rather than wrapping into
   three ragged rows (requirements section 15). */
const row =
  "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0";

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
  const tree = buildCategoryTree(categories ?? []);

  /**
   * The branch whose children get the second row: the active category when it
   * is top level, or its parent when a subcategory is selected. Also what the
   * top row lights up, so a child selection keeps its heading lit.
   */
  const open = tree.find(
    (node) => node.slug === activeSlug || node.children.some((child) => child.slug === activeSlug),
  );

  /**
   * The whole collection's size. Summed over the ROOTS only — a subcategory's
   * products are already inside its parent's roll-up, so adding both would
   * count every one of them twice.
   */
  const total = categories && tree.reduce((sum, node) => sum + node.totalProductCount, 0);

  if (loading) {
    return (
      <nav aria-label="Product categories" className={`${row} ${className}`}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-28 shrink-0 rounded-full" />
        ))}
      </nav>
    );
  }

  return (
    <div className={className}>
      <nav aria-label="Product categories" className={row}>
        <Chip to={PRODUCTS} label="Everything" count={total} active={activeSlug === undefined} />

        {tree.map((node) => (
          <Chip
            key={node.slug}
            to={categoryPath(node.slug)}
            label={node.name}
            /* The branch total, so tapping "Shirts" and counting what comes
               back gives the number the chip promised. */
            count={node.totalProductCount}
            active={node.slug === open?.slug}
          />
        ))}

        <Link
          to={CATEGORIES}
          className={`${chip} border-transparent text-ink-muted hover:text-accent`}
        >
          All categories
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </nav>

      {open && open.children.length > 0 && (
        <nav aria-label={`Inside ${open.name}`} className={`${row} mt-2`}>
          <Chip
            to={categoryPath(open.slug)}
            label={`All ${open.name}`}
            count={open.totalProductCount}
            active={activeSlug === open.slug}
            subtle
          />
          {open.children.map((child) => (
            <Chip
              key={child.slug}
              to={categoryPath(child.slug)}
              label={child.name}
              count={child.productCount}
              active={child.slug === activeSlug}
              subtle
            />
          ))}
        </nav>
      )}
    </div>
  );
}
