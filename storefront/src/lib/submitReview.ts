import type { ReviewErrors } from "@shared/reviews";

/**
 * The call that writes, edits or removes a review (requirements section 16).
 *
 * Mirrors `lib/placeOrder.ts` exactly, for the same reasons: it posts to the
 * `submit-review` Edge Function — the ONLY way a review is ever written,
 * since `reviews` has no insert/update/delete policy for anon or
 * authenticated — and it uses `fetch` rather than the Supabase SDK so
 * reaching this code path does not pull the SDK into the bundle on its own.
 *
 * Ownership is proven one of two ways here: a signed-in customer's access
 * token, or a guest's `orderId` + `reviewToken` — fresh from checkout
 * (`sessionStorage`), or obtained by verifying an order number and email
 * through `lib/reviewLookup.ts`'s `findOrderForReview`, which returns the
 * same `orderId` + `reviewToken` pair once ownership is proven. The Edge
 * Function also accepts an order-number-and-email body directly (see its own
 * notes) as a defence-in-depth re-check; nothing in the storefront needs to
 * call it that way, since the lookup already hands back a token.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** A review is not a purchase — nothing is lost by a customer trying again
 *  after a timeout, so this can be a little more patient than checkout. */
const TIMEOUT_MS = 15_000;

export type SubmitReviewErrorCode =
  | "VALIDATION"
  | "NOT_PURCHASED"
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

/** Exactly one of these identifies who is submitting and which order proves it. */
export type ReviewIdentity =
  | { mode: "session"; accessToken: string }
  | { mode: "token"; orderId: string; reviewToken: string };

export interface SubmittedReview {
  id: string;
  rating: number;
  comment: string;
  displayName: string;
  verifiedPurchase: boolean;
  createdAt: number;
  updatedAt: number;
}

const KNOWN_CODES: readonly string[] = [
  "VALIDATION",
  "NOT_PURCHASED",
  "EDIT_WINDOW_EXPIRED",
  "NOT_FOUND",
  "REVIEW_FAILED",
  "BAD_REQUEST",
  "RATE_LIMITED",
];

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: ReviewErrors };
}

async function call(body: Record<string, unknown>, identity: ReviewIdentity): Promise<unknown> {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new SubmitReviewError(
      "NOT_CONFIGURED",
      "Reviews are not configured on this deployment.",
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: ANON_KEY };
  const payload = { ...body } as Record<string, unknown>;

  if (identity.mode === "session") {
    headers.Authorization = `Bearer ${identity.accessToken}`;
  } else {
    payload.orderId = identity.orderId;
    payload.reviewToken = identity.reviewToken;
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
    verifiedPurchase: review.verifiedPurchase ?? true,
    createdAt: review.createdAt ? new Date(review.createdAt as unknown as string).getTime() : Date.now(),
    updatedAt: review.updatedAt ? new Date(review.updatedAt as unknown as string).getTime() : Date.now(),
  };
}

/** Creates a review, or edits the reviewer's existing one for this order and product. */
export async function upsertReview(
  productId: string,
  draft: { rating: number; comment: string; displayName: string },
  identity: ReviewIdentity,
): Promise<SubmittedReview> {
  const body = await call(
    { action: "upsert", productId, rating: draft.rating, comment: draft.comment, displayName: draft.displayName },
    identity,
  );
  return toSubmittedReview(body);
}

/** Removes the reviewer's own review for this order and product. */
export async function deleteReview(productId: string, identity: ReviewIdentity): Promise<void> {
  await call({ action: "delete", productId }, identity);
}
