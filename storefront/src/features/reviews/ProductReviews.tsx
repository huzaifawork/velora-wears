import type { ReactNode } from "react";

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
 * `writeReviewSlot` is the write half — `<WriteReview>`, passed in by the page
 * rather than imported here, so this component stays about reading and
 * rendering a list. It sits between the rating summary and the individual
 * cards, which is also where it renders while there are no reviews yet.
 *
 * The copy on this section changed with the client's 2026-09-05 instruction
 * (`shared/reviews.ts`): it used to tell every reader that reviews come only
 * from people whose order arrived, which was the shop's strongest claim about
 * them and is no longer true. Anyone can write one now, so the section says
 * what IS still true — the Verified badge marks the ones matched to a
 * delivered order — and leaves the reader to weigh the rest.
 */
export function ProductReviews({
  reviews,
  loading,
  ratingAvg,
  ratingCount,
  writeReviewSlot,
}: {
  reviews: Review[] | undefined;
  loading: boolean;
  ratingAvg: number;
  ratingCount: number;
  writeReviewSlot?: ReactNode;
}) {
  const shown = reviews?.length ?? 0;

  return (
    <section id="reviews" className="scroll-mt-24 border-t border-line bg-canvas-alt py-16 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow="Customer reviews"
          title="What buyers said about this piece"
          description="Anyone can leave a review here. The ones marked Verified were matched to a delivered order, so you can tell at a glance which come from a confirmed buyer."
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

        {writeReviewSlot && <div className="mt-8">{writeReviewSlot}</div>}

        {loading ? (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-52 w-full" />)}
          </div>
        ) : shown === 0 ? (
          <p className="mt-10 text-sm text-ink-soft">
            No reviews yet — be the first to say what you thought. You do not need an account,
            and you can add photos.
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
