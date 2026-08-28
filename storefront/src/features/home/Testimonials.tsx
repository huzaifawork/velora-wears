import type { Review } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatRating } from "@/lib/format";

/**
 * Customer testimonials (requirements section 2), rendered from real `Review`
 * records — the same type section 16 writes when a customer reviews a product
 * they bought. Nothing here is bespoke marketing copy pretending to be a
 * review, so switching to genuine reviews changes the data, not this component.
 *
 * Only the display name is ever shown. The customer's email and phone number
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

export function Testimonials({
  reviews,
  loading,
}: {
  reviews: Review[] | undefined;
  loading: boolean;
}) {
  // Nothing to show and nothing loading: omit the section rather than render an
  // empty shell. (The Realtime Database path returns none until section 16.)
  if (!loading && (!reviews || reviews.length === 0)) return null;

  // The average of what is on screen. A catalogue-wide figure would have to be
  // precomputed and written by the admin dashboard (requirements section 19) —
  // it must never be calculated by reading every review.
  const average =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="Customer reviews"
          title="What people across Pakistan are saying"
          description="Every review below comes from a confirmed order — Lahore to Karachi, Islamabad to Multan."
        />

        {!loading && reviews && (
          <div className="mt-8 flex flex-col items-center gap-2">
            <Rating rating={average} size="md" />
            <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
              {formatRating(average)} average from the {reviews.length} verified{" "}
              {reviews.length === 1 ? "review" : "reviews"} below
            </p>
          </div>
        )}

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-60 w-full" />)
            : reviews?.map((review) => (
                <figure
                  key={review.id}
                  className="relative flex h-full flex-col gap-4 rounded-sm border border-line bg-canvas p-7 shadow-card transition duration-500 ease-brand hover:-translate-y-1 hover:shadow-lift"
                >
                  {/* Oversized quote glyph, the editorial touch. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-3 right-5 font-display text-6xl leading-none text-accent-soft/40 select-none"
                  >
                    &rdquo;
                  </span>

                  <Rating rating={review.rating} />

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
              ))}
        </div>
      </Container>
    </section>
  );
}
