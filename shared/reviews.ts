/**
 * Velora Wears — the review RULES (requirements sections 16 and 17).
 *
 * Same shape as `shared/checkout.ts`: one definition of what a valid review
 * is, meant to be identical on both sides —
 *
 *   the storefront   marks the rating, comment or name invalid as the
 *                    customer fills the form in, and refuses to submit
 *                    while anything is wrong.
 *   the server       re-validates before writing, and is the only one of the
 *                    two that decides anything (a review is never trusted
 *                    from the browser any more than a price is).
 *
 * ---------------------------------------------------------------------------
 * THE SERVER'S COPY LIVES IN `supabase/functions/submit-review/index.ts`.
 * ---------------------------------------------------------------------------
 * Deno, deployed on its own by the Supabase CLI, which bundles only what is
 * under `supabase/` — it cannot import this file, so it carries the same
 * constants inline. CHANGING A RULE MEANS CHANGING BOTH.
 *
 * ===========================================================================
 * WHO MAY WRITE A REVIEW: ANYONE. (Client instruction, 2026-09-05.)
 * ===========================================================================
 * This file used to open with the opposite rule — a review had to come from a
 * DELIVERED order, proved by a session, a checkout token, or an order number
 * and email. The client has since asked for the plain thing instead:
 *
 *   "without creating an account or with creating an account, with buying the
 *    product and without buying the product — howsoever, at this moment allow
 *    everyone to write a review for the product below every product, and if
 *    they also want to upload pictures as well."
 *
 * So the form is open. No sign-in, no order and no verification step stands in
 * front of it, and photographs may be attached (`MAX_REVIEW_PHOTOS` in
 * `shared/media.ts`).
 *
 * WHAT THE ORDER CHECK BECAME, rather than what it stopped being: proving a
 * delivered order no longer grants PERMISSION, it earns the **Verified**
 * badge on the review card. That check still runs — automatically for a
 * signed-in customer, automatically for a guest still holding a checkout
 * receipt, and on request for a guest who types an order number and email —
 * but it now only ever ADDS something. Nothing is refused for failing it, and
 * `verifiedPurchase` is still decided exclusively by the server, because a
 * badge a browser could set for itself would mean nothing.
 *
 * The moderation half of section 16 now carries the weight this gate used to:
 * reviews publish immediately, and an admin hides or removes anything abusive
 * from the dashboard's Reviews screen. Rate limiting (section 17) covers the
 * rest.
 */

import { stripUnsafeChars } from "./sanitize";
import type { OrderStatus, ReviewPhoto } from "./types";
import { MAX_REVIEW_PHOTOS } from "./media";

/**
 * The order status that earns a review its **Verified** badge: delivered, and
 * not before.
 *
 * A review is about wearing the thing, so "I paid for it ninety seconds ago"
 * is not yet an opinion the shop can vouch for — and an order that was
 * cancelled never earns the badge at all. This is no longer a gate on writing
 * (see the note at the top of this file); it is the one thing separating a
 * review the shop stands behind from one it merely hosts.
 *
 * Applied in three places that have to agree, two of which cannot import this
 * file:
 *
 *   `supabase/functions/submit-review/index.ts`   `REVIEWABLE_STATUS`
 *   `find_order_for_review` (the guest lookup)    `o.status = 'delivered'`
 *
 * CHANGING THE RULE MEANS CHANGING ALL THREE.
 */
export const REVIEWABLE_ORDER_STATUS: OrderStatus = "delivered";

/** Whether an order in this status can vouch for a review written against it. */
export function canReviewOrder(status: OrderStatus | undefined): boolean {
  return status === REVIEWABLE_ORDER_STATUS;
}

/** Shown beside the OPTIONAL verification step, so a customer whose parcel is
 *  still in transit understands they can review now and simply will not carry
 *  the badge — not that they have to wait for one. */
export const REVIEW_VERIFIED_AFTER_DELIVERY_MESSAGE =
  "An order counts once it has been delivered. You can write your review either way — verifying only adds the Verified badge.";

export const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export function isReviewRating(value: unknown): value is ReviewRating {
  return typeof value === "number" && REVIEW_RATINGS.includes(value as ReviewRating);
}

/** Length bounds, also used as the `maxLength` on the inputs themselves. */
export const REVIEW_LIMITS = {
  comment: { min: 4, max: 1000 },
  /** A display name, not a legal one — "Ayesha S." is fine (section 16: the
   *  email must never be shown, so this is deliberately a separate field
   *  from the order's full name, not a reuse of it). */
  displayName: { min: 2, max: 60 },
} as const;

/**
 * How long after it was written a review may still be edited or removed
 * (requirements section 16: "editable or removable... within a reasonable
 * window"). Thirty days comfortably covers the return/exchange window this
 * store already advertises (seven days) with room for a customer's opinion
 * to settle in.
 */
export const REVIEW_EDIT_WINDOW_DAYS = 30;

export function withinEditWindow(createdAtMs: number, nowMs: number = Date.now()): boolean {
  const elapsedDays = (nowMs - createdAtMs) / (1000 * 60 * 60 * 24);
  return elapsedDays <= REVIEW_EDIT_WINDOW_DAYS;
}

/** Same normalisation `shared/checkout.ts` uses: trim, collapse internal whitespace. */
export function cleanReviewText(value: unknown): string {
  return typeof value === "string" ? stripUnsafeChars(value).trim().replace(/\s+/g, " ") : "";
}

/**
 * The most photographs one review may carry — re-exported from
 * `shared/media.ts` so a form validating a draft has one import rather than
 * two. The Edge Function and a `check` constraint on `reviews.photos` enforce
 * the same number.
 */
export const REVIEW_PHOTO_LIMIT = MAX_REVIEW_PHOTOS;

export interface ReviewDraft {
  rating: number;
  comment: string;
  displayName: string;
  /**
   * Photographs ALREADY UPLOADED — `upload-review-photo` has run and handed
   * back a pair of URLs (`storefront/src/lib/reviewPhotos.ts`). A draft never
   * carries raw files: a photo is uploaded the moment it is picked, so the
   * customer watches it appear rather than discovering at submit time that it
   * could not be read.
   */
  photos: ReviewPhoto[];
}

export type ReviewField = keyof ReviewDraft;

export const EMPTY_REVIEW_DRAFT: ReviewDraft = { rating: 0, comment: "", displayName: "", photos: [] };

export type ReviewErrors = Partial<Record<ReviewField, string>>;

export interface ReviewValidation {
  draft: { rating: ReviewRating; comment: string; displayName: string; photos: ReviewPhoto[] };
  errors: ReviewErrors;
  valid: boolean;
}

/** Validates one field, the same way `validateCheckoutField` does — on blur,
 *  on every keystroke after a field has already been marked wrong, and on
 *  submit (requirements section 17: validate as the customer fills the form
 *  in, and again on submit). */
export function validateReviewField(field: ReviewField, draft: Partial<ReviewDraft>): string | null {
  switch (field) {
    case "rating":
      return isReviewRating(draft.rating) ? null : "Choose a star rating.";

    case "comment": {
      const comment = cleanReviewText(draft.comment);
      if (comment.length < REVIEW_LIMITS.comment.min) return "Write a few words about it.";
      if (comment.length > REVIEW_LIMITS.comment.max) {
        return `Please keep the review under ${REVIEW_LIMITS.comment.max} characters.`;
      }
      return null;
    }

    case "displayName": {
      const name = cleanReviewText(draft.displayName);
      if (name.length < REVIEW_LIMITS.displayName.min || name.length > REVIEW_LIMITS.displayName.max) {
        return "Enter a name to show with your review.";
      }
      return null;
    }

    case "photos": {
      // A backstop, not something a customer normally reads: the picker stops
      // offering its button at the limit. This is here so the field list below
      // covers every key of a draft, and so a client that ignored the picker
      // gets the same answer the Edge Function would give it.
      if ((draft.photos ?? []).length > REVIEW_PHOTO_LIMIT) {
        return `You can attach up to ${REVIEW_PHOTO_LIMIT} photos.`;
      }
      return null;
    }
  }
}

export function validateReviewDraft(draft: Partial<ReviewDraft>): ReviewValidation {
  const errors: ReviewErrors = {};
  for (const field of ["rating", "comment", "displayName", "photos"] as const) {
    const message = validateReviewField(field, draft);
    if (message) errors[field] = message;
  }

  return {
    draft: {
      rating: (isReviewRating(draft.rating) ? draft.rating : 1) as ReviewRating,
      comment: cleanReviewText(draft.comment),
      displayName: cleanReviewText(draft.displayName),
      photos: (draft.photos ?? []).slice(0, REVIEW_PHOTO_LIMIT),
    },
    errors,
    valid: Object.keys(errors).length === 0,
  };
}
