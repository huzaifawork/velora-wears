import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { buttonClasses } from "@admin/components/ui/Button";
import { Button } from "@admin/components/ui/Button";
import { Card, PageHeader } from "@admin/components/ui/Card";
import { Badge } from "@admin/components/ui/Badge";
import { Pagination } from "@admin/components/ui/DataTable";
import { EmptyState, ErrorState, Skeleton } from "@admin/components/ui/Skeleton";
import { ActiveFilters, FilterBar, SearchInput } from "@admin/components/ui/SearchInput";
import { Select } from "@admin/components/ui/Select";
import { ConfirmDialog } from "@admin/components/ui/Modal";
import { useToast } from "@admin/components/ui/Toast";
import { EyeIcon, EyeOffIcon, ReviewsIcon, TrashIcon } from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import { useUrlState } from "@admin/hooks/useUrlState";
import { DEFAULT_PAGE_SIZE } from "@admin/services/products";
import {
  deleteReview,
  listReviews,
  reviewListKey,
  setReviewHidden,
  type ReviewFilter,
  type ReviewSort,
} from "@admin/services/reviews";
import type { AdminReview } from "@admin/services/rows";
import { formatDate } from "@admin/lib/format";

/**
 * Review moderation — requirements section 16's "Admin" subsection:
 *
 *   "All reviews should be visible in the Admin Dashboard. The admin should be
 *    able to hide or remove a review that is abusive or spam."
 *
 * The database half of this has been done since the schema was written —
 * `reviews.hidden` exists, the public read policy excludes hidden rows, and
 * `"admins manage reviews"` grants full access here. This screen is the control
 * that was missing.
 *
 * ---------------------------------------------------------------------------
 * HIDE IS THE FIRST BUTTON. DELETE IS THE SECOND.
 * ---------------------------------------------------------------------------
 * Hiding removes the review from the shop COMPLETELY — row level security
 * excludes it from the anon key's reads, so it is gone from the API rather than
 * filtered in a browser — and it is reversible. Deleting is not, and it also
 * frees the `(order_id, product_id)` unique slot, which lets the same customer
 * post a replacement. Both are offered because section 16 says "hide or
 * remove"; only one is the default.
 *
 * Hiding a review also corrects the product's rating with no further action:
 * `rating_avg` and `rating_count` in `product_summaries` are averaged from
 * non-hidden reviews only.
 *
 * REVIEWS ARE NEVER CREATED HERE. They are written by the storefront's
 * `submit-review` Edge Function.
 *
 * ---------------------------------------------------------------------------
 * SINCE REVIEWS WERE OPENED, THIS IS THE ONLY CHECK ON WHAT GETS SAID
 * ---------------------------------------------------------------------------
 * The client asked on 2026-09-05 that anybody be able to review any product,
 * account or no account, purchase or no purchase, with photographs
 * (`shared/reviews.ts`). The delivered-order gate that used to keep this
 * screen quiet is gone, so two things are on it that were not:
 *
 *   **Verified / Unverified on every row.** The badge used to be on all of
 *   them and told an admin nothing. Now it is the difference between a review
 *   the shop matched to a delivered order and one from a visitor it cannot
 *   identify — worth knowing before judging a complaint about sizing.
 *
 *   **The photographs.** A review can now need hiding for what is in a
 *   picture, and this is the only place in either application where an admin
 *   sees one attached to the review it belongs to.
 */
export function ReviewsPage() {
  const [params] = useSearchParams();
  const url = useUrlState();
  const toast = useToast();

  const search = params.get("q") ?? "";
  const filter = (params.get("filter") as ReviewFilter) || "all";
  const sort = (params.get("sort") as ReviewSort) || "newest";
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const options = useMemo(
    () => ({ search, filter, sort, page, pageSize: DEFAULT_PAGE_SIZE }),
    [search, filter, sort, page],
  );

  const reviews = useQuery(reviewListKey(options), ["reviews"], () => listReviews(options));

  const [pendingDelete, setPendingDelete] = useState<AdminReview>();
  const [deleting, setDeleting] = useState(false);

  const activeFilterCount = (search ? 1 : 0) + (filter !== "all" ? 1 : 0);

  /**
   * Optimistic — the brief's "where safe" case. One boolean, immediately
   * visible, trivially reversible, and nothing about it can produce a wrong
   * number. The list re-reads if the write fails.
   */
  const onToggle = async (review: AdminReview) => {
    const next = !review.hidden;
    try {
      await setReviewHidden(review.id, next);
      toast.success(
        next
          ? "Hidden from the shop. The product's rating has been recalculated."
          : "Visible on the shop again.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      reviews.refetch();
    }
  };

  const onDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    try {
      await deleteReview(pendingDelete.id);
      toast.success("Review deleted");
      setPendingDelete(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        description="Every review left on the shop, including the ones already hidden. Anyone can write one — with an account or without, having bought the piece or not — so this is where abuse and spam are dealt with. Hiding removes a review from the shop and recalculates the product's rating."
      />

      <Card padded={false}>
        <FilterBar
          search={
            <SearchInput
              label="Search reviews"
              placeholder="Search words or names…"
              value={search}
              onChange={(value) => url.set({ q: value || null, page: null })}
            />
          }
          filters={
            <>
              <Select
                label="Show"
                hideLabel
                value={filter}
                onChange={(value) => url.set({ filter: value === "all" ? null : value, page: null })}
                className="min-w-[11rem]"
                options={[
                  { value: "all", label: "Every review" },
                  { value: "flagged", label: "Needs a look (1-2 stars)" },
                  { value: "unverified", label: "Unverified only" },
                  { value: "visible", label: "Visible only" },
                  { value: "hidden", label: "Hidden only" },
                ]}
              />

              <Select
                label="Sort"
                hideLabel
                value={sort}
                onChange={(value) => url.set({ sort: value === "newest" ? null : value, page: null })}
                className="min-w-[9.5rem]"
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                  { value: "rating-asc", label: "Lowest rated" },
                  { value: "rating-desc", label: "Highest rated" },
                ]}
              />

              <ActiveFilters
                count={activeFilterCount}
                onClear={() => url.set({ q: null, filter: null, page: null })}
              />
            </>
          }
        />

        {reviews.error ? (
          <ErrorState error={reviews.error} onRetry={reviews.refetch} />
        ) : reviews.loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        ) : (reviews.data?.rows ?? []).length === 0 ? (
          <EmptyState
            icon={<ReviewsIcon />}
            title={activeFilterCount > 0 ? "Nothing matches" : "No reviews yet"}
            description={
              activeFilterCount > 0
                ? "No review matches the filters you have set."
                : "Anyone can review a product on the shop. Reviews appear here as they are written."
            }
            action={
              activeFilterCount > 0 ? (
                <button
                  type="button"
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                  onClick={() => url.set({ q: null, filter: null, page: null })}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {(reviews.data?.rows ?? []).map((review) => (
                <li
                  key={review.id}
                  className={`px-4 py-4 sm:px-5 ${review.hidden ? "bg-surface-sunken/60" : ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars rating={review.rating} />
                        <span className="text-sm font-medium text-ink">
                          {review.displayName}
                        </span>
                        {/* Both states are labelled here, unlike on the shop
                            where only "Verified" is shown. A customer reading
                            reviews does not need every unverified one marked;
                            an admin deciding what to do about one does. */}
                        <Badge tone={review.verifiedPurchase ? "success" : "neutral"}>
                          {review.verifiedPurchase ? "Verified purchase" : "Unverified"}
                        </Badge>
                        {review.hidden && <Badge tone="neutral">Hidden</Badge>}
                      </div>

                      <p className="mt-1 text-xs text-ink-muted">
                        {review.productName} · {formatDate(review.createdAt)}
                      </p>

                      <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">
                        {review.comment}
                      </p>

                      {review.photos.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {review.photos.map((photo) => (
                            /* A plain link to the full file, opened in a new
                               tab. A lightbox belongs on the shop, where a
                               reader is looking at pictures; here the admin
                               wants the biggest version of one image, once,
                               without losing their place in the list. */
                            <a
                              key={photo.fullUrl}
                              href={photo.fullUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block h-16 w-16 overflow-hidden rounded-md border border-line transition hover:border-accent"
                            >
                              <img
                                src={photo.thumbUrl}
                                alt=""
                                width={64}
                                height={64}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void onToggle(review)}
                        icon={
                          review.hidden ? (
                            <EyeIcon className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOffIcon className="h-3.5 w-3.5" />
                          )
                        }
                      >
                        {review.hidden ? "Show" : "Hide"}
                      </Button>

                      <button
                        type="button"
                        onClick={() => setPendingDelete(review)}
                        aria-label="Delete this review"
                        className="rounded-md p-2 text-ink-muted transition hover:bg-danger/10 hover:text-danger"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <Pagination
              page={page}
              pageSize={DEFAULT_PAGE_SIZE}
              total={reviews.data?.total ?? 0}
              onPage={(next) => url.set({ page: next === 1 ? null : String(next) })}
            />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(undefined)}
        onConfirm={() => void onDelete()}
        loading={deleting}
        title="Delete this review permanently?"
        message={
          <>
            Hiding is usually the better answer: it removes the review from the
            shop just as completely and can be undone.
            <br />
            <br />
            Deleting also frees this reviewer's slot for that product, so they
            can write another one — and any photographs attached to it stay in
            storage, unused, since nothing points at them any more.
          </>
        }
      />
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="flex items-center gap-0.5"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-3.5 w-3.5 ${index < rating ? "text-accent" : "text-line-strong"}`}
          fill="currentColor"
        >
          <path d="m12 3.6 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7.9-5.6-4-3.9 5.6-.8z" />
        </svg>
      ))}
    </span>
  );
}
