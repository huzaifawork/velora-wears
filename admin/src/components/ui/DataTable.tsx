import type { ReactNode } from "react";

import { Button } from "@admin/components/ui/Button";
import { TableSkeleton } from "@admin/components/ui/Skeleton";

/**
 * The table every list screen in this dashboard is built from (§18), and the
 * one component that decides how tables behave on a phone.
 *
 * ---------------------------------------------------------------------------
 * A TABLE THAT BECOMES CARDS, NOT A TABLE THAT SCROLLS SIDEWAYS
 * ---------------------------------------------------------------------------
 * Requirements section 21: "Tables should not become unusable on smaller
 * screens." The two usual answers are a horizontal scroll — which hides the
 * column that matters and makes every row a two-handed operation — and a
 * separate mobile component, which is the same table written twice and
 * therefore the same table maintained once.
 *
 * So each column declares a `label` and a `cell`, and the component renders
 * them TWO WAYS from one definition: as `<td>`s on a wide screen, and as a
 * stacked card with the label beside each value on a narrow one. One source,
 * two layouts, and adding a column cannot leave the phone view behind.
 *
 * `primary` marks the column that identifies a row (the product name, the order
 * number). On the card layout it becomes the heading rather than another
 * labelled line, because "Name: Noor Linen Shirt" reads like a form and the
 * name alone reads like a thing.
 */

export interface Column<T> {
  key: string;
  label: string;
  cell: (row: T) => ReactNode;
  /** The identifying column. Heads the card on a narrow screen. */
  primary?: boolean;
  /** Hidden below `lg`, on the card layout only. For low-value columns. */
  hideOnMobile?: boolean;
  /** Right-aligns numbers, which is how numbers are read. */
  align?: "left" | "right";
  width?: string;
  /** Rendered as a sort control in the header when set. */
  onSort?: () => void;
  sorted?: "asc" | "desc" | false;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  empty,
  onRowClick,
  skeletonRows = 6,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** What to show when there are no rows. Always an `EmptyState`. */
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  skeletonRows?: number;
  /** Screen-reader description of what the table holds. */
  caption?: string;
}) {
  if (loading) return <TableSkeleton rows={skeletonRows} columns={columns.length} />;
  if (rows.length === 0) return <>{empty}</>;

  return (
    <>
      {/* --- Wide screens: a real table ---------------------------------- */}
      <div className="hidden lg:block">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}

          <thead>
            <tr className="border-b border-line">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={`px-4 py-3 text-xs font-medium tracking-wide text-ink-muted uppercase first:pl-5 last:pr-5 ${
                    column.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {column.onSort ? (
                    <button
                      type="button"
                      onClick={column.onSort}
                      className={`inline-flex items-center gap-1 transition hover:text-ink ${
                        column.sorted ? "text-ink" : ""
                      }`}
                    >
                      {column.label}
                      <SortGlyph direction={column.sorted} />
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`transition duration-150 ${
                  onRowClick ? "cursor-pointer hover:bg-surface-sunken" : ""
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-middle first:pl-5 last:pr-5 ${
                      column.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- Narrow screens: the same columns, stacked ------------------- */}
      <ul className="divide-y divide-line lg:hidden">
        {rows.map((row) => {
          const primary = columns.find((column) => column.primary);
          const rest = columns.filter((column) => !column.primary && !column.hideOnMobile);

          return (
            <li key={rowKey(row)}>
              <div
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`px-4 py-4 ${onRowClick ? "cursor-pointer active:bg-surface-sunken" : ""}`}
              >
                {primary && <div className="mb-3">{primary.cell(row)}</div>}

                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                  {rest.map((column) => (
                    <div key={column.key} className="contents">
                      <dt className="text-xs text-ink-muted">{column.label}</dt>
                      <dd className="text-right text-sm text-ink">{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SortGlyph({ direction }: { direction: "asc" | "desc" | false | undefined }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-3 w-3 ${direction ? "text-accent" : "text-ink-muted/50"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "asc" ? (
        <path d="m6 15 6-6 6 6" />
      ) : direction === "desc" ? (
        <path d="m6 9 6 6 6-6" />
      ) : (
        <path d="m8 10 4-4 4 4M8 14l4 4 4-4" />
      )}
    </svg>
  );
}

/**
 * The pager under every list.
 *
 * It states the RANGE and the TOTAL — "21-40 of 137" — rather than only a page
 * number, because "page 3 of 7" does not answer the question an admin actually
 * has, which is how much is in there. The total comes back in the same request
 * as the rows (`count: "exact"`), so this costs nothing extra.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  className = "",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 ${className}`}
    >
      <p className="text-xs text-ink-soft">
        <span className="tabular-nums">
          {first}-{last}
        </span>{" "}
        of <span className="tabular-nums">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <span className="px-1 text-xs text-ink-muted tabular-nums">
          {page} / {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
