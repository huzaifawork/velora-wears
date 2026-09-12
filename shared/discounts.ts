/**
 * Velora Wears — DISCOUNTS, and the one rule for pricing a piece that has one.
 *
 * The client asked for two things: a whole category on offer ("every shirt is
 * 10% off"), and one particular piece on offer ("this shirt is half price"),
 * each running for a stated number of days and then stopping by itself.
 *
 * ---------------------------------------------------------------------------
 * WHAT A DISCOUNT IS HERE
 * ---------------------------------------------------------------------------
 * A row that says WHAT it applies to, HOW MUCH it takes off, and WHEN it runs.
 * Nothing else — there is no coupon code to type, no minimum spend, no "three
 * for two". It is what every storefront calls an AUTOMATIC discount: the
 * customer does nothing, the shop window simply shows a lower price and says
 * what the old one was.
 *
 * A coupon code is a different feature with a different shape (per-customer
 * limits, redemption counts, a code a stranger can guess) and it is not this.
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE: THE BEST OFFER WINS, AND OFFERS NEVER STACK
 * ---------------------------------------------------------------------------
 * A single shirt can be caught by four discounts at once — its own, its
 * sub-collection's, its parent category's, and a store-wide one. Something has
 * to decide, and there are only two honest answers:
 *
 *   - **stack them** — 10% off shirts and 50% off this shirt becomes 55% off,
 *     and nobody who set those two numbers up meant that. Two admins each
 *     doing something reasonable is how a shop gives away a piece for nothing;
 *   - **take the lowest resulting price.** One discount applies. The customer
 *     always gets the best of whatever is running, which is what they would
 *     expect if they read the two offers and picked one.
 *
 * The second, and it is what Shopify and WooCommerce do with automatic
 * discounts for the same reason. `bestOffer` below is the whole of it.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS THE DISPLAY SIDE. POSTGRES IS THE AUTHORITY.
 * ---------------------------------------------------------------------------
 * `place_order()` resolves the discount again, in SQL, at the moment of
 * purchase, from these same rules — see
 * `supabase/migrations/20260912000001_discounts.sql`. What a browser shows is
 * never what an order is written from (requirements section 17), so the two
 * implementations exist on purpose and MUST be changed together. The SQL side
 * is marked with the same warning.
 */

/* ---------------------------------------------------------------------------
 * The record
 * ------------------------------------------------------------------------ */

/**
 * What a discount applies to.
 *
 * `category` covers the category AND its subcategories, because that is what
 * browsing a category already means in this shop (`shared/categories.ts`) — an
 * offer on "Shirts" that skipped the Oxford shirts filed under it would be a
 * sale with an invisible hole in it.
 */
export type DiscountScope = "all" | "category" | "product";

/** Percent off, or a flat number of rupees off. Mirrors `public.discount_kind`. */
export type DiscountKind = "percent" | "amount";

/** `discounts/{id}` — an automatic price reduction. Written only by an admin. */
export interface Discount {
  id: string;
  /** The admin's own label — "Winter clearance". Never shown to a customer. */
  name: string;
  scope: DiscountScope;
  /** Set when `scope` is `category`. The category this runs on. */
  categorySlug?: string;
  /** Set when `scope` is `product`. The piece this runs on. */
  productId?: string;
  kind: DiscountKind;
  /** Percent (1–90) or whole rupees off, per `kind`. */
  value: number;
  /** When it starts. Absent means it is already running. */
  startsAt?: number;
  /** When it stops, exclusive. Absent means it runs until switched off. */
  endsAt?: number;
  /** The admin's switch. A discount can be turned off without being deleted. */
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/* ---------------------------------------------------------------------------
 * Bounds — the same numbers the database's CHECK constraints enforce.
 * ------------------------------------------------------------------------ */

/**
 * A percentage has to leave something behind.
 *
 * 90 rather than 99 because a 100% discount is not a sale, it is a pricing
 * accident that gives the catalogue away, and the gap between "half price" and
 * "free" is where a typo lands. An admin who genuinely wants to give a piece
 * away can price it at zero, deliberately, in the product editor.
 */
export const MAX_DISCOUNT_PERCENT = 90;
export const MIN_DISCOUNT_PERCENT = 1;
export const MAX_DISCOUNT_NAME = 80;

/* ---------------------------------------------------------------------------
 * Pricing
 * ------------------------------------------------------------------------ */

/**
 * What one discount does to one price.
 *
 * Money is whole rupees everywhere in this catalogue, so the REDUCTION is
 * rounded — not the resulting price. Rounding the result instead would make
 * "10% off" quietly mean something slightly different at every price point,
 * and a customer who checks the arithmetic on a receipt should find it works.
 *
 * Never below zero, whatever a fixed amount larger than the price would
 * otherwise produce.
 */
export function priceAfter(price: number, kind: DiscountKind, value: number): number {
  const off = kind === "percent" ? Math.round((price * value) / 100) : Math.round(value);
  return Math.max(0, price - off);
}

/**
 * Is this discount running at this instant?
 *
 * The clock is checked on the CLIENT as well as in Postgres, and that is the
 * point: a tab left open past the last day of a sale would otherwise go on
 * advertising it until something happened to refetch. Nothing pushes at an end
 * time — there is no row change to publish — so the browser has to be able to
 * notice on its own.
 */
export function isDiscountLive(discount: Discount, now: number = Date.now()): boolean {
  if (!discount.active) return false;
  if (discount.startsAt !== undefined && now < discount.startsAt) return false;
  if (discount.endsAt !== undefined && now >= discount.endsAt) return false;
  return true;
}

/** Does this discount cover this piece? `categorySlugs` is the category AND its parent. */
export function discountApplies(
  discount: Discount,
  product: { id: string; categorySlugs: readonly string[] },
): boolean {
  switch (discount.scope) {
    case "all":
      return true;
    case "product":
      return discount.productId === product.id;
    case "category":
      return discount.categorySlug !== undefined
        && product.categorySlugs.includes(discount.categorySlug);
    default:
      return false;
  }
}

/**
 * What a customer actually pays, and what it was before.
 *
 * `salePrice` is only ever set when there IS an offer, so `price` stays the one
 * field a surface can render without asking any questions — a card with no
 * offer is unchanged from the day before discounts existed.
 */
export interface Offer {
  /** The price before the discount — the struck-through figure. */
  price: number;
  /** What it costs now. Equal to `price` when nothing is running. */
  salePrice: number;
  /** `price - salePrice`. Zero when nothing is running. */
  saved: number;
  /** Whole percent off, rounded, for the badge. Zero when nothing is running. */
  percent: number;
  /** When the offer stops, if it is dated. Drives "ends in 3 days". */
  endsAt?: number;
}

/** The no-offer answer for a price. The shape every surface renders. */
export function noOffer(price: number): Offer {
  return { price, salePrice: price, saved: 0, percent: 0 };
}

/**
 * The best offer on one piece — see the stacking note at the top of this file.
 *
 * Ties break on the LONGEST-running offer (the one with no end date, or the
 * later one), so a shop running "20% off everything" and "20% off shirts"
 * shows the shirt the one that will still be there tomorrow.
 */
export function bestOffer(
  product: { id: string; price: number; categorySlugs: readonly string[] },
  discounts: readonly Discount[],
  now: number = Date.now(),
): Offer {
  let best: Offer | undefined;

  for (const discount of discounts) {
    if (!isDiscountLive(discount, now)) continue;
    if (!discountApplies(discount, product)) continue;

    const salePrice = priceAfter(product.price, discount.kind, discount.value);
    if (salePrice >= product.price) continue;

    const beats =
      best === undefined
      || salePrice < best.salePrice
      || (salePrice === best.salePrice && outlasts(discount.endsAt, best.endsAt));

    if (beats) {
      best = {
        price: product.price,
        salePrice,
        saved: product.price - salePrice,
        percent: percentOff(product.price, salePrice),
        endsAt: discount.endsAt,
      };
    }
  }

  return best ?? noOffer(product.price);
}

/** Undefined is "never ends", which outlasts every date. */
function outlasts(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined) return true;
  if (b === undefined) return false;
  return a > b;
}

/**
 * `4000 -> 3600` reads as `10`.
 *
 * Rounded, because the badge has room for "10% off" and not for "10.25% off",
 * and a fixed-amount discount almost never lands on a whole percentage.
 */
export function percentOff(price: number, salePrice: number): number {
  if (price <= 0 || salePrice >= price) return 0;
  return Math.round(((price - salePrice) / price) * 100);
}

/**
 * An offer rebuilt from the values Postgres computed and a reader carries —
 * the shape `ProductSummary` stores.
 *
 * This is what every storefront surface renders from, so a card, a product page
 * and a cart line cannot disagree: all three are reading one number the
 * database worked out. The only thing decided here is the CLOCK — an offer
 * whose end time has passed since the page was read is dropped, and the piece
 * goes back to its full price without waiting for a refetch.
 */
export function offerOf(
  priced: { price: number; salePrice?: number; discountEndsAt?: number },
  now: number = Date.now(),
): Offer {
  const { price, salePrice, discountEndsAt } = priced;

  if (salePrice === undefined || salePrice >= price || salePrice < 0) return noOffer(price);
  if (discountEndsAt !== undefined && now >= discountEndsAt) return noOffer(price);

  return {
    price,
    salePrice,
    saved: price - salePrice,
    percent: percentOff(price, salePrice),
    endsAt: discountEndsAt,
  };
}

/** Is anything actually off? The one check a surface makes before rendering a sale. */
export function hasOffer(offer: Offer): boolean {
  return offer.saved > 0;
}

/* ---------------------------------------------------------------------------
 * Words
 * ------------------------------------------------------------------------ */

/**
 * How long an offer has left, in the words a shop uses — "Ends today",
 * "2 days left".
 *
 * Null when it is not dated, which is a sale with nothing to say about time
 * rather than one that runs forever in small print. Hours are spelled out on
 * the last day because "0 days left" reads as over, and the last few hours of
 * a sale are exactly when the line is worth showing.
 */
export function offerEndsIn(endsAt: number | undefined, now: number = Date.now()): string | null {
  if (endsAt === undefined) return null;

  const ms = endsAt - now;
  if (ms <= 0) return null;

  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "Ends within the hour";
  if (hours < 24) return hours === 1 ? "Ends in 1 hour" : `Ends in ${hours} hours`;

  const days = Math.round(hours / 24);
  return days === 1 ? "Ends tomorrow" : `Ends in ${days} days`;
}

/** `10` -> `10% off`, and a fixed amount says the percentage anyway. */
export function offerBadge(offer: Offer): string {
  return `${offer.percent}% off`;
}

/* ---------------------------------------------------------------------------
 * Validation — shared by the admin form and the database's CHECK constraints.
 * ------------------------------------------------------------------------ */

export function isDiscountScope(value: unknown): value is DiscountScope {
  return value === "all" || value === "category" || value === "product";
}

export function isDiscountKind(value: unknown): value is DiscountKind {
  return value === "percent" || value === "amount";
}

/**
 * What is wrong with a discount an admin is trying to save, keyed by field, or
 * an empty object when it is fine. The dashboard renders these against the
 * inputs; the database enforces the same rules as constraints, because a form
 * is a convenience and never the thing that decides what may be stored.
 */
export function validateDiscount(input: {
  name: string;
  scope: DiscountScope;
  categorySlug?: string | null;
  productId?: string | null;
  kind: DiscountKind;
  value: number;
  startsAt?: number | null;
  endsAt?: number | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  const name = input.name.trim();
  if (name.length < 2) errors.name = "Give this discount a name you will recognise later.";
  else if (name.length > MAX_DISCOUNT_NAME) errors.name = `Keep the name under ${MAX_DISCOUNT_NAME} characters.`;

  if (input.scope === "category" && !input.categorySlug) {
    errors.target = "Choose the category this applies to.";
  }
  if (input.scope === "product" && !input.productId) {
    errors.target = "Choose the product this applies to.";
  }

  if (!Number.isFinite(input.value) || input.value <= 0) {
    errors.value = "Enter how much comes off.";
  } else if (input.kind === "percent") {
    if (input.value < MIN_DISCOUNT_PERCENT || input.value > MAX_DISCOUNT_PERCENT) {
      errors.value = `A percentage discount runs from ${MIN_DISCOUNT_PERCENT}% to ${MAX_DISCOUNT_PERCENT}%.`;
    }
  }

  if (input.startsAt != null && input.endsAt != null && input.endsAt <= input.startsAt) {
    errors.endsAt = "The end date has to be after the start date.";
  }

  return errors;
}

/**
 * Where a discount is in its life, for the admin's list.
 *
 * `off` is the switch, and it beats the dates: a discount an admin has turned
 * off is off, whatever its calendar says.
 */
export type DiscountState = "off" | "scheduled" | "live" | "ended";

export function discountState(discount: Discount, now: number = Date.now()): DiscountState {
  if (!discount.active) return "off";
  if (discount.endsAt !== undefined && now >= discount.endsAt) return "ended";
  if (discount.startsAt !== undefined && now < discount.startsAt) return "scheduled";
  return "live";
}
