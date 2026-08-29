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
 */

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
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export interface ReviewDraft {
  rating: number;
  comment: string;
  displayName: string;
}

export type ReviewField = keyof ReviewDraft;

export const EMPTY_REVIEW_DRAFT: ReviewDraft = { rating: 0, comment: "", displayName: "" };

export type ReviewErrors = Partial<Record<ReviewField, string>>;

export interface ReviewValidation {
  draft: { rating: ReviewRating; comment: string; displayName: string };
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
  }
}

export function validateReviewDraft(draft: Partial<ReviewDraft>): ReviewValidation {
  const errors: ReviewErrors = {};
  for (const field of ["rating", "comment", "displayName"] as const) {
    const message = validateReviewField(field, draft);
    if (message) errors[field] = message;
  }

  return {
    draft: {
      rating: (isReviewRating(draft.rating) ? draft.rating : 1) as ReviewRating,
      comment: cleanReviewText(draft.comment),
      displayName: cleanReviewText(draft.displayName),
    },
    errors,
    valid: Object.keys(errors).length === 0,
  };
}
