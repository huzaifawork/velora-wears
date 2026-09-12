import { hasOffer, offerBadge, offerEndsIn, type Offer } from "@shared/discounts";
import { formatPrice } from "@/lib/format";

/**
 * A price, and what it was before — the ONE component that renders money to a
 * customer (requirements section 18).
 *
 * Every surface that shows what a piece costs goes through here: the card, the
 * product page, a cart line, the checkout review. That is the whole reason it
 * exists. A discount is the sort of feature that gets added to the product page
 * and then quietly missed on the drawer, and a bag that disagrees with the page
 * it was filled from is how a shop loses an argument with a customer.
 *
 * With nothing on offer it renders exactly one figure and nothing else, so a
 * shop running no discounts looks precisely as it did before any of this
 * existed.
 *
 * ---------------------------------------------------------------------------
 * HOW A SALE PRICE IS READ ALOUD
 * ---------------------------------------------------------------------------
 * Struck-through text is a visual convention and a screen reader does not
 * observe it — "Rs 6,000 Rs 3,000" read out in order says the piece costs six
 * thousand and then three thousand, which is nonsense. So the old price carries
 * a `<s>` for sighted readers AND a visually hidden "was", and the whole block
 * is ordered new-price-first for everyone.
 *
 * The sale figure stays in `text-ink`, the same weight and colour an ordinary
 * price has. Gold on white is about 3:1 — fine for an eyebrow, not for the
 * number a customer is deciding on — so the accent does the SIGNALLING (the
 * percentage, the struck original beside it) and the price itself stays
 * readable. Nothing here shouts in red; this shop does not.
 */
export function Price({
  offer,
  size = "md",
  /** Show "Ends in 3 days" under the figure. The product page wants it; a card does not. */
  showDeadline = false,
  className = "",
}: {
  offer: Offer;
  size?: "sm" | "md" | "lg";
  showDeadline?: boolean;
  className?: string;
}) {
  const scale = {
    sm: { now: "text-sm", was: "text-xs" },
    md: { now: "text-base font-medium", was: "text-sm" },
    lg: { now: "text-2xl font-medium", was: "text-base" },
  }[size];

  if (!hasOffer(offer)) {
    return (
      <span className={`tabular-nums text-ink ${scale.now} ${className}`}>
        {formatPrice(offer.price)}
      </span>
    );
  }

  const deadline = showDeadline ? offerEndsIn(offer.endsAt) : null;

  return (
    <span className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${className}`}>
      <span className={`tabular-nums text-ink ${scale.now}`}>
        {formatPrice(offer.salePrice)}
      </span>

      <s className={`tabular-nums text-ink-muted ${scale.was}`}>
        <span className="sr-only">was </span>
        {formatPrice(offer.price)}
      </s>

      <span className={`tracking-eyebrow text-accent uppercase ${size === "sm" ? "text-[0.5625rem]" : "text-[0.625rem]"}`}>
        {offerBadge(offer)}
      </span>

      {deadline && (
        <span className="w-full text-xs text-ink-soft">{deadline}</span>
      )}
    </span>
  );
}

/**
 * The corner flag on a product card — "−20%" over the photograph.
 *
 * Separate from `Price` because it sits somewhere else in the layout: the badge
 * belongs on the image, where a shopper scanning a grid sees it without reading
 * any figures, and the prices belong under the name. Both come off the same
 * `Offer`, so they cannot say different things.
 */
export function SaleBadge({ offer }: { offer: Offer }) {
  if (!hasOffer(offer)) return null;

  return (
    <span className="rounded-sm bg-accent px-2 py-1 text-[0.625rem] leading-none font-medium tracking-eyebrow text-ink uppercase">
      &minus;{offer.percent}%<span className="sr-only"> off</span>
    </span>
  );
}

/**
 * "You saved Rs 1,200" — the one line a summary adds when anything in it was
 * discounted. Renders nothing at all when the figure is zero, so a bag with no
 * offers in it keeps the breakdown it has always had.
 */
export function Saved({ amount, className = "" }: { amount: number; className?: string }) {
  if (amount <= 0) return null;

  return (
    <span className={`tabular-nums text-success ${className}`}>
      &minus;{formatPrice(amount)}
    </span>
  );
}
