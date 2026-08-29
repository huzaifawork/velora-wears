import { Link } from "react-router-dom";

import { Button, buttonClasses } from "@/components/ui/Button";
import { useCart } from "@/features/cart/CartContext";
import { formatPrice } from "@/lib/format";
import { CHECKOUT, PRODUCTS } from "@/lib/routes";
import type { CartTotals } from "@/lib/cart";

/**
 * The money (requirements section 6 — the cart must show the total order
 * amount) and the way out of the bag.
 *
 * Subtotal, delivery and total are shown separately because a single figure
 * hides where the delivery charge went; requirements section 10 wants that
 * charge visible and included, and it is admin-configured, so it is read from
 * settings rather than written into the markup.
 *
 * **Checkout is blocked while anything in the bag cannot be fulfilled.** That
 * is section 11: an unavailable option must not be purchasable. Rather than
 * leaving the visitor to work out which line is at fault, there is one control
 * that clears them all.
 *
 * Every figure here is display only. The `place-order` Edge Function recomputes
 * the order total from stored prices and the admin-configured delivery charge
 * (section 17); nothing on this screen is ever what an order is written from.
 *
 * Checkout renders the same component with `showActions` off: it needs the
 * identical breakdown beside its form, but the way out of it is the confirm
 * button on the form, not a second link to itself.
 */
export function CartSummary({
  cart,
  /** The drawer wants the same numbers without the surrounding card. */
  compact = false,
  onNavigate,
  showActions = true,
}: {
  cart: CartTotals;
  compact?: boolean;
  /** Lets the drawer close itself when a link inside is followed. */
  onNavigate?: () => void;
  /** Off on checkout, where the form owns the way forward. */
  showActions?: boolean;
}) {
  const { removeMany } = useCart();
  const { subtotal, deliveryCharge, total, hasProblems, freeDeliveryRemaining } = cart;

  const blocked = hasProblems || subtotal === 0;
  const unfulfillable = cart.lines.filter((line) => line.problem !== undefined).map((l) => l.item);

  const row = "flex items-baseline justify-between gap-4 text-sm";

  return (
    <div className={compact ? "" : "rounded-sm border border-line bg-canvas-alt p-6 sm:p-7"}>
      {!compact && (
        <h2 className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">Order summary</h2>
      )}

      <dl className={`flex flex-col gap-3 ${compact ? "" : "mt-6"}`}>
        <div className={row}>
          <dt className="text-ink-soft">Subtotal</dt>
          <dd className="font-medium tabular-nums text-ink">{formatPrice(subtotal)}</dd>
        </div>
        <div className={row}>
          <dt className="text-ink-soft">Delivery</dt>
          <dd className="font-medium tabular-nums text-ink">
            {subtotal === 0 ? (
              <span className="text-ink-muted">&mdash;</span>
            ) : deliveryCharge === 0 ? (
              <span className="text-success">Free</span>
            ) : (
              formatPrice(deliveryCharge)
            )}
          </dd>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-line pt-4">
          <dt className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">Total</dt>
          <dd className="text-xl font-medium tabular-nums text-ink">{formatPrice(total)}</dd>
        </div>
      </dl>

      {/* A nudge only when it is actually achievable — never on an empty bag. */}
      {freeDeliveryRemaining !== null && freeDeliveryRemaining > 0 && (
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          Add {formatPrice(freeDeliveryRemaining)} more for free delivery.
        </p>
      )}

      {hasProblems && (
        <div className="mt-5 rounded-sm border border-danger/30 bg-danger/5 p-4">
          <p className="text-xs leading-relaxed text-danger">
            Some pieces in your bag have sold out or been retired since you added them, and are
            not included in the total.
          </p>
          <button
            type="button"
            onClick={() => removeMany(unfulfillable)}
            className="mt-3 text-[0.625rem] tracking-eyebrow text-danger uppercase underline underline-offset-4 transition hover:text-ink"
          >
            Remove them and continue
          </button>
        </div>
      )}

      {showActions && (
        <div className="mt-6 flex flex-col gap-3">
          {/* A disabled `Button` rather than a `Link`: an anchor cannot be
              disabled, and section 11 requires that an unavailable option
              genuinely cannot be taken to checkout. */}
          {blocked ? (
            <Button size="lg" disabled className="w-full">
              Proceed to checkout
            </Button>
          ) : (
            <Link
              to={CHECKOUT}
              onClick={onNavigate}
              className={buttonClasses({ size: "lg", className: "w-full" })}
            >
              Proceed to checkout
            </Link>
          )}

          <Link
            to={PRODUCTS}
            onClick={onNavigate}
            className={buttonClasses({ variant: "secondary", className: "w-full" })}
          >
            Continue shopping
          </Link>
        </div>
      )}

      <p className="mt-5 text-center text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
        Cash on delivery &middot; Nationwide
      </p>
    </div>
  );
}
