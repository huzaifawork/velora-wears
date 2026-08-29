import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { invalidate } from "@admin/lib/cache";
import { REVIEW_COLUMNS, toReview, type AdminReview, type ReviewRow } from "@admin/services/rows";
import type { Page } from "@admin/services/products";
import { DEFAULT_PAGE_SIZE } from "@admin/services/products";

/**
 * Review moderation — requirements section 16's "Admin" subsection, quoted in
 * `developerb.md` §5:
 *
 *   "All reviews should be visible in the Admin Dashboard. The admin should be
 *    able to hide or remove a review that is abusive or spam."
 *
 * This is the one item the project still owed the client, and the database half
 * of it was already done: `reviews.hidden` exists, `"visible reviews are
 * public"` excludes hidden rows from every public read the storefront makes,
 * and `"admins manage reviews"` grants full access here. What was missing was
 * the control that flips the flag.
 *
 * HIDE, not delete, is the default action offered by the UI. Hiding is
 * reversible and removes the review from the shop completely — RLS excludes it
 * from the anon key's reads, so it is gone from the API and not merely filtered
 * in the browser — while deletion cannot be undone and permanently frees the
 * `(order_id, product_id)` slot, which would let the same customer submit a
 * replacement. Both are offered; only one is the first button.
 *
 * REVIEWS ARE NEVER WRITTEN HERE. A review is created by the storefront's
 * `submit-review` Edge Function, which verifies that the order actually
 * contains the product being reviewed. Nothing in this file inserts one.
 */

export type ReviewFilter = "all" | "visible" | "hidden" | "flagged";
export type ReviewSort = "newest" | "oldest" | "rating-asc" | "rating-desc";

export interface ReviewListOptions {
  search?: string;
  filter?: ReviewFilter;
  productId?: string;
  sort?: ReviewSort;
  page?: number;
  pageSize?: number;
}

export function reviewListKey(options: ReviewListOptions): string {
  const {
    search,
    filter = "all",
    productId,
    sort = "newest",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  return ["reviews", (search ?? "").trim().toLowerCase() || "-", filter, productId ?? "-", sort, page, pageSize].join(":");
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function listReviews(options: ReviewListOptions): Promise<Page<AdminReview>> {
  const {
    search,
    filter = "all",
    productId,
    sort = "newest",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  let q = getSupabase().from("reviews").select(REVIEW_COLUMNS, { count: "exact" });

  if (filter === "visible") q = q.eq("hidden", false);
  if (filter === "hidden") q = q.eq("hidden", true);
  // "Needs a look": one and two star reviews that are still on the shop. Not a
  // stored flag — this project has no report button — but it is the query an
  // admin opening this screen is actually trying to run.
  if (filter === "flagged") q = q.eq("hidden", false).lte("rating", 2);

  if (productId) q = q.eq("product_id", productId);

  const term = (search ?? "").trim().toLowerCase();
  if (term) {
    // `comment` has no index, and deliberately: moderation search is a handful
    // of calls a week over a table that grows slowly, and a trigram index on
    // free-text review bodies would cost more to maintain on every write than
    // it saves. If review volume ever makes this slow, the fix is an index in
    // its own migration (§19), not a client-side filter.
    q = q.or(`comment.ilike.%${escapeLike(term)}%,display_name.ilike.%${escapeLike(term)}%`);
  }

  switch (sort) {
    case "oldest":
      q = q.order("created_at", { ascending: true });
      break;
    case "rating-asc":
      q = q.order("rating", { ascending: true });
      break;
    case "rating-desc":
      q = q.order("rating", { ascending: false });
      break;
    default:
      q = q.order("created_at", { ascending: false });
  }

  q = q.order("id", { ascending: true });

  const start = (page - 1) * pageSize;
  const { data, error, count } = await q.range(start, start + pageSize - 1);
  if (error) throw new Error(describeError(error));

  return {
    rows: (data ?? []).map((row) => toReview(row as unknown as ReviewRow)),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Hide or unhide a review.
 *
 * Safe to apply optimistically — the change is one boolean, instantly visible,
 * and trivially reversible if the write fails. Both the products' rating
 * average and the shop's public listing follow automatically: `rating_avg` and
 * `rating_count` in `product_summaries` are computed from non-hidden reviews,
 * so hiding a one-star spam review corrects the product's rating with no
 * further action.
 */
export async function setReviewHidden(id: string, hidden: boolean): Promise<void> {
  const { error } = await getSupabase().from("reviews").update({ hidden }).eq("id", id);
  if (error) throw new Error(describeError(error));
  invalidate("reviews", "products");
}

/**
 * Delete a review permanently.
 *
 * Offered because the policy permits it and section 16 says "hide OR remove",
 * but it is the second option in the UI: deletion also frees the `(order_id,
 * product_id)` unique slot, which means the same customer can submit another
 * one. Hiding does not.
 */
export async function deleteReview(id: string): Promise<void> {
  const { error } = await getSupabase().from("reviews").delete().eq("id", id);
  if (error) throw new Error(describeError(error));
  invalidate("reviews", "products");
}
