// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * place-order — the trusted server code that writes an order.
 *
 * This replaces the Firebase `placeOrder` callable function. The storefront is
 * a browser SPA, so it cannot hold a key that bypasses row level security;
 * `orders` has no insert policy for anon at all. Everything that touches money
 * or stock happens behind this function.
 *
 * The split of responsibility is deliberate:
 *
 *   HERE            field validation (requirements section 17), shaping the
 *                   request, and turning database errors into messages a
 *                   customer can act on.
 *
 *   place_order()   the money and the stock, in SQL, in ONE transaction with
 *                   `for update` locks. Reading stock here and writing it back
 *                   would leave a window where two customers both buy the last
 *                   shirt. See the migration for the full reasoning.
 *
 * The client sends product ids, sizes and quantities — nothing else. Prices,
 * the delivery charge and the total are read from the database.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const fail = (code: string, message: string, status = 400) =>
  json({ error: { code, message } }, status);

/* ---------------------------------------------------------------------------
 * Validation — requirements section 17.
 *
 * These rules are the SERVER's own. The storefront applies the same ones for
 * the customer's benefit, but client validation is a convenience and is never
 * the thing that decides whether an order is accepted.
 *
 * THE STOREFRONT'S COPY IS `shared/checkout.ts`, and the two must stay
 * identical — patterns, bounds and messages — or a customer passes the form
 * and is rejected here for a reason the form never mentioned. This file cannot
 * import that one: it is Deno, deployed on its own by the Supabase CLI, which
 * bundles only what is under `supabase/`. So CHANGING A RULE MEANS CHANGING
 * BOTH FILES. See the section 7 notes in `context.md` for the drift check.
 * ------------------------------------------------------------------------ */

const SIZES = ["S", "M", "L"];
const MAX_LINES = 20;
const MAX_QTY = 10;

/** Pakistani mobile: 03XXXXXXXXX, +923XXXXXXXXX, or 00923XXXXXXXXX. */
const PHONE = /^(?:\+92|0092|0)3\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

function validateCustomer(raw: any): { customer: Record<string, string>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const fullName = clean(raw?.fullName);
  const email = clean(raw?.email).toLowerCase();
  // Spaces and dashes are how people actually type a phone number.
  const phone = clean(raw?.phone).replace(/[\s-]/g, "");
  const address = clean(raw?.address);
  const city = clean(raw?.city);
  const postalCode = clean(raw?.postalCode);
  const notes = clean(raw?.notes);

  if (fullName.length < 2 || fullName.length > 80) {
    errors.fullName = "Please enter your full name.";
  }
  if (!EMAIL.test(email) || email.length > 160) {
    errors.email = "Please enter a valid email address.";
  }
  if (!PHONE.test(phone)) {
    errors.phone = "Enter a Pakistani mobile number, for example 03001234567.";
  }
  if (address.length < 10 || address.length > 300) {
    errors.address = "Please enter a complete delivery address.";
  }
  if (city.length < 2 || city.length > 60) {
    errors.city = "Please enter your city.";
  }
  // Optional per requirements section 17 — checked for format only if given.
  if (postalCode && !/^\d{5}$/.test(postalCode)) {
    errors.postalCode = "A Pakistani postal code is 5 digits.";
  }
  if (notes.length > 500) {
    errors.notes = "Please keep the note under 500 characters.";
  }

  return { customer: { fullName, email, phone, address, city, postalCode, notes }, errors };
}

function validateItems(raw: any): { items: any[]; error?: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { items: [], error: "Your bag is empty." };
  }
  if (raw.length > MAX_LINES) {
    return { items: [], error: "That is too many different items for one order." };
  }

  const items: any[] = [];
  for (const entry of raw) {
    const productId = clean(entry?.productId);
    const size = clean(entry?.size);
    const qty = Number(entry?.qty);

    if (!productId || !SIZES.includes(size)) {
      return { items: [], error: "Your bag contains an item we could not read." };
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return { items: [], error: "One of the quantities in your bag is not valid." };
    }
    items.push({ productId, size, qty });
  }

  return { items };
}

/** Turns a raised SQL exception into something a customer can act on. */
function messageForDbError(raw: string): { code: string; message: string } {
  if (raw.includes("OUT_OF_STOCK")) {
    return {
      code: "OUT_OF_STOCK",
      message:
        "Something in your bag sold out while you were checking out. Go back to your bag to see which piece, and remove it to continue.",
    };
  }
  if (raw.includes("PRODUCT_UNAVAILABLE")) {
    return {
      code: "PRODUCT_UNAVAILABLE",
      message:
        "A piece in your bag is no longer available. Go back to your bag to remove it, then try again.",
    };
  }
  if (raw.includes("EMPTY_CART")) {
    return { code: "EMPTY_CART", message: "Your bag is empty." };
  }
  if (raw.includes("BAD_QUANTITY") || raw.includes("TOO_MANY_ITEMS")) {
    return { code: "INVALID_ITEMS", message: "Your bag could not be read. Please refresh and try again." };
  }
  return {
    code: "ORDER_FAILED",
    message: "Your order could not be placed just now. Please try again in a moment.",
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Use POST.", 405);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail("BAD_REQUEST", "Could not read the request.", 400);
  }

  const { items, error: itemsError } = validateItems(body?.items);
  if (itemsError) return fail("INVALID_ITEMS", itemsError);

  const { customer, errors } = validateCustomer(body?.customer);
  if (Object.keys(errors).length > 0) {
    return json({ error: { code: "VALIDATION", message: "Please check the form.", fields: errors } }, 400);
  }

  // The service role key bypasses row level security, which is exactly why it
  // lives here and never in the browser. It is injected by the platform.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  /**
   * A signed-in customer's order is linked to them so they can see it later.
   * A guest's is not, and that is not a failure — checkout without an account
   * is mandatory (requirements section 7). An unreadable token is treated as a
   * guest rather than rejected.
   */
  let userId: string | null = null;
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data } = await supabase.auth.getUser(token);
    userId = data?.user?.id ?? null;
  }

  /**
   * Only items and the customer are forwarded. There is deliberately no
   * payment-method parameter: section 9 allows one method, and `place_order`
   * writes it itself. A `paymentMethod` in the request body is ignored the same
   * way a price is — a browser that could name how an order is paid could
   * declare one paid (section 17).
   */
  const { data, error } = await supabase.rpc("place_order", {
    p_items: items,
    p_customer: customer,
    p_user_id: userId,
  });

  if (error) {
    const mapped = messageForDbError(`${error.message} ${error.details ?? ""} ${error.hint ?? ""}`);
    // Logged server-side so a failure is diagnosable; the customer sees only
    // the mapped message, never the SQL.
    console.error("place_order failed:", error);
    return json({ error: mapped }, mapped.code === "ORDER_FAILED" ? 500 : 409);
  }

  return json(data);
});
