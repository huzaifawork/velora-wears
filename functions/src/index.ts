import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import type { PlaceOrderInput, PlaceOrderResult } from "../../shared/types";

/**
 * Trusted server-side code. This is the ONLY place allowed to write orders.
 *
 * The storefront is a browser SPA and therefore cannot hold the Admin SDK key,
 * and database rules deny all client writes to `orders`. Everything that
 * involves money or stock happens here.
 *
 * Requirements section 17 obligations that MUST be met in placeOrder:
 *   - revalidate every required field server-side (name, email, phone, address, city)
 *   - recompute subtotal, delivery charge, and total from stored data
 *     — never trust any amount sent by the browser
 *   - re-check per-size stock at the moment of confirmation and decrement it
 *     atomically, so an item that sold out mid-checkout cannot be ordered
 *   - rate limit to prevent order spam
 */

initializeApp();

const REGION = "asia-southeast1";

export const placeOrder = onCall<PlaceOrderInput, Promise<PlaceOrderResult>>(
  { region: REGION },
  async () => {
    // Intentionally not implemented — this is the scaffold.
    // Implementation is build step 4 (checkout). See context.md.
    //
    // Outline:
    //   1. validate(request.data.customer)              -> section 17 rules
    //   2. load each product server-side by productId   -> authoritative prices
    //   3. verify per-size stock for every line item    -> section 11
    //   4. subtotal = sum(unitPrice * qty)              -> computed here, not sent
    //   5. deliveryCharge = settings/deliveryCharge     -> section 10
    //   6. runTransaction: decrement stock + write order atomically
    //   7. return orderId, orderNumber, reviewToken, total
    throw new HttpsError("unimplemented", "placeOrder is not implemented yet.");
  },
);

/** Exposed so the scaffold has a verifiable database handle. */
export const _db = () => getDatabase();
