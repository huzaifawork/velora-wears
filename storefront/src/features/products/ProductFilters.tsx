import { useId } from "react";

import { SORT_OPTIONS, type SortOption } from "@/lib/queries";

/**
 * Sorting and the availability filter (requirements section 14).
 *
 * Section 14 asks for price low-to-high and high-to-low at minimum; newest and
 * best-rated are the two other axes the summary record already carries
 * precomputed, so they cost nothing to offer (section 19 — never compute a
 * rating average at read time).
 *
 * **A native `<select>`, not a custom dropdown.** It is one control, it is
 * keyboard accessible for free, and on a phone it opens the platform picker
 * rather than a list that has to be scrolled inside a scrolling page
 * (section 15). A bespoke menu here would be worse in every way that matters.
 *
 * The CATEGORY filter is not in this component — it is `CategoryNav`, built in
 * section 5, which is a row of links rather than a control because a category
 * is a browsable place with its own title and picture, not a checkbox.
 *
 * Everything here writes to the URL. Nothing in this component is state.
 */
export function ProductFilters({
  sort,
  onSortChange,
  inStockOnly,
  onInStockChange,
  className = "",
}: {
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  inStockOnly: boolean;
  onInStockChange: (only: boolean) => void;
  className?: string;
}) {
  const sortId = useId();
  const stockId = useId();

  return (
    <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <input
          id={stockId}
          type="checkbox"
          checked={inStockOnly}
          onChange={(event) => onInStockChange(event.target.checked)}
          className="h-4 w-4 shrink-0 accent-brand"
        />
        <label
          htmlFor={stockId}
          className="cursor-pointer text-[0.625rem] tracking-eyebrow text-ink-soft uppercase select-none"
        >
          In stock only
        </label>
      </div>

      <div className="flex items-center gap-3">
        <label
          htmlFor={sortId}
          className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase"
        >
          Sort
        </label>
        <select
          id={sortId}
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortOption)}
          className="h-9 rounded-full border border-line-strong bg-canvas px-4 text-xs text-ink transition hover:border-ink focus:border-ink focus:outline-none"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
