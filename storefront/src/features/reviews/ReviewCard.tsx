import type { Review } from "@shared/types";
import { Badge } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { formatDate } from "@/lib/format";

/**
 * One customer review, as a card. Built for the landing page's testimonials and
 * reused unchanged on the product detail page (requirements sections 2, 4 and
 * 16) — the same review must not look like two different things on two pages.
 *
 * Only the display name is ever rendered. The customer's email and phone number
 * live on the order and must never reach a public page (section 17).
 */

/** `Ayesha Siddiqui` -> `AS`, for the avatar disc. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function ReviewCard({
  review,
  showDate = false,
}: {
  review: Review;
  /** Shown on a product page, where recency matters; not on the landing strip. */
  showDate?: boolean;
}) {
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
    </figure>
  );
}
