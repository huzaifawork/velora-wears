import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { OrderStatus } from "@shared/types";
import { paymentMethodCopy } from "@shared/payment";
import { buttonClasses } from "@admin/components/ui/Button";
import { Card, PageHeader } from "@admin/components/ui/Card";
import { Badge, OrderStatusBadge } from "@admin/components/ui/Badge";
import { DataTable, Pagination, type Column } from "@admin/components/ui/DataTable";
import { EmptyState, ErrorState } from "@admin/components/ui/Skeleton";
import { ActiveFilters, FilterBar, SearchInput } from "@admin/components/ui/SearchInput";
import { Select } from "@admin/components/ui/Select";
import { ConfirmDialog } from "@admin/components/ui/Modal";
import { useToast } from "@admin/components/ui/Toast";
import {
  ArchiveIcon,
  EyeIcon,
  OrdersIcon,
  RestoreIcon,
  TrashIcon,
} from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import { useUrlState } from "@admin/hooks/useUrlState";
import { DEFAULT_PAGE_SIZE } from "@admin/services/products";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COPY,
  ORDER_VIEW_COPY,
  archiveOrder,
  canArchive,
  deleteOrder,
  listOrders,
  orderListKey,
  restoreOrder,
  type OrderSort,
  type OrderView,
} from "@admin/services/orders";
import type { AdminOrder } from "@admin/services/rows";
import { formatDateTime, formatPrice, formatRelative } from "@admin/lib/format";
import * as routes from "@admin/lib/routes";

/**
 * What deleting THIS order will actually do.
 *
 * Three different orders are three different consequences, and a single
 * paragraph covering all of them would either frighten someone clearing out a
 * cancelled test order or under-warn someone about to erase a sale they still
 * have to deliver. The first paragraph is the same for every order; the second
 * is the one that depends on which order it is.
 */
function DeleteWarning({ order }: { order: AdminOrder }) {
  return (
    <>
      This erases the order, everything on it, and any reviews the customer
      wrote from it. It disappears from their own order history in the shop and
      from the shop&apos;s revenue figures, and it cannot be undone.
      <br />
      <br />
      {!canArchive(order.status) ? (
        <>
          This order has not been fulfilled yet — it is still{" "}
          {ORDER_STATUS_COPY[order.status].label.toLowerCase()}. Deleting it is
          not the same as cancelling it: no stock comes back, and the customer
          is left with nothing to point at if they ask what happened. Cancel it
          first unless the record itself has to go.
        </>
      ) : order.archivedAt !== undefined ? (
        <>
          It is already archived, so it is off the orders list and out of your
          way. Deleting is only worth doing if the record itself has to go.
        </>
      ) : (
        <>
          If you only want it off the list, archive it instead — that is the box
          icon on the row, and it keeps the record and can be undone.
        </>
      )}
    </>
  );
}

/**
 * The row-action button. Same shape as the icon buttons on Products and
 * Reviews; `disabled:` states are here rather than there because these three
 * are the only row actions in the dashboard that WRITE, so they are the only
 * ones that can be mid-flight.
 */
const ROW_ACTION =
  "rounded-md p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink " +
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

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
 *
 * ---------------------------------------------------------------------------
 * TWO WAYS OFF THIS LIST: ARCHIVE AND DELETE
 * ---------------------------------------------------------------------------
 * DELETE is on every row and erases the order for good — its line items and any
 * reviews written from it go with it, and `deleted_orders` keeps the number and
 * the total so the shop can still account for the gap. It is one dialog away,
 * and the dialog says what will happen, including a plainer warning when the
 * order has not been fulfilled yet.
 *
 * ARCHIVE sits beside it as the reversible option, for the far more common case
 * of "this is finished, get it off my screen". The order keeps existing, keeps
 * counting towards revenue, and keeps showing in the customer's own order
 * history. It is offered on a DELIVERED or CANCELLED order only, because filing
 * away work that has not finished would hide it from the orders badge in the
 * sidebar while the badge went on counting it.
 */
export function OrdersPage() {
  const [params] = useSearchParams();
  const url = useUrlState();

  const search = params.get("q") ?? "";
  const status = (params.get("status") as OrderStatus | "all") || "all";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const sort = (params.get("sort") as OrderSort) || "newest";
  const view = (params.get("view") as OrderView) || "active";
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const options = useMemo(
    () => ({ search, status, from, to, sort, view, page, pageSize: DEFAULT_PAGE_SIZE }),
    [search, status, from, to, sort, view, page],
  );

  const orders = useQuery(orderListKey(options), ["orders"], () => listOrders(options));

  const toast = useToast();

  // Which row has a write in flight, so its buttons can be disabled without a
  // spinner state per row. `undefined` is "nothing running".
  const [busyId, setBusyId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<AdminOrder>();
  const [deleting, setDeleting] = useState(false);

  const onArchive = async (order: AdminOrder) => {
    setBusyId(order.id);
    try {
      await archiveOrder(order.id);
      toast.success(`${order.orderNumber} archived. It is in the Archived view if you need it back.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(undefined);
    }
  };

  const onRestore = async (order: AdminOrder) => {
    setBusyId(order.id);
    try {
      await restoreOrder(order.id);
      toast.success(`${order.orderNumber} is back on the orders list.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(undefined);
    }
  };

  const onDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    try {
      const removed = await deleteOrder(pendingDelete.id);
      // The database reports what it actually removed, so the confirmation says
      // it rather than a generic "deleted" that leaves the admin wondering what
      // else went with it.
      toast.success(
        removed.reviewsDeleted > 0
          ? `${removed.orderNumber} deleted, along with ${removed.reviewsDeleted} review${
              removed.reviewsDeleted === 1 ? "" : "s"
            } written from it.`
          : `${removed.orderNumber} deleted.`,
      );
      setPendingDelete(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  };

  // The filters that NARROW a set, as distinct from the one that chooses which
  // set is being looked at. An empty Archived view with nothing else set is
  // "you have not archived anything", not "no results" — a different sentence,
  // and the only way to tell them apart is to count the two separately.
  const narrowingFilterCount =
    (search ? 1 : 0) + (status !== "all" ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);

  const activeFilterCount = narrowingFilterCount + (view !== "active" ? 1 : 0);

  const clearAll = () =>
    url.set({ q: null, status: null, from: null, to: null, view: null, page: null });

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
      // An archived order still has a status — it is a DELIVERED order that has
      // been filed away — so the marker sits beside the status badge rather
      // than replacing it. It only ever renders in the Archived and All views,
      // because the working list has no archived rows in it by definition.
      cell: (order) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <OrderStatusBadge status={order.status} />
          {order.archivedAt !== undefined && (
            <span title={`Archived ${formatDateTime(order.archivedAt)}`}>
              <Badge tone="neutral">Archived</Badge>
            </span>
          )}
        </div>
      ),
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
        <div className="flex items-center justify-end gap-1">
          <Link
            to={routes.orderPath(order.id)}
            aria-label={`View order ${order.orderNumber}`}
            title="View order"
            className="rounded-md p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
          >
            <EyeIcon className="h-4 w-4" />
          </Link>

          {/* Archive, or its undo. Neither is offered on an order that is
              still being fulfilled — see `canArchive`. */}
          {order.archivedAt !== undefined ? (
            <button
              type="button"
              onClick={() => void onRestore(order)}
              disabled={busyId === order.id}
              aria-label={`Put order ${order.orderNumber} back on the list`}
              title="Put back on the orders list"
              className={ROW_ACTION}
            >
              <RestoreIcon className="h-4 w-4" />
            </button>
          ) : (
            canArchive(order.status) && (
              <button
                type="button"
                onClick={() => void onArchive(order)}
                disabled={busyId === order.id}
                aria-label={`Archive order ${order.orderNumber}`}
                title="Archive — takes it off this list, keeps the record"
                className={ROW_ACTION}
              >
                <ArchiveIcon className="h-4 w-4" />
              </button>
            )
          )}

          {/* Delete, on every row whatever state it is in. It is last in the
              group and the only one that turns red, because it is the only one
              here that cannot be undone. */}
          <button
            type="button"
            onClick={() => setPendingDelete(order)}
            disabled={busyId === order.id}
            aria-label={`Delete order ${order.orderNumber} permanently`}
            title="Delete permanently"
            className={`${ROW_ACTION} hover:bg-danger/10 hover:text-danger`}
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
                label="Show"
                hideLabel
                value={view}
                onChange={(value) =>
                  url.set({ view: value === "active" ? null : value, page: null })
                }
                className="min-w-[9.5rem]"
                options={(["active", "archived", "all"] as const).map((value) => ({
                  value,
                  label: ORDER_VIEW_COPY[value].label,
                }))}
              />

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

        {/* The archive drawer says what it is. Without this the screen is a
            list of orders that look identical to the working list, and the one
            thing an admin needs to know here — that nothing on it is lost — is
            invisible. */}
        {view === "archived" && !orders.error && (
          <p className="border-t border-line bg-surface-raised px-5 py-3 text-xs leading-relaxed text-ink-soft sm:px-6">
            {ORDER_VIEW_COPY.archived.hint}
          </p>
        )}

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
                view === "archived" && narrowingFilterCount === 0 ? (
                  <EmptyState
                    icon={<ArchiveIcon />}
                    title="Nothing archived"
                    description="Archiving a delivered or cancelled order takes it off the working list without deleting it. Nothing has been filed away yet."
                  />
                ) : activeFilterCount > 0 ? (
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

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(undefined)}
        onConfirm={() => void onDelete()}
        loading={deleting}
        title={`Delete ${pendingDelete?.orderNumber ?? "this order"} permanently?`}
        message={pendingDelete && <DeleteWarning order={pendingDelete} />}
      />
    </div>
  );
}
