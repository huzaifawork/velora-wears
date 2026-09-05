import { useEffect, useState } from "react";

import type { Review, ReviewPhoto } from "@shared/types";
import { Badge } from "@/components/ui/Badge";
import { Image } from "@/components/ui/Image";
import { Rating } from "@/components/ui/Rating";
import { formatDate } from "@/lib/format";

/**
 * One customer review, as a card. Built for the landing page's testimonials and
 * reused unchanged on the product detail page (requirements sections 2, 4 and
 * 16) — the same review must not look like two different things on two pages.
 *
 * Only the display name is ever rendered. The customer's email and phone number
 * live on the order and must never reach a public page (section 17).
 *
 * The **Verified** badge became meaningful rather than decorative on
 * 2026-09-05, when reviews were opened to everybody (`shared/reviews.ts`).
 * Before then every review carried it and it told a reader nothing; now it is
 * the one visible difference between a review the shop matched to a delivered
 * order and one from a visitor it knows nothing about. An unverified review is
 * shown plainly, without a badge saying so — a scarlet letter on every review
 * from someone who did not link an order would work against the openness the
 * client asked for, and the absence of the badge already says it.
 */

/** `Ayesha Siddiqui` -> `AS`, for the avatar disc. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * A photograph opened full size.
 *
 * A dialog rather than a link to the file: a review photo is content of this
 * page, and sending someone to a bare Storage URL loses the shop, the back
 * button's meaning, and any chance of a caption. Escape closes it, the backdrop
 * closes it, and body scroll is locked while it is open — the three things a
 * reader will try.
 */
function Lightbox({ photo, onClose }: { photo: ReviewPhoto; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review photo"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6"
    >
      <Image
        src={photo.fullUrl}
        alt=""
        width={photo.width}
        height={photo.height}
        eager
        className="max-h-full max-w-full object-contain"
        onClick={(event) => event.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-canvas/15 text-canvas transition hover:bg-canvas/30"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function ReviewCard({
  review,
  showDate = false,
}: {
  review: Review;
  /** Shown on a product page, where recency matters; not on the landing strip. */
  showDate?: boolean;
}) {
  const [opened, setOpened] = useState<ReviewPhoto>();

  return (
    <figure className="relative flex h-full flex-col gap-4 rounded-sm border border-line bg-canvas p-7 shadow-card transition duration-500 ease-brand hover:-translate-y-1 hover:shadow-lift">
      {/* Oversized quote glyph, the editorial touch. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-3 right-5 font-display text-6xl leading-none text-accent-soft/40 select-none"
      >
        &rdquo;
      </span>

      <div className="flex items-center gap-3">
        <Rating rating={review.rating} />
        {showDate && (
          <time dateTime={new Date(review.createdAt).toISOString()} className="text-xs text-ink-muted">
            {formatDate(review.createdAt)}
          </time>
        )}
      </div>

      <blockquote className="flex-1 text-sm leading-relaxed text-pretty text-ink-soft">
        {review.comment}
      </blockquote>

      {review.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {review.photos.map((photo) => (
            <button
              key={photo.fullUrl}
              type="button"
              onClick={() => setOpened(photo)}
              aria-label="Open this photo"
              className="h-16 w-16 overflow-hidden rounded-sm border border-line transition hover:border-accent"
            >
              <Image
                src={photo.thumbUrl}
                alt=""
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <figcaption className="flex items-center gap-3 border-t border-line pt-5">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-canvas-deep font-display text-sm text-ink"
        >
          {initials(review.displayName)}
        </span>
        <span className="flex-1 text-xs font-medium tracking-eyebrow text-ink uppercase">
          {review.displayName}
        </span>
        {review.verifiedPurchase && <Badge tone="success">Verified</Badge>}
      </figcaption>

      {opened && <Lightbox photo={opened} onClose={() => setOpened(undefined)} />}
    </figure>
  );
}
