import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { OrderStatus } from "@shared/types";
import { paymentMethodCopy } from "@shared/payment";
import { buttonClasses } from "@admin/components/ui/Button";
import { Card, PageHeader } from "@admin/components/ui/Card";
import { OrderStatusBadge } from "@admin/components/ui/Badge";
import { DataTable, Pagination, type Column } from "@admin/components/ui/DataTable";
import { EmptyState, ErrorState } from "@admin/components/ui/Skeleton";
import { ActiveFilters, FilterBar, SearchInput } from "@admin/components/ui/SearchInput";
import { Select } from "@admin/components/ui/Select";
import { EyeIcon, OrdersIcon } from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import { useUrlState } from "@admin/hooks/useUrlState";
import { DEFAULT_PAGE_SIZE } from "@admin/services/products";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COPY,
  listOrders,
  orderListKey,
  type OrderSort,
} from "@admin/services/orders";
import type { AdminOrder } from "@admin/services/rows";
import { formatDateTime, formatPrice, formatRelative } from "@admin/lib/format";
import * as routes from "@admin/lib/routes";

/**
 * Orders (requirements section 8 — "every confirmed customer order should be
 * stored and visible in the Admin Dashboard for order management").
 *
 * ---------------------------------------------------------------------------
 * ONE INDEXED SEARCH ACROSS FIVE FIELDS
 * ---------------------------------------------------------------------------
 * The brief asks for search by order number, customer name, phone and email.
 * Written the obvious way that is four `or`-ed `ilike`s over four unindexed
 * columns, and Postgres scans the table for every keystroke. Instead
 * `orders.search_text` is a GENERATED column over all five (the four plus the
 * city) with a trigram index behind it — so one substring match answers all of
 * them, and "1234" finds a phone number by its middle rather than only by its
 * start. See `20260830000001_admin_dashboard.sql`.
 *
 * ---------------------------------------------------------------------------
 * NO LINE ITEMS IN THE LIST
 * ---------------------------------------------------------------------------
 * Forty orders is four hundred line items nobody reads until a row is opened.
 * They come with the detail read, embedded in the same query.
 *
 * New orders arrive here on their own: the layout holds one Realtime
 * subscription on `orders`, and an insert drops the cached reads so whatever is
 * mounted re-reads.
 */
export function OrdersPage() {
  const [params] = useSearchParams();
  const url = useUrlState();

  const search = params.get("q") ?? "";
  const status = (params.get("status") as OrderStatus | "all") || "all";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const sort = (params.get("sort") as OrderSort) || "newest";
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const options = useMemo(
    () => ({ search, status, from, to, sort, page, pageSize: DEFAULT_PAGE_SIZE }),
    [search, status, from, to, sort, page],
  );

  const orders = useQuery(orderListKey(options), ["orders"], () => listOrders(options));

  const activeFilterCount =
    (search ? 1 : 0) + (status !== "all" ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);

  const clearAll = () =>
    url.set({ q: null, status: null, from: null, to: null, page: null });

  const columns: Column<AdminOrder>[] = [
    {
      key: "order",
      label: "Order",
      primary: true,
      cell: (order) => (
        <div className="min-w-0">
          <Link
            to={routes.orderPath(order.id)}
            className="block truncate text-sm font-medium text-ink hover:text-accent"
          >
            {order.customer.fullName}
          </Link>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-muted">
            {order.orderNumber}
          </p>
        </div>
      ),
    },
    {
      key: "contact",
      label: "Contact",
      hideOnMobile: true,
      cell: (order) => (
        <div className="min-w-0 text-xs text-ink-soft">
          <p className="truncate">{order.customer.phone}</p>
          <p className="truncate text-ink-muted">{order.customer.email}</p>
        </div>
      ),
    },
    {
      key: "city",
      label: "City",
      cell: (order) => <span className="text-sm text-ink-soft">{order.customer.city}</span>,
    },
    {
      key: "placed",
      label: "Placed",
      cell: (order) => (
        <span className="text-sm text-ink-soft" title={formatDateTime(order.createdAt)}>
          {formatRelative(order.createdAt)}
        </span>
      ),
    },
    {
      key: "payment",
      label: "Payment",
      hideOnMobile: true,
      cell: (order) => (
        <span className="text-xs text-ink-soft">
          {paymentMethodCopy(order.paymentMethod).label}
        </span>
      ),
    },
    {
      key: "total",
      label: "Total",
      align: "right",
      cell: (order) => (
        <span className="text-sm font-medium text-ink tabular-nums">
          {formatPrice(order.total)}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      align: "right",
      cell: (order) => <OrderStatusBadge status={order.status} />,
    },
    {
      // The row's name already links to the same place, but a name does not
      // LOOK like a way in — this is the affordance, in the column every other
      // list screen keeps its row actions in (client feedback, 2026-08-31).
      key: "actions",
      label: "",
      align: "right",
      width: "1%",
      cell: (order) => (
        <div className="flex items-center justify-end">
          <Link
            to={routes.orderPath(order.id)}
            aria-label={`View order ${order.orderNumber}`}
            title="View order"
            className="rounded-md p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
          >
            <EyeIcon className="h-4 w-4" />
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Every order the shop has taken. Open one to see what was bought and to move it along."
      />

      <Card padded={false}>
        <FilterBar
          search={
            <SearchInput
              label="Search orders by number, name, phone or email"
              placeholder="Order number, name, phone…"
              value={search}
              onChange={(value) => url.set({ q: value || null, page: null })}
            />
          }
          filters={
            <>
              <Select
                label="Status"
                hideLabel
                value={status}
                onChange={(value) => url.set({ status: value === "all" ? null : value, page: null })}
                className="min-w-[9rem]"
                options={[
                  { value: "all", label: "Any status" },
                  ...ORDER_STATUSES.map((value) => ({
                    value,
                    label: ORDER_STATUS_COPY[value].label,
                  })),
                ]}
              />

              <label className="flex shrink-0 items-center gap-2 text-xs text-ink-soft">
                <span className="sr-only sm:not-sr-only">From</span>
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => url.set({ from: event.target.value || null, page: null })}
                  aria-label="Orders placed on or after"
                  className="h-10 rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink transition hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
                />
              </label>

              <label className="flex shrink-0 items-center gap-2 text-xs text-ink-soft">
                <span className="sr-only sm:not-sr-only">To</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => url.set({ to: event.target.value || null, page: null })}
                  aria-label="Orders placed on or before"
                  className="h-10 rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink transition hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
                />
              </label>

              <Select
                label="Sort"
                hideLabel
                value={sort}
                onChange={(value) => url.set({ sort: value === "newest" ? null : value, page: null })}
                className="min-w-[9rem]"
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                  { value: "total-desc", label: "Largest first" },
                  { value: "total-asc", label: "Smallest first" },
                ]}
              />

              <ActiveFilters count={activeFilterCount} onClear={clearAll} />
            </>
          }
        />

        {orders.error ? (
          <ErrorState error={orders.error} onRetry={orders.refetch} />
        ) : (
          <>
            <DataTable
              rows={orders.data?.rows ?? []}
              columns={columns}
              rowKey={(order) => order.id}
              loading={orders.loading}
              caption="Customer orders, with contact details, total and status"
              empty={
                activeFilterCount > 0 ? (
                  <EmptyState
                    icon={<OrdersIcon />}
                    title="No orders match those filters"
                    description="Nothing in the shop's history matches every filter you have set."
                    action={
                      <button
                        type="button"
                        className={buttonClasses({ variant: "secondary", size: "sm" })}
                        onClick={clearAll}
                      >
                        Clear filters
                      </button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<OrdersIcon />}
                    title="No orders yet"
                    description="Orders appear here the moment a customer checks out — the shop writes them straight into the database, and this screen updates without a refresh."
                  />
                )
              }
            />

            <Pagination
              page={page}
              pageSize={DEFAULT_PAGE_SIZE}
              total={orders.data?.total ?? 0}
              onPage={(next) => url.set({ page: next === 1 ? null : String(next) })}
            />
          </>
        )}
      </Card>
    </div>
  );
}
