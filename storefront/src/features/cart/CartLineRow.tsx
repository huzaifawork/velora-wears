import { Link } from "react-router-dom";

import { Image } from "@/components/ui/Image";
import { QuantityStepper } from "@/features/cart/QuantityStepper";
import { useCart } from "@/features/cart/CartContext";
import { formatPrice } from "@/lib/format";
import { productPath } from "@/lib/routes";
import { sizeLabel } from "@/lib/sizes";
import type { CartLine } from "@/lib/cart";

/**
 * One line of the bag: image, name, size, quantity, price and a remove control
 * — every field requirements section 6 asks the cart to display.
 *
 * Written once and rendered by the drawer, the cart page and the checkout
 * review, with `compact` changing the density and `readOnly` dropping the
 * controls (section 18). The surfaces showing a line differently is how a mini
 * bag and a full bag start disagreeing about what is in them.
 *
 * `readOnly` is what checkout uses. Editing the bag belongs in the bag — a
 * quantity stepper next to the confirm button invites a change that silently
 * moves the total the customer is about to agree to.
 *
 * A line that cannot be fulfilled says so in place and is priced at zero by
 * `buildCart`, so the total never includes something the visitor cannot
 * actually buy (section 11).
 */

const LINE_IMAGE = { width: 600, height: 800 } as const;

/**
 * How this line's size is worded.
 *
 * Read off the RESOLVED product, because the wording depends on that product's
 * size scale — the bag stores only the code, and "42" is "EU 42" on a sneaker
 * and a 42 inch waist on a trouser. A line whose product has been deleted has
 * no scale to ask, and falls back to the bare code rather than guessing.
 */
function labelFor(line: CartLine): string {
  return sizeLabel(line.product?.sizeScale, line.item.size);
}

/** What is wrong with this line, in the words a customer would use. */
function problemMessage(line: CartLine): string | null {
  switch (line.problem) {
    case "gone":
      return "This piece is no longer available and has to be removed before checkout.";
    case "sold-out":
      return `${labelFor(line)} has sold out since you added it. Remove it, or choose another size on the product page.`;
    case "reduced":
      return `Only ${line.available} left in ${labelFor(line)}. Reduce the quantity to continue.`;
    default:
      return null;
  }
}

export function CartLineRow({
  line,
  compact = false,
  readOnly = false,
}: {
  line: CartLine;
  /** The drawer's tighter layout. Same content, less room. */
  compact?: boolean;
  /** Checkout's review of the bag: the same line, without the controls. */
  readOnly?: boolean;
}) {
  const { setQty, remove } = useCart();
  const { item, product, unitPrice, available, problem } = line;

  const name = product?.name ?? "This piece";
  const sizeText = labelFor(line);
  const label = `${name}, ${sizeText}`;
  const thumb = product?.images[0]?.thumb;
  const message = problemMessage(line);
  const unavailable = problem === "gone" || problem === "sold-out";

  return (
    <li className={`flex gap-4 ${compact ? "py-4" : "py-6"}`}>
      <div className={`shrink-0 overflow-hidden rounded-sm bg-canvas-deep ${compact ? "w-20" : "w-24 sm:w-28"}`}>
        {thumb ? (
          <Link to={productPath(item.slug)} tabIndex={-1} aria-hidden="true">
            <Image
              src={thumb}
              alt={name}
              width={LINE_IMAGE.width}
              height={LINE_IMAGE.height}
              className={`aspect-3/4 w-full object-cover ${unavailable ? "opacity-50 saturate-50" : ""}`}
            />
          </Link>
        ) : (
          <div className="aspect-3/4 w-full" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {product ? (
              <Link
                to={productPath(item.slug)}
                className={`${compact ? "text-base" : "text-lg"} font-display leading-snug text-ink transition hover:text-accent`}
              >
                {name}
              </Link>
            ) : (
              <p className={`${compact ? "text-base" : "text-lg"} font-display leading-snug text-ink-soft`}>
                {name}
              </p>
            )}
            <p className="mt-1 text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
              Size {sizeText}
            </p>
          </div>

          {/* The line total, or the unit price when there is nothing to total. */}
          <p className="shrink-0 text-sm font-medium tabular-nums text-ink">
            {unavailable ? <span className="text-ink-muted">&mdash;</span> : formatPrice(line.lineTotal)}
          </p>
        </div>

        {!unavailable && item.qty > 1 && (
          <p className="text-xs text-ink-muted">{formatPrice(unitPrice)} each</p>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          {unavailable ? (
            <span className="text-[0.625rem] tracking-eyebrow text-danger uppercase">
              Unavailable
            </span>
          ) : readOnly ? (
            <span className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
              Quantity {item.qty}
            </span>
          ) : (
            <QuantityStepper
              qty={item.qty}
              max={available}
              label={label}
              onChange={(next) => setQty(item, next, available)}
            />
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(item)}
              className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase transition hover:text-danger"
            >
              Remove<span className="sr-only"> {label} from the bag</span>
            </button>
          )}
        </div>

        {message && (
          <p className={`mt-1 text-xs leading-relaxed ${unavailable ? "text-danger" : "text-warning"}`}>
            {message}
          </p>
        )}
      </div>
    </li>
  );
}
