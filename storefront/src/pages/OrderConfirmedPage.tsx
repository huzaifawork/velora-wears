import { Link } from "react-router-dom";

import { Container } from "@/components/layout/Container";
import { Image } from "@/components/ui/Image";
import { buttonClasses } from "@/components/ui/Button";
import { formatPrice } from "@/lib/format";
import { readReceipt, receiptSubtotal } from "@/lib/orderReceipt";
import { CART, HOME, PRODUCTS, productPath } from "@/lib/routes";
import { SIZE_LABELS } from "@/lib/sizes";
import { paymentMethodCopy } from "@shared/payment";

/**
 * The order success page (requirements section 7 — "an order confirmation
 * message or success page should be displayed to the customer").
 *
 * **Requirements section 12's animation is not here yet.** That is its own
 * section and its own review, and it is built on top of this page rather than
 * instead of it: the packing-and-loading sequence replaces the mark at the top,
 * and everything below it — the number, the pieces, the total, what happens
 * next — is what the animation is confirming and stays exactly as it is.
 *
 * **It reads from `lib/orderReceipt`, not from the database.** The storefront
 * cannot read an order back: `orders` holds the customer's name, phone and
 * address, and row level security makes it invisible to the anon key (section
 * 17). The response to `place-order` is the only time the browser ever sees
 * this order, so the receipt is kept in `sessionStorage` — which also means a
 * refresh still works, and a tab opened tomorrow correctly knows nothing.
 *
 * **No email is promised.** There is no mail service on this project, so the
 * page does not say a confirmation has been sent; it says to keep the order
 * number, which is the thing that is actually true.
 */
export function OrderConfirmedPage() {
  const receipt = readReceipt();

  if (!receipt) return <NoReceipt />;

  const subtotal = receiptSubtotal(receipt);
  const delivery = receipt.total - subtotal;
  /**
   * The total is the SERVER's figure and is shown as it came back. The
   * breakdown is derived from it, so it is only shown when the arithmetic
   * actually reconciles — a price that moved between the bag being priced and
   * the order being written would otherwise print a subtotal and a delivery
   * charge that do not add up to the total underneath them.
   */
  const breakdownAdvisable = delivery >= 0 && subtotal > 0;
  /**
   * How the order is paid, as the STORE recorded it, not as this page assumed
   * (section 9). Version one has one method, so today this always resolves to
   * cash on delivery — the point is that the page reads the order rather than
   * hardcoding a sentence that would quietly become wrong.
   */
  const payment = paymentMethodCopy(receipt.paymentMethod);

  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <div className="text-center">
          <ConfirmationMark />

          <p className="mt-8 text-[0.625rem] tracking-eyebrow text-accent uppercase">
            Order confirmed
          </p>
          <h1 className="mt-5 text-3xl leading-tight text-balance sm:text-4xl">
            Thank you — your order is placed.
          </h1>
          <p className="mx-auto mt-5 max-w-prose leading-relaxed text-ink-soft">
            We are preparing it now. Our team will call you on the number you gave to confirm
            delivery to {receipt.city}, and you pay the courier in cash when it arrives.
          </p>

          <div className="mt-8 inline-flex flex-col items-center rounded-sm border border-line bg-canvas-alt px-8 py-5">
            <span className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
              Your order number
            </span>
            {/* Selectable and monospaced-by-tracking: this is the one thing on
                the page the customer may need to read out or copy. */}
            <strong className="mt-2 font-display text-2xl tracking-wide text-ink select-all">
              {receipt.orderNumber}
            </strong>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-ink-soft">
            Keep this number — it is how we find your order if you get in touch. Your details are
            filed under {receipt.email}.
          </p>
        </div>

        <section aria-labelledby="ordered-heading" className="mt-14">
          <h2
            id="ordered-heading"
            className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase"
          >
            What you ordered
          </h2>

          <ul className="mt-5 divide-y divide-line border-y border-line">
            {receipt.lines.map((line) => (
              <li key={`${line.slug}-${line.size}`} className="flex items-center gap-4 py-4">
                <div className="w-16 shrink-0 overflow-hidden rounded-sm bg-canvas-deep">
                  {line.thumb ? (
                    <Image
                      src={line.thumb}
                      alt={line.name}
                      width={600}
                      height={800}
                      className="aspect-3/4 w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-3/4 w-full" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    to={productPath(line.slug)}
                    className="font-display text-base leading-snug text-ink transition hover:text-accent"
                  >
                    {line.name}
                  </Link>
                  <p className="mt-1 text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
                    Size {SIZE_LABELS[line.size]} &middot; Quantity {line.qty}
                  </p>
                </div>

                <p className="shrink-0 text-sm font-medium tabular-nums text-ink">
                  {formatPrice(line.unitPrice * line.qty)}
                </p>
              </li>
            ))}
          </ul>

          <dl className="mt-6 flex flex-col gap-3">
            {breakdownAdvisable && (
              <>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <dt className="text-ink-soft">Subtotal</dt>
                  <dd className="font-medium tabular-nums text-ink">{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <dt className="text-ink-soft">Delivery</dt>
                  <dd className="font-medium tabular-nums text-ink">
                    {delivery === 0 ? (
                      <span className="text-success">Free</span>
                    ) : (
                      formatPrice(delivery)
                    )}
                  </dd>
                </div>
              </>
            )}

            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
              <dt className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
                {payment.amountLabel}
              </dt>
              <dd className="text-xl font-medium tabular-nums text-ink">
                {formatPrice(receipt.total)}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-ink-soft">{payment.confirmation}</p>
        </section>

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link to={PRODUCTS} className={buttonClasses({ size: "lg" })}>
            Continue shopping
          </Link>
          <Link to={HOME} className={buttonClasses({ variant: "secondary", size: "lg" })}>
            Back to home
          </Link>
        </div>
      </div>
    </Container>
  );
}

/**
 * A stroked circle and tick that draw themselves in. It is a mark, not
 * section 12's animation — that one has a package, a truck and a loading
 * sequence, and it replaces this. Both `stroke-dasharray` animations are
 * turned off by the reduced-motion rule in `index.css`, which leaves the tick
 * fully drawn rather than half of one.
 */
function ConfirmationMark() {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Order confirmed"
      className="mx-auto h-20 w-20 text-accent"
    >
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.45"
      />
      <path
        d="M20 33.5 L28.5 42 L45 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Reached by opening the URL directly, or after the tab that placed the order
 * was closed. There is nothing to look up — see the note on the page above — so
 * it says so plainly rather than pretending an order failed.
 */
function NoReceipt() {
  return (
    <Container className="flex flex-col items-center py-28 text-center sm:py-36">
      <h1 className="max-w-xl text-3xl leading-tight text-balance sm:text-4xl">
        There is no recent order to show here.
      </h1>
      <p className="mt-5 max-w-prose leading-relaxed text-ink-soft">
        This page shows an order for as long as the tab you placed it in stays open. If you have
        already ordered, your confirmation number was shown at the time — get in touch with it and
        we will find your order. Nothing has gone wrong.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link to={PRODUCTS} className={buttonClasses({ size: "lg" })}>
          Shop the collection
        </Link>
        <Link to={CART} className={buttonClasses({ variant: "secondary", size: "lg" })}>
          View your bag
        </Link>
      </div>
    </Container>
  );
}
