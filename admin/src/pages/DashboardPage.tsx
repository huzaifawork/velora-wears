import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import { paymentMethodCopy } from "@shared/payment";
import { buttonClasses } from "@admin/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@admin/components/ui/Card";
import { OrderStatusBadge } from "@admin/components/ui/Badge";
import { CardsSkeleton, EmptyState, ErrorState, Skeleton } from "@admin/components/ui/Skeleton";
import {
  AlertIcon,
  InventoryIcon,
  OrdersIcon,
  PlusIcon,
  RevenueIcon,
} from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import { DASHBOARD_STATS_KEY, getDashboardStats } from "@admin/services/dashboard";
import { listRecentOrders } from "@admin/services/orders";
import { formatDate, formatPrice, formatRelative } from "@admin/lib/format";
import * as routes from "@admin/lib/routes";

/**
 * The dashboard home (requirements section 8 / the brief's section 4).
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ON IT, AND WHAT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------
 * The brief asks for the figures an administrator needs most often and warns
 * against overloading the screen with charts. So this is built around one
 * question — "is there anything I need to do?" — and answers it in the order it
 * gets asked:
 *
 *  1. Orders waiting. The only genuinely time-sensitive thing in a shop.
 *  2. Stock that is about to embarrass someone: sold out and running low, each
 *     a link straight to the filtered inventory screen rather than a number to
 *     go and find.
 *  3. Money, over two windows so one figure has something to mean against.
 *  4. The last few orders, because seeing them is usually the actual errand.
 *
 * There is ONE chart, a fourteen-day sparkline, and it earns its place by
 * answering something a number cannot: whether today is normal. No pie chart of
 * order statuses — the cards above already state those five numbers, and a
 * second encoding of the same five numbers is decoration.
 *
 * ---------------------------------------------------------------------------
 * ONE REQUEST FOR ALL FIFTEEN NUMBERS
 * ---------------------------------------------------------------------------
 * `admin_dashboard_stats()` computes every figure on this page in Postgres and
 * returns them as one JSON object. The alternative — a count query per card —
 * is fifteen round trips before the screen settles, and the naive version of
 * the revenue figure downloads the entire orders table to add it up in the
 * browser. The recent-orders list is the only second request, and it runs in
 * parallel rather than after.
 */
export function DashboardPage() {
  const stats = useQuery(
    DASHBOARD_STATS_KEY,
    ["orders", "products", "reviews"],
    getDashboardStats,
  );
  const recent = useQuery("orders:recent:6", ["orders"], () => listRecentOrders(6));

  if (stats.error) {
    return <ErrorState error={stats.error} onRetry={stats.refetch} />;
  }

  const data = stats.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Everything that needs attention in the Velora Wears shop, at a glance."
        action={
          <Link to={routes.PRODUCT_NEW} className={buttonClasses()}>
            <PlusIcon className="h-4 w-4" />
            New product
          </Link>
        }
      />

      {/* --- The work queue --------------------------------------------- */}
      {stats.loading || !data ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Orders to handle"
            value={data.orders.open}
            hint={`${data.orders.confirmed} confirmed · ${data.orders.shipped} shipped`}
            icon={<OrdersIcon />}
            to={routes.ORDERS}
            tone={data.orders.open > 0 ? "accent" : "neutral"}
          />
          <StatCard
            label="Sold out"
            value={data.products.outOfStock}
            hint="Active products with no stock in any size"
            icon={<AlertIcon />}
            to={routes.inventoryPath("out")}
            tone={data.products.outOfStock > 0 ? "danger" : "neutral"}
          />
          <StatCard
            label="Running low"
            value={data.products.lowStock}
            hint="At or below the low-stock threshold"
            icon={<InventoryIcon />}
            to={routes.inventoryPath("low")}
            tone={data.products.lowStock > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Revenue, 30 days"
            value={formatPrice(data.orders.revenue30d)}
            hint={`${data.orders.last30d} orders · ${formatPrice(data.orders.revenue)} all time`}
            icon={<RevenueIcon />}
            tone="neutral"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* --- Recent orders ------------------------------------------- */}
        <Card padded={false}>
          <div className="p-5 sm:p-6 sm:pb-4">
            <CardHeader
              title="Latest orders"
              description="Newest first. New orders appear here as they are placed."
              action={
                <Link
                  to={routes.ORDERS}
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  All orders
                </Link>
              }
            />
          </div>

          {recent.error ? (
            <ErrorState error={recent.error} onRetry={recent.refetch} />
          ) : recent.loading ? (
            <div className="space-y-3 px-5 pb-5 sm:px-6">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : (recent.data ?? []).length === 0 ? (
            <EmptyState
              icon={<OrdersIcon />}
              title="No orders yet"
              description="Once the shop is live and a customer checks out, their order appears here immediately."
            />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {(recent.data ?? []).map((order) => (
                <li key={order.id}>
                  <Link
                    to={routes.orderPath(order.id)}
                    className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-surface-sunken sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {order.customer.fullName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {order.orderNumber} · {formatRelative(order.createdAt)} ·{" "}
                        {paymentMethodCopy(order.paymentMethod).label}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-ink tabular-nums">
                        {formatPrice(order.total)}
                      </p>
                      <OrderStatusBadge status={order.status} className="mt-1" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* --- The catalog, and the one chart -------------------------- */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Catalog"
              action={
                <Link
                  to={routes.PRODUCTS}
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  Manage
                </Link>
              }
            />

            {stats.loading || !data ? (
              <div className="mt-5 space-y-3">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-5 w-full" />
                ))}
              </div>
            ) : (
              <dl className="mt-5 space-y-3 text-sm">
                <Line label="Products live in the shop" value={data.products.active} />
                <Line label="Retired (hidden from customers)" value={data.products.inactive} />
                <Line label="Featured on the landing page" value={data.products.featured} />
                <Line label="Categories" value={`${data.categories.active} of ${data.categories.total} shown`} />
                <Line label="Units in stock" value={data.products.units} />
                <Line
                  label="Reviews"
                  value={
                    data.reviews.hidden > 0
                      ? `${data.reviews.total} · ${data.reviews.hidden} hidden`
                      : data.reviews.total
                  }
                />
              </dl>
            )}

            {data && data.products.total === 0 && (
              <div className="mt-5 rounded-lg border border-accent/30 bg-accent/8 p-4">
                <p className="text-sm leading-relaxed text-ink">
                  <strong className="font-medium">The shop has no products yet.</strong>{" "}
                  Creating the first one — with stock and photographs — is what
                  lets the storefront start taking real orders.
                </p>
                <Link to={routes.PRODUCT_NEW} className={buttonClasses({ size: "sm", className: "mt-3" })}>
                  <PlusIcon className="h-4 w-4" />
                  Add the first product
                </Link>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Last 14 days" description="Orders per day." />
            {stats.loading || !data ? (
              <Skeleton className="mt-5 h-24 w-full" />
            ) : (
              <Sparkline data={data.daily} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Pieces
 * ------------------------------------------------------------------------ */

const TONES = {
  neutral: "text-ink-soft bg-surface-sunken",
  accent: "text-accent bg-accent/12",
  warning: "text-warning bg-warning/12",
  danger: "text-danger bg-danger/12",
} as const;

/**
 * A statistic, and — where there is one — the screen that acts on it.
 *
 * The link is the part that matters. "12 products running low" is a fact; a
 * card that takes you to those twelve products is the beginning of doing
 * something about it, and the difference between a dashboard and a poster.
 */
function StatCard({
  label,
  value,
  hint,
  icon,
  to,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ReactNode;
  to?: string;
  tone?: keyof typeof TONES;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-soft">{label}</p>
        <span className={`rounded-lg p-1.5 ${TONES[tone]}`}>{icon}</span>
      </div>
      <p className="mt-3 font-display text-3xl leading-none text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </>
  );

  const className =
    "rounded-xl border border-line bg-surface p-5 shadow-card transition duration-200 ease-brand";

  return to ? (
    <Link to={to} className={`${className} hover:border-line-strong hover:shadow-raised`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="shrink-0 font-medium text-ink tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Fourteen bars. No axis, no legend, no library.
 *
 * A sparkline answers one question — is today like the other days — and it
 * answers it best with nothing else on it. The exact numbers are in the tooltip
 * and in the accessible table below it, which is also what a screen reader
 * reads instead of trying to describe a picture.
 */
function Sparkline({ data }: { data: Array<{ day: string; orders: number; revenue: number }> }) {
  const peak = Math.max(1, ...data.map((point) => point.orders));
  const total = data.reduce((sum, point) => sum + point.orders, 0);

  if (total === 0) {
    return (
      <p className="mt-5 text-sm leading-relaxed text-ink-muted">
        No orders in the last fourteen days.
      </p>
    );
  }

  return (
    <div className="mt-5">
      <div className="flex h-24 items-end gap-1" aria-hidden="true">
        {data.map((point) => (
          <div
            key={point.day}
            title={`${formatDate(new Date(point.day).getTime())} — ${point.orders} ${point.orders === 1 ? "order" : "orders"}`}
            className="flex-1 rounded-t-sm bg-accent/25 transition hover:bg-accent/50"
            style={{ height: `${Math.max(4, (point.orders / peak) * 100)}%` }}
          />
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[0.6875rem] text-ink-muted">
        <span>{data[0] ? formatDate(new Date(data[0].day).getTime()) : ""}</span>
        <span>Today</span>
      </div>

      <p className="sr-only">
        {data
          .map(
            (point) =>
              `${formatDate(new Date(point.day).getTime())}: ${point.orders} orders`,
          )
          .join(". ")}
      </p>

      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">
        <span className="font-medium text-ink tabular-nums">{total}</span> orders in
        fourteen days
      </p>
    </div>
  );
}
