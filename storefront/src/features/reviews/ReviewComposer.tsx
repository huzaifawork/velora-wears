import { useRef, useState, type ReactNode } from "react";

import type { Review, ReviewPhoto } from "@shared/types";
import {
  EMPTY_REVIEW_DRAFT,
  REVIEW_EDIT_WINDOW_DAYS,
  REVIEW_LIMITS,
  REVIEW_PHOTO_LIMIT,
  validateReviewField,
  withinEditWindow,
  type ReviewDraft,
  type ReviewErrors,
  type ReviewField,
} from "@shared/reviews";
import { ACCEPTED_IMAGE_TYPES } from "@shared/media";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Image } from "@/components/ui/Image";
import { Rating } from "@/components/ui/Rating";
import { Skeleton } from "@/components/ui/Skeleton";
import { getExistingReview, getReviewById } from "@/lib/reviewLookup";
import { deleteReview, upsertReview, SubmitReviewError } from "@/lib/submitReview";
import { ReviewPhotoError, uploadReviewPhoto } from "@/lib/reviewPhotos";
import { forgetOwnReview, newAuthorToken, ownReviewFor, rememberOwnReview } from "@/lib/myReviews";
import { useAsync } from "@/hooks/useAsync";
import { formatDate } from "@/lib/format";

/**
 * The write half of section 16 — a star rating, a written comment, optional
 * photographs, editable or removable within a reasonable window.
 * `ProductReviews` is the read half.
 *
 * ONE component reused everywhere a review can be written (requirements
 * section 18): the product page, and order history. What differs between call
 * sites is only what is known about the author, which is `accessToken` and
 * `order`; everything about writing a review is identical.
 *
 * ---------------------------------------------------------------------------
 * IT NO LONGER ASKS WHETHER A REVIEW IS ALLOWED
 * ---------------------------------------------------------------------------
 * This component used to be mounted only for a DELIVERED order, and took an
 * `identity` it could not render without. Since the client's 2026-09-05
 * instruction (`shared/reviews.ts`) reviews are open to everybody, so it
 * mounts for every visitor and both of those props are optional:
 *
 *   accessToken   present when the visitor happens to be signed in.
 *   order         present when they proved a delivered order, through the
 *                 optional verification step in `WriteReview`.
 *
 * Neither gates anything. Both are forwarded to `submit-review`, which decides
 * on its own whether the review earns the **Verified** badge — and re-derives
 * that on every save, so nothing here has to be right about it.
 *
 * ---------------------------------------------------------------------------
 * HOW IT FINDS THE REVIEW YOU ALREADY WROTE
 * ---------------------------------------------------------------------------
 * So that a returning visitor sees "your review" with Edit and Remove rather
 * than an empty form inviting a second one:
 *
 *   with an order   by `(order_id, product_id)`, as before.
 *   without one     by the id this browser kept in `lib/myReviews.ts`,
 *                   alongside the token that proves the edit.
 *
 * Both are a convenience, not a check. `submit-review` re-derives ownership
 * itself on every write, so the worst a stale entry here can do is open the
 * form on a review that turns out not to be editable.
 */

/** Every image type the picker offers, as an `accept` attribute. */
const ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

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

/**
 * The photo strip inside the form — the client's "if they also want to upload
 * pictures as well".
 *
 * Each file is UPLOADED THE MOMENT IT IS PICKED rather than held until submit
 * (`lib/reviewPhotos.ts` explains why at length): the tile that appears is the
 * real thumbnail from the bucket, so a photo that will not go through says so
 * while the customer is still choosing, instead of taking a written review
 * down with it later.
 *
 * The `<input type="file">` is hidden behind a real button rather than styled,
 * because a file input cannot be made to match anything else in the shop and
 * every attempt to style one ends up less accessible than the button it is
 * pretending to be. `multiple` is on: picking four photos should be one trip
 * through the phone's picker.
 */
function PhotoPicker({
  photos,
  onChange,
  disabled,
}: {
  photos: ReviewPhoto[];
  onChange: (photos: ReviewPhoto[]) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | undefined>();

  const room = REVIEW_PHOTO_LIMIT - photos.length - busy;

  const add = async (files: FileList) => {
    setError(undefined);

    // Sliced against the room left, so picking six when two fit uploads two
    // rather than failing all six at the server.
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (chosen.length === 0) return;

    setBusy((count) => count + chosen.length);

    // Accumulated locally rather than read back from the prop each time: the
    // loop runs across several awaits, and `photos` is the value from the
    // render that started it — appending to that repeatedly would keep only
    // the last photo.
    let next = photos;

    // Sequential, not parallel: these are phone photographs on a phone
    // connection, and four simultaneous uploads on a slow link is how you turn
    // four slow uploads into four failed ones. Each tile appears as it lands.
    for (const file of chosen) {
      try {
        next = [...next, await uploadReviewPhoto(file)].slice(0, REVIEW_PHOTO_LIMIT);
        onChange(next);
      } catch (failure) {
        setError(
          failure instanceof ReviewPhotoError
            ? failure.message
            : "That photo could not be added. Please try another.",
        );
      } finally {
        setBusy((count) => count - 1);
      }
    }
  };

  return (
    <div>
      <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
        Photos <span className="normal-case">— optional, up to {REVIEW_PHOTO_LIMIT}</span>
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((photo) => (
          <div key={photo.fullUrl} className="relative h-20 w-20 overflow-hidden rounded-sm border border-line">
            <Image
              src={photo.thumbUrl}
              alt=""
              width={80}
              height={80}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(photos.filter((kept) => kept.fullUrl !== photo.fullUrl))}
              aria-label="Remove this photo"
              className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-canvas transition hover:bg-ink"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}

        {Array.from({ length: busy }, (_, index) => (
          <Skeleton key={`uploading-${index}`} className="h-20 w-20 rounded-sm" />
        ))}

        {room > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => input.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-line-strong text-ink-muted transition hover:border-accent hover:text-ink disabled:opacity-50"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 4v12M4 10h12" strokeLinecap="round" />
            </svg>
            <span className="text-[0.5625rem] tracking-eyebrow uppercase">Add</span>
          </button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const { files } = event.target;
          if (files) void add(files);
          // Cleared so picking the SAME file again still fires a change — the
          // case where a customer removes a photo and adds it back.
          event.target.value = "";
        }}
      />

      {error && <p className="mt-2 text-xs leading-relaxed text-danger">{error}</p>}
    </div>
  );
}

export function ReviewComposer({
  productId,
  productName,
  accessToken,
  order,
  verifySlot,
}: {
  productId: string;
  productName: string;
  /** A signed-in customer's session, when there is one. */
  accessToken?: string;
  /** A delivered order the reviewer proved, when they did. */
  order?: { orderId: string; reviewToken: string };
  /** The optional "I bought this" step, rendered inside the open form so it
   *  reads as an extra rather than a hurdle in front of one. */
  verifySlot?: ReactNode;
}) {
  /**
   * Read once, on mount, and held: the review this browser remembers writing
   * about this piece, and the token that proves it. A fresh token is minted
   * for the case where there is nothing remembered — unused unless a review is
   * actually written.
   */
  const [mine] = useState(() => ownReviewFor(productId));
  const [authorToken] = useState(() => mine?.authorToken ?? newAuthorToken());

  const lookupKey = order
    ? `own-review:order:${order.orderId}:${productId}`
    : `own-review:mine:${mine?.reviewId ?? "none"}`;

  const existing = useAsync(() => {
    if (order) return getExistingReview(order.orderId, productId);
    if (mine) return getReviewById(mine.reviewId);
    return Promise.resolve(null);
  }, lookupKey);

  /**
   * Overrides `existing.data` once the customer actually does something.
   * `undefined` means "no override yet — trust the fetch"; `null` means
   * "confirmed removed"; a `Review` means "just written or edited". Writing or
   * removing does not refetch — the Edge Function's own response (or the fact
   * that a delete succeeded) is already the authoritative new state, so a round
   * trip back would only confirm the same thing a moment later.
   */
  const [override, setOverride] = useState<Review | null | undefined>(undefined);
  const current = override !== undefined ? override : (existing.data ?? null);

  const [expanded, setExpanded] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();

  const [draft, setDraft] = useState<ReviewDraft>(EMPTY_REVIEW_DRAFT);
  const [touched, setTouched] = useState<Partial<Record<ReviewField, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const authorship = { authorToken, reviewId: current?.id ?? mine?.reviewId, accessToken, order };

  const openToEdit = () => {
    setDraft(
      current
        ? {
            rating: current.rating,
            comment: current.comment,
            displayName: current.displayName,
            photos: current.photos,
          }
        : EMPTY_REVIEW_DRAFT,
    );
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
      const saved = await upsertReview(productId, draft, authorship);

      // Remembered on EVERY save, not only the first: a customer who wrote
      // their first review before this browser had an entry, and one whose
      // review was found by order rather than by token, both end up recorded
      // the same way — which is what lets them edit it on a later visit.
      rememberOwnReview(productId, { reviewId: saved.id, authorToken });

      setOverride({
        id: saved.id,
        productId,
        orderId: order?.orderId,
        rating: saved.rating as Review["rating"],
        comment: saved.comment,
        displayName: saved.displayName,
        photos: saved.photos,
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
      await deleteReview(productId, authorship);
      forgetOwnReview(productId);
      setConfirmingRemove(false);
      setOverride(null);
      setDraft(EMPTY_REVIEW_DRAFT);
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
          <div className="flex items-center gap-2">
            <Rating rating={current.rating} />
            {current.verifiedPurchase && <Badge tone="success">Verified</Badge>}
          </div>
          <time dateTime={new Date(current.createdAt).toISOString()} className="text-xs text-ink-muted">
            {formatDate(current.createdAt)}
          </time>
        </div>
        <p className="text-sm leading-relaxed text-ink-soft">{current.comment}</p>

        {current.photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {current.photos.map((photo) => (
              <Image
                key={photo.fullUrl}
                src={photo.thumbUrl}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 rounded-sm border border-line object-cover"
              />
            ))}
          </div>
        )}

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

      <PhotoPicker
        photos={draft.photos}
        onChange={(photos) => setDraft((d) => ({ ...d, photos }))}
        disabled={submitting}
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

      {verifySlot}

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
