import type { PlaceOrderInput, PlaceOrderResult } from "@shared/types";
import { DEFAULT_PAYMENT_METHOD, paymentMethodOf } from "@shared/payment";
import type { CheckoutErrors } from "@shared/checkout";
import { isLiveSource } from "@/lib/queries";

/**
 * The call that places an order (requirements section 7).
 *
 * It posts to the `place-order` Edge Function, which is the ONLY way a REAL
 * order is ever written. The browser cannot write one itself: `orders` has no
 * insert policy for anon at all, and the key that could bypass that lives
 * server-side in the function. So this module is deliberately thin — it shapes
 * a request, and turns whatever comes back into either a result or a typed
 * error. Every decision about prices, delivery and stock is made behind it
 * (section 17).
 *
 * **In demo mode there is no real backend to shape that request for**, and
 * checkout was unable to complete at all until this existed — the demo
 * catalog's product ids do not exist in Postgres, so `place_order()` refused
 * every order (see `DemoNotice` on `CheckoutPage`, and the long-standing note
 * in `context.md`). `placeDemoOrder` below is the fix: while
 * `VITE_DATA_SOURCE` is `demo`, `placeOrder` never reaches the network at all
 * and instead builds a `PlaceOrderResult` locally, using the SAME totals
 * `useCartContents`/`lib/cart.ts` already computed and showed the customer —
 * nothing is re-priced here, on purpose (`buildCart` stays the one place the
 * bag is priced). The result is handed to `saveReceipt` exactly as a real one
 * would be, so `/order/confirmed` cannot tell the difference. **What a demo
 * order genuinely is NOT**: written to Supabase, subtracted from demo stock,
 * or visible in a signed-in customer's order history (`lib/myOrders.ts` reads
 * only the real database) — it exists solely in this browser tab's
 * `sessionStorage` receipt, the same as the real flow's, and disappears when
 * that does. The order number is prefixed `DEMO-` so it can never be mistaken
 * for one that exists anywhere else.
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
  | "RATE_LIMITED"
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
  "RATE_LIMITED",
];

/** The totals `buildCart` already computed — never re-derived here. */
export interface DemoOrderTotals {
  subtotal: number;
  deliveryCharge: number;
  total: number;
}

/** A short, unmistakably-fake stand-in for `place_order()`'s own `VW-YYMMDD-XXXXX` shape. */
function demoOrderNumber(): string {
  const day = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const tail = crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase();
  return `DEMO-VW-${day}-${tail}`;
}

/**
 * Simulates a successful order entirely in the browser — see this file's own
 * notes above for exactly what that does and does not mean. `qty` is trusted
 * here the way it never would be for a real order, because there is no
 * database on the other end for a manipulated value to defraud; the only
 * thing it can affect is what this tab's own confirmation page prints back.
 */
function placeDemoOrder(input: PlaceOrderInput, totals: DemoOrderTotals): PlaceOrderResult {
  if (input.items.length === 0) {
    throw new PlaceOrderError("EMPTY_CART", "Your bag is empty.");
  }

  return {
    orderId: crypto.randomUUID(),
    orderNumber: demoOrderNumber(),
    reviewToken: crypto.randomUUID(),
    total: totals.total,
    paymentMethod: DEFAULT_PAYMENT_METHOD,
  };
}

export async function placeOrder(
  input: PlaceOrderInput,
  /** A signed-in customer's access token, when there is one. Guests send nothing. */
  accessToken?: string,
  /**
   * Required while `VITE_DATA_SOURCE` is `demo`, ignored otherwise — the live
   * path never prices an order from the browser (section 17). Pass
   * `useCartContents`'s own `subtotal`/`deliveryCharge`/`total`.
   */
  demoTotals?: DemoOrderTotals,
): Promise<PlaceOrderResult> {
  if (!isLiveSource()) {
    if (!demoTotals) {
      throw new PlaceOrderError("ORDER_FAILED", "Your order could not be placed just now.");
    }
    // A brief, deliberate delay so the submit button's loading state reads as
    // real work happening rather than flipping instantly — the one concession
    // to realism in an otherwise honest simulation.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return placeDemoOrder(input, demoTotals);
  }

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
    /**
     * The method the STORE recorded, not one this file assumed. It is missing
     * only from an order placed against a database that predates the column, and
     * `paymentMethodOf` reads that as cash on delivery — which it was, because
     * nothing else has ever been offered (section 9).
     */
    paymentMethod: paymentMethodOf(result.paymentMethod),
  };
}
