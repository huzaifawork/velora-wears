import { useId } from "react";

import { Select } from "@/components/ui/Select";
import { SORT_OPTIONS, type SortOption } from "@/lib/queries";

/**
 * Sorting and the availability filter (requirements section 14).
 *
 * Section 14 asks for price low-to-high and high-to-low at minimum; newest and
 * best-rated are the two other axes the summary record already carries
 * precomputed, so they cost nothing to offer (section 19 — never compute a
 * rating average at read time).
 *
 * **`ui/Select`, not a native `<select>`.** A native control's own popup is
 * unstyleable — plain browser chrome next to a site that otherwise never
 * shows one — which is exactly what client feedback on 2026-08-29 flagged.
 * `Select` rebuilds the keyboard behaviour a native control gave away for
 * free rather than dropping it; see its own notes.
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
        <span className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">Sort</span>
        <Select<SortOption>
          label="Sort products"
          value={sort}
          options={SORT_OPTIONS}
          onChange={onSortChange}
        />
      </div>
    </div>
  );
}
