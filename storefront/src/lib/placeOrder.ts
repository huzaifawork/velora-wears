import type { PlaceOrderInput, PlaceOrderResult } from "@shared/types";
import type { CheckoutErrors } from "@shared/checkout";

/**
 * The call that places an order (requirements section 7).
 *
 * It posts to the `place-order` Edge Function, which is the ONLY way an order
 * is ever written. The browser cannot write one itself: `orders` has no insert
 * policy for anon at all, and the key that could bypass that lives server-side
 * in the function. So this module is deliberately thin — it shapes a request,
 * and turns whatever comes back into either a result or a typed error. Every
 * decision about prices, delivery and stock is made behind it (section 17).
 *
 * **It uses `fetch`, not the Supabase SDK, on purpose.** `functions.invoke`
 * would do the same job, but it would also pull the SDK into the bundle for
 * every visitor who reaches checkout — and in demo mode the SDK is otherwise
 * never downloaded at all (see `lib/queries.ts`). The function is deployed with
 * `--no-verify-jwt`, because guest checkout must work without a session, so a
 * plain POST with the public anon key is all it needs.
 *
 * **No Authorization header is sent.** The function reads one only to link an
 * order to a signed-in customer; sending the anon key there would make it spend
 * a round trip looking up a user that cannot exist. A guest order is the normal
 * case, not a failure (section 7). When sign-in arrives, pass the session's
 * access token through `accessToken` and the order is linked.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Nothing here is retried automatically. A retried POST that timed out on the
 * way back places a second order, and an order is not a safe thing to guess
 * about — the customer is told what happened and decides.
 */
const TIMEOUT_MS = 20_000;

/**
 * The codes the Edge Function returns, plus the two this module raises on its
 * own when the request never got there.
 */
export type PlaceOrderErrorCode =
  | "VALIDATION"
  | "INVALID_ITEMS"
  | "OUT_OF_STOCK"
  | "PRODUCT_UNAVAILABLE"
  | "EMPTY_CART"
  | "ORDER_FAILED"
  | "BAD_REQUEST"
  | "NOT_CONFIGURED"
  | "NETWORK";

export class PlaceOrderError extends Error {
  readonly code: PlaceOrderErrorCode;
  /**
   * Set only on `VALIDATION`, and keyed by checkout field name so the form can
   * mark the offending inputs rather than showing one message at the top. The
   * server is the authority on validity; this is how it says which field.
   */
  readonly fields?: CheckoutErrors;

  constructor(code: PlaceOrderErrorCode, message: string, fields?: CheckoutErrors) {
    super(message);
    this.name = "PlaceOrderError";
    this.code = code;
    this.fields = fields;
  }
}

/** True when the bag itself is at fault, so the customer belongs back in it. */
export function isBagProblem(error: unknown): boolean {
  return (
    error instanceof PlaceOrderError &&
    (error.code === "OUT_OF_STOCK" ||
      error.code === "PRODUCT_UNAVAILABLE" ||
      error.code === "EMPTY_CART" ||
      error.code === "INVALID_ITEMS")
  );
}

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: CheckoutErrors };
}

const KNOWN_CODES: readonly string[] = [
  "VALIDATION",
  "INVALID_ITEMS",
  "OUT_OF_STOCK",
  "PRODUCT_UNAVAILABLE",
  "EMPTY_CART",
  "ORDER_FAILED",
  "BAD_REQUEST",
];

export async function placeOrder(
  input: PlaceOrderInput,
  /** A signed-in customer's access token, when there is one. Guests send nothing. */
  accessToken?: string,
): Promise<PlaceOrderResult> {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new PlaceOrderError(
      "NOT_CONFIGURED",
      "Checkout is not configured on this deployment. Please contact us to place your order.",
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/place-order`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // A dropped connection, a blocked request, or the timeout above. The order
    // may or may not have been written, so the message must not promise either.
    throw new PlaceOrderError(
      "NETWORK",
      "We could not reach the store to place your order. Check your connection and try again — nothing has been charged.",
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const raw = (body as ErrorBody | undefined)?.error;
    const code =
      raw?.code && KNOWN_CODES.includes(raw.code) ? (raw.code as PlaceOrderErrorCode) : "ORDER_FAILED";

    throw new PlaceOrderError(
      code,
      raw?.message ?? "Your order could not be placed just now. Please try again in a moment.",
      raw?.fields,
    );
  }

  const result = body as Partial<PlaceOrderResult> | undefined;

  // A 200 with a body we cannot read is not a success we can show anyone — the
  // confirmation page needs the order number to be worth anything.
  if (!result?.orderId || !result.orderNumber || typeof result.total !== "number") {
    throw new PlaceOrderError(
      "ORDER_FAILED",
      "Your order was sent but we did not get a confirmation back. Please contact us before trying again, so you are not charged twice.",
    );
  }

  return {
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    reviewToken: result.reviewToken ?? "",
    total: result.total,
  };
}
