// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rateLimited } from "../_shared/rateLimit.ts";

/**
 * submit-review — the trusted server code that writes, edits or removes a
 * review (requirements section 16).
 *
 * Mirrors `place-order`'s split of responsibility exactly:
 *
 *   HERE              field validation (section 17), and — the part that
 *                     makes this function exist at all — proving the
 *                     reviewer actually bought the product before writing
 *                     anything.
 *   Postgres           the unique(order_id, product_id) constraint, so two
 *                      concurrent requests for the same order+product cannot
 *                      both insert.
 *
 * A review is never trusted from the browser any more than a price is
 * (section 17): the client sends a product id, a rating, a comment and a
 * name — never a "verified" flag, never someone else's order id without
 * proof of ownership. Ownership is established ONE of three ways, resolved
 * entirely server-side:
 *
 *   1. Authorization header  -> the signed-in customer's own orders, found
 *                               by user_id (mirrors `orders`' own RLS
 *                               policy, just run here instead of by RLS
 *                               because the write itself needs service role
 *                               regardless).
 *   2. orderId + reviewToken -> the guest, same-session path: the token
 *                               `place-order` handed back and the
 *                               storefront kept in `sessionStorage`
 *                               (`lib/orderReceipt.ts`).
 *   3. orderNumber + email   -> the guest, "later" path section 16 asks
 *                               for. Independently re-verified here even
 *                               though the client is expected to have
 *                               already called `find_order_for_review` —
 *                               an orderId is never taken on the client's
 *                               word alone.
 *
 * Every one of those three paths additionally requires the order to be
 * DELIVERED. Buying a piece is not the thing a review is about — wearing it
 * is — so an order that is pending, confirmed or still with the courier
 * cannot be reviewed yet, and one that was cancelled never can. The
 * storefront hides the form in those cases; THIS is what enforces it, because
 * the storefront's copy of a rule is a courtesy and the server's is the rule
 * (see `REVIEWABLE_STATUS` below).
 *
 * `reviews` has NO insert/update/delete policy for anon or authenticated —
 * on purpose, the same reasoning as `orders` having no insert policy at all.
 * Everything here runs with the service role key, which bypasses RLS.
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
 * Validation — requirements section 17. THE STOREFRONT'S COPY IS
 * `shared/reviews.ts`; this file cannot import it (Deno, bundled on its own
 * by the Supabase CLI) so the same bounds are inlined. CHANGING A RULE MEANS
 * CHANGING BOTH FILES.
 * ------------------------------------------------------------------------ */

/**
 * The one status an order may be in for its items to be reviewable.
 *
 * Mirrored in the storefront (`shared/reviews.ts` — `REVIEWABLE_ORDER_STATUS`)
 * and in `find_order_for_review`'s SQL. Deno cannot import from `shared/`, so
 * this is inlined for the same reason every other shared rule in this file is:
 * CHANGING THE RULE MEANS CHANGING ALL THREE.
 */
const REVIEWABLE_STATUS = "delivered";

/** Said the same way on every path, so a refusal never reveals WHICH order
 *  exists — only that nothing reviewable was found. */
const NOT_DELIVERED_MESSAGE =
  "You can review this piece once your order has been delivered.";

const COMMENT_MIN = 4;
const COMMENT_MAX = 1000;
const NAME_MIN = 2;
const NAME_MAX = 60;
const EDIT_WINDOW_DAYS = 30;

/**
 * Control characters and invisible Unicode stripped before anything is
 * stored (requirements section 17) — same pattern as `place-order` and
 * `shared/sanitize.ts`, inlined here for the same reason every other shared
 * rule is: Deno cannot import from `shared/`.
 */
const UNSAFE_CHARS = new RegExp(
  "[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F-\\x9F\\u200B-\\u200F\\uFEFF]",
  "g",
);

const clean = (value: unknown): string =>
  typeof value === "string" ? value.replace(UNSAFE_CHARS, "").trim().replace(/\s+/g, " ") : "";

function validateDraft(raw: any): { draft?: { rating: number; comment: string; displayName: string }; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const rating = Number(raw?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = "Choose a star rating.";
  }

  const comment = clean(raw?.comment);
  if (comment.length < COMMENT_MIN || comment.length > COMMENT_MAX) {
    errors.comment = `Write a review between ${COMMENT_MIN} and ${COMMENT_MAX} characters.`;
  }

  const displayName = clean(raw?.displayName);
  if (displayName.length < NAME_MIN || displayName.length > NAME_MAX) {
    errors.displayName = "Enter a name to show with your review.";
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { draft: { rating, comment, displayName }, errors };
}

function withinEditWindow(createdAtIso: string): boolean {
  const elapsedMs = Date.now() - new Date(createdAtIso).getTime();
  return elapsedMs <= EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Resolves WHO is asking and WHICH DELIVERED order proves they bought
 * `productId`. Every path ends in an order id this function itself looked up —
 * never one merely echoed back from the request (requirements section 17) —
 * and every path applies the delivered rule itself rather than trusting an
 * earlier lookup to have applied it.
 */
async function resolveOrder(
  supabase: any,
  request: Request,
  body: any,
  productId: string,
): Promise<{ orderId: string; userId: string | null } | { error: string; message: string }> {
  const authHeader = request.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data: userData } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) {
      return { error: "NOT_PURCHASED", message: "Your session could not be verified. Please sign in again." };
    }

    const { data, error } = await supabase
      .from("orders")
      .select("id, order_items!inner(product_id)")
      .eq("user_id", userId)
      .eq("order_items.product_id", productId)
      .eq("status", REVIEWABLE_STATUS)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      // Deliberately one message for "you never bought this" and "it has not
      // arrived yet": the customer's own order history already tells them
      // which of the two it is, and this endpoint should not be a way to ask.
      return {
        error: "NOT_PURCHASED",
        message: `We could not find a delivered order of this product on your account. ${NOT_DELIVERED_MESSAGE}`,
      };
    }
    return { orderId: data[0].id, userId };
  }

  const orderId = clean(body?.orderId);
  const reviewToken = clean(body?.reviewToken);
  if (orderId && reviewToken) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, review_token, order_items(product_id)")
      .eq("id", orderId)
      .maybeSingle();

    if (
      error ||
      !data ||
      String(data.review_token) !== reviewToken ||
      !data.order_items?.some((item: { product_id: string }) => item.product_id === productId)
    ) {
      return { error: "NOT_PURCHASED", message: "We could not verify this order for this product." };
    }
    // The token proves the order is theirs; it says nothing about where the
    // order has got to. A receipt held since checkout is exactly the case this
    // catches — the order it names is pending, not delivered.
    if (data.status !== REVIEWABLE_STATUS) {
      return { error: "NOT_DELIVERED", message: NOT_DELIVERED_MESSAGE };
    }
    return { orderId: data.id, userId: null };
  }

  const orderNumber = clean(body?.orderNumber);
  const email = clean(body?.email).toLowerCase();
  if (orderNumber && email) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_items!inner(product_id)")
      .eq("order_number", orderNumber)
      .ilike("email", email)
      .eq("status", REVIEWABLE_STATUS)
      .eq("order_items.product_id", productId)
      .maybeSingle();

    if (error || !data) {
      // Same single answer `find_order_for_review` gives, and for the same
      // reason: a wrong guess and an undelivered order must look alike.
      return {
        error: "NOT_PURCHASED",
        message: `We could not find a delivered order for that order number and email. ${NOT_DELIVERED_MESSAGE}`,
      };
    }
    return { orderId: data.id, userId: null };
  }

  return { error: "VALIDATION", message: "We could not verify which order this review is for." };
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

  // The service role key bypasses row level security, which is exactly why it
  // lives here and never in the browser (mirrors `place-order`).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Requirements section 17 — "apply rate limiting to... review submission."
  // Checked before ANY validation, same reasoning as `place-order`: a flood
  // of malformed requests should not even get as far as a validation error.
  // Fifteen per fifteen minutes covers a customer reviewing every item from a
  // large order, editing a couple of them, and still leaves no room for a
  // script.
  const limited = await rateLimited(supabase, request, "submit-review", 15, 900, CORS);
  if (limited) return limited;

  const action = body?.action === "delete" ? "delete" : "upsert";
  const productId = clean(body?.productId);
  if (!productId) return fail("VALIDATION", "A product must be given.");

  const resolved = await resolveOrder(supabase, request, body, productId);
  if ("error" in resolved) return fail(resolved.error, resolved.message, 403);
  const { orderId, userId } = resolved;

  const { data: existing, error: existingError } = await supabase
    .from("reviews")
    .select("id, created_at")
    .eq("order_id", orderId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existingError) {
    console.error("submit-review: could not read existing review:", existingError);
    return fail("REVIEW_FAILED", "Your review could not be saved just now. Please try again.", 500);
  }

  if (action === "delete") {
    if (!existing) return fail("NOT_FOUND", "There is no review here to remove.", 404);
    if (!withinEditWindow(existing.created_at)) {
      return fail(
        "EDIT_WINDOW_EXPIRED",
        `This review can no longer be removed — it has been more than ${EDIT_WINDOW_DAYS} days.`,
        403,
      );
    }

    const { error } = await supabase.from("reviews").delete().eq("id", existing.id);
    if (error) {
      console.error("submit-review: delete failed:", error);
      return fail("REVIEW_FAILED", "Your review could not be removed just now. Please try again.", 500);
    }
    return json({ deleted: true });
  }

  if (existing && !withinEditWindow(existing.created_at)) {
    return fail(
      "EDIT_WINDOW_EXPIRED",
      `This review can no longer be edited — it has been more than ${EDIT_WINDOW_DAYS} days.`,
      403,
    );
  }

  const { draft, errors } = validateDraft(body);
  if (!draft) {
    return json({ error: { code: "VALIDATION", message: "Please check your review.", fields: errors } }, 400);
  }

  // An edit is a fresh statement of the review, so it goes back to visible —
  // an admin who hid an earlier version of it will see the new one and can
  // moderate it again if it is still a problem (section 16 leaves hiding to
  // the admin dashboard; this function only ever writes `hidden: false`).
  const row = {
    product_id: productId,
    order_id: orderId,
    rating: draft.rating,
    comment: draft.comment,
    display_name: draft.displayName,
    verified_purchase: true,
    hidden: false,
    user_id: userId,
  };

  const { data: saved, error: saveError } = existing
    ? await supabase
        .from("reviews")
        .update({ rating: row.rating, comment: row.comment, display_name: row.display_name, hidden: false })
        .eq("id", existing.id)
        .select("id, rating, comment, display_name, verified_purchase, created_at, updated_at")
        .single()
    : await supabase
        .from("reviews")
        .insert(row)
        .select("id, rating, comment, display_name, verified_purchase, created_at, updated_at")
        .single();

  if (saveError || !saved) {
    // A concurrent request for the same order+product would land here as a
    // unique-violation on insert — rare (one browser tab, one order), but not
    // a 500-worthy surprise if it happens.
    console.error("submit-review: save failed:", saveError);
    return fail("REVIEW_FAILED", "Your review could not be saved just now. Please try again.", 500);
  }

  return json({
    review: {
      id: saved.id,
      rating: saved.rating,
      comment: saved.comment,
      displayName: saved.display_name,
      verifiedPurchase: saved.verified_purchase,
      createdAt: saved.created_at,
      updatedAt: saved.updated_at,
    },
  });
});
