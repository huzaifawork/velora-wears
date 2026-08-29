import type { Review, Size } from "@shared/types";

/**
 * Two small reads that sit around `submitReview.ts`, both PUBLIC — neither
 * goes through the Edge Function, because neither writes anything.
 *
 * **`findOrderForReview`** is the guest "verify with your order number and
 * email" path requirements section 16 asks for, for a guest who has no
 * session and whose `sessionStorage` receipt is long gone. It calls the
 * `find_order_for_review` Postgres function directly over PostgREST's RPC
 * endpoint with the anon key — a `SECURITY DEFINER` function is what lets it
 * read `orders` despite RLS closing that table to anon, and the columns it
 * returns are the boundary that keeps this from leaking anything else on the
 * order (see the migration). It hands back the SAME `orderId` + `reviewToken`
 * pair a fresh checkout would have, so from here on the guest is
 * indistinguishable from one still on the confirmation page.
 *
 * **`getExistingReview`** is a plain, ordinary read of `reviews` — publicly
 * selectable already (`visible reviews are public`) — used only to decide
 * whether a review form should open in "write" or "edit" mode. It is a UX
 * nicety, not a security boundary: the Edge Function re-derives the truth
 * itself on every write regardless of what this returned (see its notes on
 * why an edit always un-hides).
 *
 * Both use `fetch` directly rather than the Supabase SDK, for the same
 * reason `lib/placeOrder.ts` does: reaching a review form must not pull the
 * SDK into the bundle for every visitor in demo mode.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface GuestOrderLine {
  orderId: string;
  reviewToken: string;
  productId: string;
  productName: string;
  productSlug: string;
  size: Size;
  qty: number;
}

interface FindOrderRow {
  order_id: string;
  review_token: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  size: Size;
  qty: number;
}

/**
 * Every item on the order matched by this order number and email, or `[]`
 * when nothing matches — deliberately the same shape either way (a wrong
 * order number and a wrong email are not distinguished), so this cannot be
 * used to probe which part of a guess was wrong.
 */
export async function findOrderForReview(orderNumber: string, email: string): Promise<GuestOrderLine[]> {
  if (!SUPABASE_URL || !ANON_KEY) return [];

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/find_order_for_review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ p_order_number: orderNumber, p_email: email }),
  });

  if (!response.ok) return [];

  const rows = (await response.json().catch(() => [])) as FindOrderRow[];
  return rows.map((row) => ({
    orderId: row.order_id,
    reviewToken: row.review_token,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    size: row.size,
    qty: row.qty,
  }));
}

/** The reviewer's own review for this order and product, or `null`. */
export async function getExistingReview(orderId: string, productId: string): Promise<Review | null> {
  if (!SUPABASE_URL || !ANON_KEY) return null;

  const params = new URLSearchParams({
    order_id: `eq.${orderId}`,
    product_id: `eq.${productId}`,
    select: "*",
    limit: "1",
  });

  const response = await fetch(`${SUPABASE_URL}/rest/v1/reviews?${params.toString()}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!response.ok) return null;

  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return null;

  return {
    id: row.id,
    productId: row.product_id,
    orderId: row.order_id ?? "",
    rating: row.rating,
    comment: row.comment,
    displayName: row.display_name,
    verifiedPurchase: row.verified_purchase,
    hidden: row.hidden,
    userId: row.user_id ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}
