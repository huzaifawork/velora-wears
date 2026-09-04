import { useId, useState } from "react";
import { Link } from "react-router-dom";

import { CartLineRow } from "@/features/cart/CartLineRow";
import { CartSummary } from "@/features/cart/CartSummary";
import { formatPrice } from "@/lib/format";
import { CART } from "@/lib/routes";
import type { CartTotals } from "@/lib/cart";

/**
 * The bag as checkout shows it (requirements section 6 — product, size,
 * quantity and total must all be visible before the order is confirmed).
 *
 * ONE component, two appearances, which is the shape the client's reference
 * design asks for:
 *
 *  - **On a phone** it opens as a single bar above the form — "Order summary"
 *    and the total — that expands to the full list when tapped. A checkout
 *    that leads with eight line items pushes the first field a screen and a
 *    half down, and the one number the customer is checking is the total,
 *    which the bar already carries (section 15).
 *  - **From `lg` up** there is nothing to collapse: the summary sits in its own
 *    rail beside the form, always open, and the toggle is not rendered.
 *
 * The list and the figures are NOT written here. They are `CartLineRow` and
 * `CartSummary`, the same two the drawer and the cart page render, because the
 * mini bag, the full bag and this one disagreeing about what is in the order —
 * or what it comes to — is the failure section 18 exists to prevent.
 */
export function CheckoutSummary({ cart }: { cart: CartTotals }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const items = cart.lines.reduce((n, line) => n + line.item.qty, 0);
  const itemLabel = `${items} ${items === 1 ? "item" : "items"}`;

  return (
    <section aria-label="Order summary">
      {/* The phone bar. Hidden from `lg` up, where the rail is always open and
          a control that collapses a permanently visible panel is noise. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-4 py-4 text-left lg:hidden"
      >
        <span className="flex items-center gap-2 text-sm text-ink">
          {open ? "Hide order summary" : "Order summary"}
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-4 w-4 text-accent transition-transform duration-200 ease-brand ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
        <span className="text-lg font-medium tabular-nums text-ink">{formatPrice(cart.total)}</span>
      </button>

      {/* `hidden`/`block` rather than unmounting: the lines are already priced,
          and a panel that re-mounts on every tap would re-run every image. */}
      <div id={panelId} className={`${open ? "block" : "hidden"} pb-6 lg:block lg:pb-0`}>
        <div className="hidden items-baseline justify-between gap-3 lg:flex">
          <h2 className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
            Your order &middot; {itemLabel}
          </h2>
          <Link
            to={CART}
            className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase underline underline-offset-4 transition hover:text-accent"
          >
            Edit bag
          </Link>
        </div>

        <ul className="divide-y divide-line border-b border-line lg:mt-4">
          {cart.lines.map((line) => (
            <CartLineRow
              key={`${line.item.productId}-${line.item.size}`}
              line={line}
              compact
              readOnly
            />
          ))}
        </ul>

        <div className="mt-6">
          <CartSummary cart={cart} compact showActions={false} />
        </div>

        {/* The way back into the bag, on the layout that has no rail heading
            to hang it off. */}
        <Link
          to={CART}
          className="mt-5 block text-center text-[0.625rem] tracking-eyebrow text-ink-muted uppercase underline underline-offset-4 transition hover:text-accent lg:hidden"
        >
          Edit bag
        </Link>
      </div>
    </section>
  );
}
