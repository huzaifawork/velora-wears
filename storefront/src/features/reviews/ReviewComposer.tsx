import { useState } from "react";

import type { Review } from "@shared/types";
import {
  REVIEW_EDIT_WINDOW_DAYS,
  REVIEW_LIMITS,
  validateReviewField,
  withinEditWindow,
  type ReviewErrors,
  type ReviewField,
} from "@shared/reviews";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Rating } from "@/components/ui/Rating";
import { Skeleton } from "@/components/ui/Skeleton";
import { getExistingReview } from "@/lib/reviewLookup";
import { deleteReview, upsertReview, SubmitReviewError, type ReviewIdentity as WriteIdentity } from "@/lib/submitReview";
import { useAsync } from "@/hooks/useAsync";
import { formatDate } from "@/lib/format";

/**
 * The write half of section 16 — "a review should include a star rating and
 * a written comment," editable or removable within a reasonable window, one
 * review per product per order. The read half is `ProductReviews`.
 *
 * ONE component reused everywhere a customer can write a review (requirements
 * section 18): from order history, and — once a guest has verified an order
 * number and email — on the product page itself. What differs between those
 * call sites is only how ownership is proven, which is `identity`; everything
 * else about writing a review is identical.
 *
 * Every call site only mounts this for a DELIVERED order (`shared/reviews.ts`),
 * which is why it takes no status of its own: by the time it renders, the
 * question of whether a review is allowed yet has already been answered — and
 * `submit-review` answers it again server-side regardless.
 *
 * It always knows `orderId` up front (the caller looked it up — from the
 * receipt, from `listMyOrders()`, or from `findOrderForReview`), so it can
 * fetch the reviewer's own existing review for this order and product on
 * mount and decide whether to open in "write" or "edit" state, with a
 * "Remove" action once one exists. This is a UX nicety only — the Edge
 * Function re-derives the truth itself on every write regardless.
 */

type Identity = { mode: "session"; accessToken: string } | { mode: "token"; reviewToken: string };

function toWriteIdentity(identity: Identity, orderId: string): WriteIdentity {
  return identity.mode === "session"
    ? { mode: "session", accessToken: identity.accessToken }
    : { mode: "token", orderId, reviewToken: identity.reviewToken };
}

function StarPicker({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (rating: number) => void;
  error?: string;
}) {
  return (
    <div>
      <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">Your rating</p>
      <div role="radiogroup" aria-label="Rating" className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
            onClick={() => onChange(star)}
            className="p-1 transition hover:scale-110"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className={`h-7 w-7 ${star <= value ? "text-accent" : "text-line-strong"}`}
            >
              <path
                d="M10 1.6 12.472 6.9 18.2 7.68 14.05 11.62 15.07 17.4 10 14.64 4.93 17.4 5.95 11.62 1.8 7.68 7.528 6.9Z"
                fill="currentColor"
              />
            </svg>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs leading-relaxed text-danger">{error}</p>}
    </div>
  );
}

export function ReviewComposer({
  productId,
  productName,
  orderId,
  identity,
}: {
  productId: string;
  productName: string;
  orderId: string;
  identity: Identity;
}) {
  const existing = useAsync(() => getExistingReview(orderId, productId), `own-review:${orderId}:${productId}`);

  /**
   * Overrides `existing.data` once the customer actually does something.
   * `undefined` means "no override yet — trust the fetch"; `null` means
   * "confirmed removed"; a `Review` means "just written or edited". Writing
   * or removing does not refetch — the Edge Function's own response (or the
   * fact that a delete succeeded) is already the authoritative new state, so
   * a round trip back to `getExistingReview` would only confirm the same
   * thing a moment later.
   */
  const [override, setOverride] = useState<Review | null | undefined>(undefined);
  const current = override !== undefined ? override : (existing.data ?? null);

  const [expanded, setExpanded] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();

  const [draft, setDraft] = useState({ rating: 0, comment: "", displayName: "" });
  const [touched, setTouched] = useState<Partial<Record<ReviewField, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const openToEdit = () => {
    if (current) {
      setDraft({ rating: current.rating, comment: current.comment, displayName: current.displayName });
    } else {
      setDraft({ rating: 0, comment: "", displayName: "" });
    }
    setTouched({});
    setSubmitAttempted(false);
    setFormError(undefined);
    setExpanded(true);
  };

  const fieldError = (field: ReviewField): string | undefined => {
    if (!touched[field] && !submitAttempted) return undefined;
    return validateReviewField(field, draft) ?? undefined;
  };

  const errors: ReviewErrors = {
    rating: validateReviewField("rating", draft) ?? undefined,
    comment: validateReviewField("comment", draft) ?? undefined,
    displayName: validateReviewField("displayName", draft) ?? undefined,
  };
  const valid = !errors.rating && !errors.comment && !errors.displayName;

  const submit = async () => {
    setSubmitAttempted(true);
    setFormError(undefined);
    if (!valid) return;

    setSubmitting(true);
    try {
      const saved = await upsertReview(productId, draft, toWriteIdentity(identity, orderId));
      setOverride({
        id: saved.id,
        productId,
        orderId,
        rating: saved.rating as Review["rating"],
        comment: saved.comment,
        displayName: saved.displayName,
        verifiedPurchase: saved.verifiedPurchase,
        hidden: false,
        createdAt: current?.createdAt ?? saved.createdAt,
      });
      setExpanded(false);
    } catch (error) {
      setFormError(
        error instanceof SubmitReviewError
          ? error.message
          : "Your review could not be saved just now. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    setSubmitting(true);
    setFormError(undefined);
    try {
      await deleteReview(productId, toWriteIdentity(identity, orderId));
      setConfirmingRemove(false);
      setOverride(null);
      setDraft({ rating: 0, comment: "", displayName: "" });
    } catch (error) {
      setFormError(
        error instanceof SubmitReviewError
          ? error.message
          : "Your review could not be removed just now. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (existing.loading && override === undefined) return <Skeleton className="h-11 w-40" />;

  const editable = current ? withinEditWindow(current.createdAt) : true;

  if (!expanded) {
    if (!current) {
      return (
        <Button type="button" variant="secondary" size="sm" onClick={openToEdit}>
          Write a review
        </Button>
      );
    }

    return (
      <div className="flex flex-col gap-3 rounded-sm border border-line bg-canvas-alt p-5">
        <div className="flex items-center justify-between gap-3">
          <Rating rating={current.rating} />
          <time dateTime={new Date(current.createdAt).toISOString()} className="text-xs text-ink-muted">
            {formatDate(current.createdAt)}
          </time>
        </div>
        <p className="text-sm leading-relaxed text-ink-soft">{current.comment}</p>
        {editable ? (
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={openToEdit}
              className="text-xs tracking-eyebrow text-accent uppercase underline underline-offset-4 transition hover:text-ink"
            >
              Edit
            </button>
            {confirmingRemove ? (
              <>
                <span className="text-xs text-ink-muted">Remove this review?</span>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void remove()}
                  className="text-xs tracking-eyebrow text-danger uppercase underline underline-offset-4"
                >
                  {submitting ? "Removing…" : "Yes, remove it"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="text-xs tracking-eyebrow text-ink-muted uppercase underline underline-offset-4"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                className="text-xs tracking-eyebrow text-ink-muted uppercase underline underline-offset-4 transition hover:text-danger"
              >
                Remove
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-muted">
            This review is more than {REVIEW_EDIT_WINDOW_DAYS} days old and can no longer be
            edited or removed.
          </p>
        )}
        {formError && <p className="text-xs leading-relaxed text-danger">{formError}</p>}
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-5 rounded-sm border border-line bg-canvas-alt p-5"
    >
      <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
        Reviewing {productName}
      </p>

      <StarPicker value={draft.rating} onChange={(rating) => setDraft((d) => ({ ...d, rating }))} error={fieldError("rating")} />

      <Field
        label="Your review"
        value={draft.comment}
        onChange={(comment) => setDraft((d) => ({ ...d, comment }))}
        onBlur={() => setTouched((t) => ({ ...t, comment: true }))}
        error={fieldError("comment")}
        multiline
        rows={4}
        maxLength={REVIEW_LIMITS.comment.max}
        placeholder="What was it like to wear? How does the size run?"
      />

      <Field
        label="Display name"
        value={draft.displayName}
        onChange={(displayName) => setDraft((d) => ({ ...d, displayName }))}
        onBlur={() => setTouched((t) => ({ ...t, displayName: true }))}
        error={fieldError("displayName")}
        maxLength={REVIEW_LIMITS.displayName.max}
        placeholder="e.g. Ayesha S."
        hint="Shown publicly with your review. Your email is never shown."
      />

      {formError && <p className="text-sm text-danger">{formError}</p>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Saving…" : current ? "Save changes" : "Submit review"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setExpanded(false)} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
