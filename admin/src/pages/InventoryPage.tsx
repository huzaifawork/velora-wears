import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ProductSummary, Size } from "@shared/types";
import { SIZES, SIZE_LABELS, stockLevel } from "@shared/stock";
import { buttonClasses } from "@admin/components/ui/Button";
import { Card, PageHeader } from "@admin/components/ui/Card";
import { StockBadge } from "@admin/components/ui/Badge";
import { Pagination } from "@admin/components/ui/DataTable";
import { EmptyState, ErrorState, TableSkeleton } from "@admin/components/ui/Skeleton";
import { FilterBar, SearchInput } from "@admin/components/ui/SearchInput";
import { Select } from "@admin/components/ui/Select";
import { Thumb } from "@admin/components/ui/Thumb";
import { useToast } from "@admin/components/ui/Toast";
import { CheckIcon, InventoryIcon } from "@admin/components/ui/Icons";
import { Spinner } from "@admin/components/ui/Button";
import { useQuery } from "@admin/hooks/useQuery";
import { useUrlState } from "@admin/hooks/useUrlState";
import {
  DEFAULT_PAGE_SIZE,
  listProducts,
  listStockFor,
  productListKey,
  setSizeStock,
  type StockFilter,
} from "@admin/services/products";
import { SETTINGS_KEY, getSettings } from "@admin/services/settings";
import * as routes from "@admin/lib/routes";

/**
 * Inventory — per-size stock, edited in place (requirements section 11).
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE SCREEN FROM THE PRODUCT EDITOR
 * ---------------------------------------------------------------------------
 * Because it answers a different question. The editor is where a product is
 * described; this is where a delivery gets counted in. Restocking is a task
 * done across twenty products at once, and doing it through the editor means
 * twenty page loads, twenty saves, and twenty chances to change something else
 * by accident. Here every size of every product on the page is a single field
 * that saves on its own.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE IS OPTIMISTIC
 * ---------------------------------------------------------------------------
 * The brief allows optimistic updates "where safe" and rules them out where
 * they could produce wrong inventory. This is that place, and it is the most
 * consequential screen in the dashboard for it: a number that looks saved and
 * was not is how a shop sells a shirt it does not have and then has to
 * apologise. Every field shows a spinner while the write is in flight and a
 * tick when the database has confirmed it.
 *
 * ---------------------------------------------------------------------------
 * TWO QUERIES, NOT ONE PER ROW
 * ---------------------------------------------------------------------------
 * The page reads its products from `product_summaries` (which already carries
 * the total and the low-stock flag), then reads the per-size breakdown for
 * exactly those products in ONE `in (...)` query. The obvious alternative — a
 * stock read per product — is the N+1 the brief names, and on a page of twenty
 * it is twenty-one round trips before a single row can be drawn.
 */
export function InventoryPage() {
  const [params] = useSearchParams();
  const url = useUrlState();

  const search = params.get("q") ?? "";
  const stock = (params.get("stock") as StockFilter) || "all";
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const options = useMemo(
    () => ({
      search,
      stock,
      status: "active" as const,
      sort: "name" as const,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    [search, stock, page],
  );

  const products = useQuery(`inventory:${productListKey(options)}`, ["products"], () =>
    listProducts(options),
  );

  const ids = useMemo(
    () => (products.data?.rows ?? []).map((row) => row.id),
    [products.data],
  );

  const sizes = useQuery(
    `stock:${ids.join(",") || "none"}`,
    ["products"],
    () => listStockFor(ids),
  );

  const settings = useQuery(SETTINGS_KEY, ["settings"], getSettings);
  const threshold = settings.data?.lowStockThreshold;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock by size, across the live catalog. A size at zero is struck out on the product page and cannot be bought."
      />

      <Card padded={false}>
        <FilterBar
          search={
            <SearchInput
              label="Search products by name"
              placeholder="Search products…"
              value={search}
              onChange={(value) => url.set({ q: value || null, page: null })}
            />
          }
          filters={
            <Select
              label="Stock"
              hideLabel
              value={stock}
              onChange={(value) => url.set({ stock: value === "all" ? null : value, page: null })}
              className="min-w-[10rem]"
              options={[
                { value: "all", label: "Everything" },
                { value: "out", label: "Sold out" },
                { value: "low", label: "Running low" },
                { value: "in", label: "In stock" },
              ]}
            />
          }
        />

        {products.error ? (
          <ErrorState error={products.error} onRetry={products.refetch} />
        ) : products.loading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : (products.data?.rows ?? []).length === 0 ? (
          <EmptyState
            icon={<InventoryIcon />}
            title={
              stock === "out"
                ? "Nothing is sold out"
                : stock === "low"
                  ? "Nothing is running low"
                  : "No products match"
            }
            description={
              stock === "all"
                ? "Only live products appear here. Retired ones are managed from the Products screen."
                : "Nothing in the live catalog is in that state right now."
            }
            action={
              stock !== "all" ? (
                <button
                  type="button"
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                  onClick={() => url.set({ stock: null, page: null })}
                >
                  Show everything
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {(products.data?.rows ?? []).map((product) => (
                <InventoryRow
                  key={product.id}
                  product={product}
                  stock={sizes.data?.get(product.id)}
                  loading={sizes.loading}
                  threshold={threshold}
                />
              ))}
            </ul>

            <Pagination
              page={page}
              pageSize={DEFAULT_PAGE_SIZE}
              total={products.data?.total ?? 0}
              onPage={(next) => url.set({ page: next === 1 ? null : String(next) })}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function InventoryRow({
  product,
  stock,
  loading,
  threshold,
}: {
  product: ProductSummary;
  stock: Record<Size, number> | undefined;
  loading: boolean;
  threshold?: number;
}) {
  return (
    <li className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Thumb
          src={product.thumb}
          alt={product.name}
          width={44}
          height={58}
          className="h-14 w-11 shrink-0"
        />

        <div className="min-w-0">
          <Link
            to={routes.productPath(product.id)}
            className="block truncate text-sm font-medium text-ink hover:text-accent"
          >
            {product.name}
          </Link>
          <div className="mt-1">
            <StockBadge quantity={product.totalStock ?? 0} threshold={threshold} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 lg:w-[26rem] lg:shrink-0">
        {SIZES.map((size) => (
          <StockField
            key={size}
            productId={product.id}
            productName={product.name}
            size={size}
            value={stock?.[size]}
            loading={loading}
            threshold={threshold}
          />
        ))}
      </div>
    </li>
  );
}

/**
 * One size's stock.
 *
 * Committed on BLUR or Enter, not per keystroke — typing "12" would otherwise
 * write a 1 and then a 12, and for a moment the shop would believe there is one
 * left. The field holds its own text while it is being edited and re-syncs from
 * the database afterwards.
 */
function StockField({
  productId,
  productName,
  size,
  value,
  loading,
  threshold,
}: {
  productId: string;
  productName: string;
  size: Size;
  value: number | undefined;
  loading: boolean;
  threshold?: number;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<string>();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  const current = value ?? 0;
  const shown = draft ?? String(current);
  const level = stockLevel(Number(shown) || 0, threshold);

  const commit = async () => {
    if (draft === undefined) return;

    const next = Number(draft);
    if (!Number.isFinite(next) || next < 0 || !Number.isInteger(next)) {
      toast.error("Stock has to be a whole number, zero or more.");
      setDraft(undefined);
      return;
    }

    if (next === current) {
      setDraft(undefined);
      return;
    }

    setState("saving");
    try {
      await setSizeStock(productId, size, next);
      setDraft(undefined);
      setState("saved");
      window.setTimeout(() => setState("idle"), 1800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setDraft(undefined);
      setState("idle");
    }
  };

  const border =
    level === "out-of-stock"
      ? "border-danger/40"
      : level === "low-stock"
        ? "border-warning/40"
        : "border-line-strong";

  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-soft">{SIZE_LABELS[size]}</span>

      <span
        className={`mt-1 flex h-9 items-center gap-1.5 rounded-lg border bg-surface px-2.5 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 ${border}`}
      >
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          disabled={loading}
          aria-label={`${productName}, ${SIZE_LABELS[size]} stock`}
          value={loading ? "" : shown}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") setDraft(undefined);
          }}
          className="w-full bg-transparent text-sm text-ink tabular-nums outline-none disabled:text-ink-muted"
        />

        {state === "saving" && <Spinner className="shrink-0 text-ink-muted" />}
        {state === "saved" && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />}
        {state === "idle" && draft !== undefined && (
          <span className="shrink-0 text-[0.625rem] text-ink-muted">unsaved</span>
        )}
      </span>
    </label>
  );
}
