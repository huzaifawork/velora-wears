import type { ReactNode } from "react";

import type { OrderStatus } from "@shared/types";
import { STOCK_LEVEL_LABEL, stockLevel, type StockLevel } from "@shared/stock";

/**
 * Status pills — one component, one set of tones (requirements section 18).
 *
 * The two specialised badges below matter more than the generic one: STOCK and
 * ORDER STATUS are the two things this dashboard says over and over, on the
 * products list, the inventory screen, the orders table, the order detail and
 * the dashboard home. Written per screen, "Low stock" would sooner or later be
 * amber in one place and red in another, and — worse — would be computed from a
 * different threshold. `StockBadge` takes the number and asks `shared/stock.ts`,
 * which is the SAME function the storefront's own badge calls and the same rule
 * the `product_summaries` view encodes.
 */

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "ink";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-ink-soft ring-line-strong",
  accent: "bg-accent/12 text-accent ring-accent/30",
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/10 text-warning ring-warning/25",
  danger: "bg-danger/10 text-danger ring-danger/25",
  info: "bg-info/10 text-info ring-info/25",
  ink: "bg-brand text-white ring-brand",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Stock (requirements section 11)
 * ------------------------------------------------------------------------ */

const STOCK_TONES: Record<StockLevel, BadgeTone> = {
  "out-of-stock": "danger",
  "low-stock": "warning",
  "in-stock": "success",
};

/**
 * The stock badge. The LEVEL is decided by `shared/stock.ts` — never by a
 * comparison written here.
 *
 * That file exists because "low" once had three different definitions across
 * this project and a piece with five units left was "Low stock" in one place
 * and "In stock" in another. The dashboard is now a fourth reader of that rule,
 * and it reads it rather than restating it.
 */
export function StockBadge({
  quantity,
  threshold,
  className = "",
}: {
  quantity: number;
  /** `settings.low_stock_threshold`. Falls back to the shared default. */
  threshold?: number;
  className?: string;
}) {
  const level = stockLevel(quantity, threshold);

  return (
    <Badge tone={STOCK_TONES[level]} className={className}>
      {STOCK_LEVEL_LABEL[level]}
      {level !== "out-of-stock" && (
        <span className="tabular-nums opacity-70">· {quantity}</span>
      )}
    </Badge>
  );
}

/* ---------------------------------------------------------------------------
 * Order status (requirements section 8)
 * ------------------------------------------------------------------------ */

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  pending: "neutral",
  confirmed: "info",
  shipped: "accent",
  delivered: "success",
  cancelled: "danger",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function OrderStatusBadge({
  status,
  className = "",
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <Badge tone={STATUS_TONES[status]} className={className}>
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-current opacity-70"
      />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export { STATUS_LABELS as ORDER_STATUS_LABELS };
