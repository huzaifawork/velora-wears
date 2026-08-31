import type { Review } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { Rating } from "@/components/ui/Rating";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Skeleton } from "@/components/ui/Skeleton";
import { ReviewCard } from "@/features/reviews/ReviewCard";
import { formatRating } from "@/lib/format";

/**
 * Customer testimonials (requirements section 2), rendered from real `Review`
 * records — the same type section 16 writes when a customer reviews a product
 * they bought. Nothing here is bespoke marketing copy pretending to be a
 * review, so switching to genuine reviews changes the data, not this component.
 *
 * The cards themselves are `ReviewCard`, shared with the product detail page.
 */
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
          description="Every review below comes from a delivered order — Lahore to Karachi, Islamabad to Multan."
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

        {/* A staggered grid rather than a flat one — every second card sits a
            little lower, so the section reads as an arranged composition
            rather than a centered block of identical tiles. Only the rating
            summary above earns true centering; it's a single stat. */}
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className={`h-60 w-full ${i % 2 === 1 ? "sm:mt-8" : ""}`} />
              ))
            : reviews?.map((review, i) => (
                <div key={review.id} className={i % 2 === 1 ? "sm:mt-8" : ""}>
                  <ReviewCard review={review} />
                </div>
              ))}
        </div>
      </Container>
    </section>
  );
}
