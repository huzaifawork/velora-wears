import type { ReviewErrors } from "@shared/reviews";
import type { ReviewPhoto } from "@shared/types";

/**
 * The call that writes, edits or removes a review (requirements section 16).
 *
 * Mirrors `lib/placeOrder.ts` exactly, for the same reasons: it posts to the
 * `submit-review` Edge Function — the ONLY way a review is ever written, since
 * `reviews` has no insert/update/delete policy for anon or authenticated — and
 * it uses `fetch` rather than the Supabase SDK so reaching this code path does
 * not pull the SDK into the bundle on its own.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE PAYLOAD SAYS ABOUT THE AUTHOR, SINCE REVIEWS WERE OPENED
 * ---------------------------------------------------------------------------
 * This used to send exactly ONE proof of purchase, because exactly one was
 * required and the request failed without it. Reviews are open to everybody
 * now (the client's 2026-09-05 instruction — `shared/reviews.ts`), so the
 * request instead sends EVERYTHING TRUE ABOUT THE AUTHOR and lets the server
 * decide what any of it is worth:
 *
 *   accessToken   they are signed in. The server looks for a delivered order
 *                 on the account.
 *   order         this browser still holds a checkout receipt naming an order
 *                 and its review token (`lib/orderReceipt.ts`).
 *   orderNumber   they typed an order number and email into the optional
 *   + email       verification step.
 *   authorToken   the random token this browser keeps for its own reviews
 *                 (`lib/myReviews.ts`) — the only thing identifying a reviewer
 *                 with neither an account nor an order.
 *
 * All four are optional and none of them can make the request fail. The first
 * three only ever decide `verifiedPurchase`, which the server sets from an
 * order it looked up itself and which is never sent from here — a badge the
 * browser could ask for would mean nothing.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** A review is not a purchase — nothing is lost by a customer trying again
 *  after a timeout, so this can be a little more patient than checkout. */
const TIMEOUT_MS = 15_000;

export type SubmitReviewErrorCode =
  | "VALIDATION"
  | "EDIT_WINDOW_EXPIRED"
  | "NOT_FOUND"
  | "REVIEW_FAILED"
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "NETWORK";

export class SubmitReviewError extends Error {
  readonly code: SubmitReviewErrorCode;
  /** Set only on `VALIDATION`, keyed by review field name. */
  readonly fields?: ReviewErrors;

  constructor(code: SubmitReviewErrorCode, message: string, fields?: ReviewErrors) {
    super(message);
    this.name = "SubmitReviewError";
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Everything this browser can say about who is writing. Only `authorToken` is
 * required, and only because a reviewer who turns out to be nobody in
 * particular still has to be able to come back and edit.
 */
export interface ReviewAuthorship {
  /** This browser's token for its own review of this product. */
  authorToken: string;
  /** The review being edited, when this browser knows it wrote one. */
  reviewId?: string;
  /** A signed-in customer's session. */
  accessToken?: string;
  /** A checkout receipt still in `sessionStorage`, or an order just verified
   *  through `findOrderForReview`. */
  order?: { orderId: string; reviewToken: string };
  /** The optional "I bought this" step, typed by a guest. */
  orderLookup?: { orderNumber: string; email: string };
}

export interface SubmittedReview {
  id: string;
  rating: number;
  comment: string;
  displayName: string;
  photos: ReviewPhoto[];
  verifiedPurchase: boolean;
  createdAt: number;
  updatedAt: number;
}

const KNOWN_CODES: readonly string[] = [
  "VALIDATION",
  "EDIT_WINDOW_EXPIRED",
  "NOT_FOUND",
  "REVIEW_FAILED",
  "BAD_REQUEST",
  "RATE_LIMITED",
];

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: ReviewErrors };
}

async function call(body: Record<string, unknown>, authorship: ReviewAuthorship): Promise<unknown> {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new SubmitReviewError(
      "NOT_CONFIGURED",
      "Reviews are not configured on this deployment.",
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: ANON_KEY };
  const payload: Record<string, unknown> = { ...body, authorToken: authorship.authorToken };

  if (authorship.reviewId) payload.reviewId = authorship.reviewId;
  if (authorship.accessToken) headers.Authorization = `Bearer ${authorship.accessToken}`;
  if (authorship.order) {
    payload.orderId = authorship.order.orderId;
    payload.reviewToken = authorship.order.reviewToken;
  }
  if (authorship.orderLookup) {
    payload.orderNumber = authorship.orderLookup.orderNumber;
    payload.email = authorship.orderLookup.email;
  }

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/submit-review`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SubmitReviewError(
      "NETWORK",
      "We could not reach the store to save your review. Check your connection and try again.",
    );
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = undefined;
  }

  if (!response.ok) {
    const raw = (responseBody as ErrorBody | undefined)?.error;
    const code = raw?.code && KNOWN_CODES.includes(raw.code) ? (raw.code as SubmitReviewErrorCode) : "REVIEW_FAILED";
    throw new SubmitReviewError(
      code,
      raw?.message ?? "Your review could not be saved just now. Please try again.",
      raw?.fields,
    );
  }

  return responseBody;
}

function toSubmittedReview(raw: unknown): SubmittedReview {
  const review = (raw as { review?: Partial<SubmittedReview> } | undefined)?.review;
  if (!review?.id || typeof review.rating !== "number") {
    throw new SubmitReviewError(
      "REVIEW_FAILED",
      "Your review was sent but we did not get a confirmation back. Please refresh and check before trying again.",
    );
  }
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment ?? "",
    displayName: review.displayName ?? "",
    photos: Array.isArray(review.photos) ? review.photos : [],
    // Decided by the server from an order it found itself; `false` is the
    // ordinary answer now, not a failure.
    verifiedPurchase: review.verifiedPurchase ?? false,
    createdAt: review.createdAt ? new Date(review.createdAt as unknown as string).getTime() : Date.now(),
    updatedAt: review.updatedAt ? new Date(review.updatedAt as unknown as string).getTime() : Date.now(),
  };
}

/** Creates a review, or edits the one this author already has for the product. */
export async function upsertReview(
  productId: string,
  draft: { rating: number; comment: string; displayName: string; photos: ReviewPhoto[] },
  authorship: ReviewAuthorship,
): Promise<SubmittedReview> {
  const body = await call(
    {
      action: "upsert",
      productId,
      rating: draft.rating,
      comment: draft.comment,
      displayName: draft.displayName,
      photos: draft.photos,
    },
    authorship,
  );
  return toSubmittedReview(body);
}

/** Removes this author's own review of the product. */
export async function deleteReview(productId: string, authorship: ReviewAuthorship): Promise<void> {
  await call({ action: "delete", productId }, authorship);
}
