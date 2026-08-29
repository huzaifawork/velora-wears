/**
 * Velora Wears — the payment METHODS (requirements section 9).
 *
 * Section 9 is short and it is a product decision, not a feature: version one
 * takes **cash on delivery and nothing else**, with no online payment
 * integration, and other methods "may be added in the future if required".
 *
 * That future is the whole reason this file exists. "COD only" can be built
 * two ways:
 *
 *   1. say "cash on delivery" wherever the customer needs to read it, and
 *      record nothing — which is where the project was;
 *   2. record on every order HOW it is paid, with exactly one value allowed
 *      today.
 *
 * The first is less code and it is the wrong shape. An order that does not say
 * how it is paid is fine while there is only one answer, and ambiguous forever
 * afterwards: the day a card option is added, every row written before it
 * becomes a guess, and the admin dashboard — which section 8 requires to show
 * every confirmed order for management — has nothing to print but a hardcoded
 * word. Adding the field now costs one column and makes a second method an
 * additive change rather than a data migration over live orders.
 *
 * ---------------------------------------------------------------------------
 * THE PAYMENT METHOD IS NEVER CLIENT INPUT.
 * ---------------------------------------------------------------------------
 * `place_order()` writes `'cod'` itself; `PlaceOrderInput` has no field for it
 * and the Edge Function would ignore one. This mirrors how prices and totals
 * are handled (section 17): a browser that could name its own payment method
 * could mark an order paid. The values below are what the two applications
 * DISPLAY, and the database's `payment_method` enum is what they mean.
 *
 * The copy lives here rather than in the checkout form because three surfaces
 * state it — the form, the confirmation, and the admin dashboard's order list —
 * and they must not drift into describing the same order differently (§18).
 */

/** Mirrors the `public.payment_method` enum in Postgres. Add to both together. */
export type PaymentMethod = "cod";

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cod"];

/**
 * What an order gets when nothing says otherwise. It is also the honest reading
 * of an order record with no method on it: every order placed before the column
 * existed was cash on delivery, because nothing else was ever offered.
 */
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "cod";

export interface PaymentMethodCopy {
  /** The name of the method, sentence case. Used in headings and admin tables. */
  label: string;
  /** One line explaining what the customer is agreeing to, on the form. */
  blurb: string;
  /** How the amount due is labelled once the order exists. */
  amountLabel: string;
  /** What the customer is agreeing to by pressing the button. */
  agreement: string;
  /** Restates the method under the total on the confirmation. */
  confirmation: string;
  /** Whether money changes hands away from the site. Drives "nothing is charged now". */
  offSite: boolean;
}

export const PAYMENT_METHOD_COPY: Record<PaymentMethod, PaymentMethodCopy> = {
  cod: {
    label: "Cash on delivery",
    blurb:
      "Pay the courier in cash when your order arrives. Nothing is charged now, and no card details are ever asked for.",
    amountLabel: "To pay on delivery",
    agreement: "By placing this order you agree to pay the courier in cash on delivery.",
    confirmation:
      "Cash on delivery. This is the amount the courier will collect, and it is the figure our store calculated — not one sent from your browser.",
    offSite: true,
  },
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * The method as something safe to render. Anything unrecognised — an older
 * order, a value a future migration added that this build has not been taught
 * yet — reads as the default rather than blanking the line or throwing.
 */
export function paymentMethodOf(value: unknown): PaymentMethod {
  return isPaymentMethod(value) ? value : DEFAULT_PAYMENT_METHOD;
}

export function paymentMethodCopy(value: unknown): PaymentMethodCopy {
  return PAYMENT_METHOD_COPY[paymentMethodOf(value)];
}
