import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ProductSummary } from "@shared/types";
import { buttonClasses } from "@admin/components/ui/Button";
import { Card, PageHeader } from "@admin/components/ui/Card";
import { Badge, StockBadge } from "@admin/components/ui/Badge";
import { DataTable, Pagination, type Column } from "@admin/components/ui/DataTable";
import { EmptyState, ErrorState } from "@admin/components/ui/Skeleton";
import { ActiveFilters, FilterBar, SearchInput } from "@admin/components/ui/SearchInput";
import { Select } from "@admin/components/ui/Select";
import { Thumb } from "@admin/components/ui/Thumb";
import { useToast } from "@admin/components/ui/Toast";
import { ConfirmDialog } from "@admin/components/ui/Modal";
import {
  EditIcon,
  ExternalIcon,
  PlusIcon,
  ProductsIcon,
  TrashIcon,
} from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import { useUrlState } from "@admin/hooks/useUrlState";
import {
  DEFAULT_PAGE_SIZE,
  deleteProduct,
  listProducts,
  productListKey,
  setProductActive,
  type ActiveFilter,
  type ProductSort,
  type StockFilter,
} from "@admin/services/products";
import { CATEGORY_LIST_KEY, listCategories } from "@admin/services/categories";
import { categorySelectOptions } from "@admin/lib/categoryOptions";
import { SETTINGS_KEY, getSettings } from "@admin/services/settings";
import { formatPrice, prettifySlug } from "@admin/lib/format";
import * as routes from "@admin/lib/routes";

/**
 * The products list (requirements section 8: search, filter, sort, paginate).
 *
 * ---------------------------------------------------------------------------
 * THE FILTERS LIVE IN THE URL
 * ---------------------------------------------------------------------------
 * Every control on this screen writes to the query string, and the query string
 * is the only state. That is not tidiness — it is three concrete behaviours an
 * admin tool needs and internal component state cannot give:
 *
 *   - the back button undoes a filter instead of leaving the screen;
 *   - editing a product and returning lands on the same filtered page rather
 *     than back at the top of everything;
 *   - "the twelve hoodies that are sold out" is a link that can be sent to
 *     somebody.
 *
 * It is also what makes the dashboard's own stat cards work: "Sold out: 7" on
 * the home screen is a link to this page with a filter already applied.
 *
 * Every one of those filters is applied by POSTGRES (see `services/products`),
 * with the page and the total count coming back in one round trip.
 */
export function ProductsPage() {
  const toast = useToast();
  const [params] = useSearchParams();
  const url = useUrlState();

  const search = params.get("q") ?? "";
  const category = params.get("category") ?? "";
  const stock = (params.get("stock") as StockFilter) || "all";
  const status = (params.get("status") as ActiveFilter) || "all";
  const sort = (params.get("sort") as ProductSort) || "newest";
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const options = useMemo(
    () => ({
      search,
      categorySlug: category || undefined,
      stock,
      status,
      sort,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    [search, category, stock, status, sort, page],
  );

  const products = useQuery(productListKey(options), ["products"], () =>
    listProducts(options),
  );

  // Two small reads the whole screen shares. Categories name the filter
  // dropdown and the category column; settings carry the low-stock threshold,
  // so the badge in this table means exactly what the shop's badge means.
  const categories = useQuery(CATEGORY_LIST_KEY, ["categories"], listCategories);
  const settings = useQuery(SETTINGS_KEY, ["settings"], getSettings);
  const threshold = settings.data?.lowStockThreshold;

  const [pendingDelete, setPendingDelete] = useState<ProductSummary>();
  const [deleting, setDeleting] = useState(false);

  const activeFilterCount =
    (search ? 1 : 0) + (category ? 1 : 0) + (stock !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0);

  /**
   * Activating and deactivating is OPTIMISTIC — the brief's "where safe"
   * case.
   *
   * It is one boolean, it is instantly visible, and if the write fails the
   * list re-reads and the switch goes back. Nothing about it can produce a
   * wrong number: contrast with stock, which is never optimistic anywhere in
   * this dashboard.
   */
  const onToggleActive = useCallback(
    async (product: ProductSummary) => {
      const next = !product.active;
      try {
        await setProductActive(product.id, next);
        toast.success(
          next
            ? `${product.name} is live in the shop`
            : `${product.name} is hidden from customers`,
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        products.refetch();
      }
    },
    [products, toast],
  );

  const onDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    try {
      await deleteProduct(pendingDelete.id);
      toast.success(`${pendingDelete.name} deleted`);
      setPendingDelete(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<ProductSummary>[] = [
    {
      key: "name",
      label: "Product",
      primary: true,
      cell: (product) => (
        <div className="flex items-center gap-3">
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
            <p className="mt-0.5 truncate text-xs text-ink-muted">/{product.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      cell: (product) => (
        <span className="text-sm text-ink-soft">
          {categories.data?.find((c) => c.slug === product.categorySlug)?.name ??
            prettifySlug(product.categorySlug)}
        </span>
      ),
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      cell: (product) => (
        <span className="text-sm text-ink tabular-nums">{formatPrice(product.price)}</span>
      ),
    },
    {
      key: "stock",
      label: "Stock",
      cell: (product) => (
        <StockBadge quantity={product.totalStock ?? 0} threshold={threshold} />
      ),
    },
    {
      key: "status",
      label: "Status",
      cell: (product) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void onToggleActive(product)}
            title={product.active ? "Hide from the shop" : "Show in the shop"}
          >
            <Badge tone={product.active ? "success" : "neutral"}>
              {product.active ? "Live" : "Hidden"}
            </Badge>
          </button>
          {product.featured && <Badge tone="accent">Featured</Badge>}
        </div>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      width: "1%",
      cell: (product) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            to={routes.productPath(product.id)}
            aria-label={`Edit ${product.name}`}
            className="rounded-md p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
          >
            <EditIcon className="h-4 w-4" />
          </Link>

          {product.active && (
            <a
              href={routes.shopProductUrl(product.slug)}
              target="_blank"
              rel="noreferrer"
              aria-label={`View ${product.name} in the shop`}
              className="rounded-md p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
            >
              <ExternalIcon className="h-4 w-4" />
            </a>
          )}

          <button
            type="button"
            onClick={() => setPendingDelete(product)}
            aria-label={`Delete ${product.name}`}
            className="rounded-md p-2 text-ink-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Everything the shop sells. Prices, photographs, sizes and stock."
        action={
          <Link to={routes.PRODUCT_NEW} className={buttonClasses()}>
            <PlusIcon className="h-4 w-4" />
            New product
          </Link>
        }
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
            <>
              <Select
                label="Category"
                hideLabel
                value={category}
                onChange={(value) => url.set({ category: value || null, page: null })}
                className="min-w-[9rem]"
                /* Grouped, so a subcategory reads as being inside its parent.
                   The filter is EXACT — picking "Shirts" lists the products
                   whose category is Shirts, not the ones in its subcategories —
                   which is what the count beside each row on the categories
                   screen links to, and what an admin means by "the rows I would
                   be editing". The shop rolls a parent up; this does not. */
                options={[
                  { value: "", label: "All categories" },
                  ...categorySelectOptions(categories.data ?? []),
                ]}
              />

              <Select
                label="Stock"
                hideLabel
                value={stock}
                onChange={(value) => url.set({ stock: value === "all" ? null : value, page: null })}
                className="min-w-[8.5rem]"
                options={[
                  { value: "all", label: "Any stock" },
                  { value: "in", label: "In stock" },
                  { value: "low", label: "Running low" },
                  { value: "out", label: "Sold out" },
                ]}
              />

              <Select
                label="Visibility"
                hideLabel
                value={status}
                onChange={(value) => url.set({ status: value === "all" ? null : value, page: null })}
                className="min-w-[8rem]"
                options={[
                  { value: "all", label: "Live & hidden" },
                  { value: "active", label: "Live only" },
                  { value: "inactive", label: "Hidden only" },
                ]}
              />

              <Select
                label="Sort"
                hideLabel
                value={sort}
                onChange={(value) => url.set({ sort: value === "newest" ? null : value, page: null })}
                className="min-w-[9.5rem]"
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                  { value: "name", label: "Name A-Z" },
                  { value: "price-asc", label: "Price: low to high" },
                  { value: "price-desc", label: "Price: high to low" },
                ]}
              />

              <ActiveFilters
                count={activeFilterCount}
                onClear={() =>
                  url.set({ q: null, category: null, stock: null, status: null, page: null })
                }
              />
            </>
          }
        />

        {products.error ? (
          <ErrorState error={products.error} onRetry={products.refetch} />
        ) : (
          <>
            <DataTable
              rows={products.data?.rows ?? []}
              columns={columns}
              rowKey={(product) => product.id}
              loading={products.loading}
              caption="Products, with their category, price, stock and visibility"
              empty={
                activeFilterCount > 0 ? (
                  <EmptyState
                    icon={<ProductsIcon />}
                    title="Nothing matches those filters"
                    description="No product in the catalog matches every filter you have set."
                    action={
                      <button
                        type="button"
                        className={buttonClasses({ variant: "secondary", size: "sm" })}
                        onClick={() =>
                          url.set({
                            q: null,
                            category: null,
                            stock: null,
                            status: null,
                            page: null,
                          })
                        }
                      >
                        Clear filters
                      </button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<ProductsIcon />}
                    title="No products yet"
                    description="Add the first piece — its photographs, its price and how many of each size you have. It appears in the shop the moment it is saved and marked live."
                    action={
                      <Link to={routes.PRODUCT_NEW} className={buttonClasses({ size: "sm" })}>
                        <PlusIcon className="h-4 w-4" />
                        New product
                      </Link>
                    }
                  />
                )
              }
            />

            <Pagination
              page={page}
              pageSize={DEFAULT_PAGE_SIZE}
              total={products.data?.total ?? 0}
              onPage={(next) => url.set({ page: next === 1 ? null : String(next) })}
            />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(undefined)}
        onConfirm={() => void onDelete()}
        loading={deleting}
        title={`Delete ${pendingDelete?.name ?? "this product"}?`}
        message={
          <>
            This removes the product, its photographs and its stock permanently.
            It cannot be undone.
            <br />
            <br />
            If it has ever been ordered, the database will refuse — a past order
            has to keep showing what was actually bought. Hide it instead, and it
            disappears from the shop while the order history stays intact.
          </>
        }
      />
    </div>
  );
}
