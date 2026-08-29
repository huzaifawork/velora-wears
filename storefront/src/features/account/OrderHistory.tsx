import { Link } from "react-router-dom";

import type { Order } from "@shared/types";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsync } from "@/hooks/useAsync";
import { formatDate, formatPrice } from "@/lib/format";
import { listMyOrders } from "@/lib/myOrders";
import { PRODUCTS, productPath } from "@/lib/routes";
import { SIZE_LABELS } from "@/lib/sizes";

/**
 * Past orders — what an account unlocks, per the note added to requirements
 * section 12: "an account only lets a customer see past orders and skip
 * re-typing their details next time." This is the first half.
 *
 * Reads through `lib/myOrders.ts`, which is scoped by row level security to
 * exactly the orders belonging to the signed-in customer — see that file.
 */
export function OrderHistory() {
  const { data: orders, loading, error } = useAsync(() => listMyOrders(), "my-orders");

  if (loading) return <OrderHistorySkeleton />;

  if (error) {
    return (
      <p className="py-6 text-sm text-ink-soft">
        Your orders could not be loaded just now. Refreshing the page usually fixes this.
      </p>
    );
  }

  if (orders && orders.length === 0) {
    return (
      <div className="py-6">
        <p className="text-sm text-ink-soft">You have not placed an order yet.</p>
        <Link
          to={PRODUCTS}
          className="mt-3 inline-block text-xs tracking-eyebrow text-accent uppercase underline underline-offset-4 transition hover:text-ink"
        >
          Shop the collection
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-5">
      {orders?.map((order) => (
        <li key={order.id} className="rounded-sm border border-line bg-canvas-alt p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg text-ink">{order.orderNumber}</p>
              <p className="mt-1 text-xs text-ink-muted">{formatDate(order.createdAt)}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={STATUS_TONE[order.status]}>{order.status}</Badge>
              <span className="text-sm font-medium tabular-nums text-ink">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>

          <ul className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
            {order.items.map((item) => (
              <li
                key={`${item.productId}-${item.size}`}
                className="flex items-baseline justify-between gap-4 text-sm"
              >
                <Link
                  to={productPath(item.slug)}
                  className="min-w-0 truncate text-ink transition hover:text-accent"
                >
                  {item.name}
                </Link>
                <span className="shrink-0 text-xs text-ink-muted">
                  {SIZE_LABELS[item.size]} &middot; Qty {item.qty}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

const STATUS_TONE: Record<Order["status"], BadgeTone> = {
  pending: "neutral",
  confirmed: "accent",
  shipped: "accent",
  delivered: "success",
  cancelled: "danger",
};

function OrderHistorySkeleton() {
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: 2 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}
