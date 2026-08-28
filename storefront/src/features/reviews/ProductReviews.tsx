import type { Review } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Rating } from "@/components/ui/Rating";
import { Skeleton } from "@/components/ui/Skeleton";
import { ReviewCard } from "@/features/reviews/ReviewCard";
import { formatRating } from "@/lib/format";

/**
 * The reviews block on the product detail page — "an average rating and the
 * individual reviews" (requirements section 16).
 *
 * The average and the count are the PRECOMPUTED values from the product's
 * summary record, not an average of the reviews on screen: only the most recent
 * few are fetched, so averaging them would show a different number to the one
 * on the product card (sections 16 and 19).
 *
 * Writing a review is the rest of section 16 — the form, the guest review token
 * from the order, editing and removal. This is the read half.
 */
export function ProductReviews({
  reviews,
  loading,
  ratingAvg,
  ratingCount,
}: {
  reviews: Review[] | undefined;
  loading: boolean;
  ratingAvg: number;
  ratingCount: number;
}) {
  const shown = reviews?.length ?? 0;

  return (
    <section id="reviews" className="scroll-mt-24 border-t border-line bg-canvas-alt py-16 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Customer reviews"
          title="What buyers said about this piece"
          description="Reviews can only be left by customers with a confirmed order, so everything here comes from someone who actually received it."
        />

        {ratingCount > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <span className="font-display text-4xl leading-none text-ink">
              {formatRating(ratingAvg)}
            </span>
            <div className="flex flex-col gap-1">
              <Rating rating={ratingAvg} size="md" />
              <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
                {ratingCount} {ratingCount === 1 ? "review" : "reviews"}
                {shown > 0 && shown < ratingCount ? ` — showing the ${shown} most recent` : ""}
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-52 w-full" />)}
          </div>
        ) : shown === 0 ? (
          <p className="mt-10 text-sm text-ink-soft">
            No reviews yet. Once your order is delivered you will be invited to leave the first
            one.
          </p>
        ) : (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {reviews?.map((review) => (
              <ReviewCard key={review.id} review={review} showDate />
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
