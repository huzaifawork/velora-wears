-- ---------------------------------------------------------------------------
-- Reviews are OPEN, and they can carry photographs.
--
-- The client's instruction, 2026-09-05:
--
--   "without creating an account or with creating an account, with buying the
--    product and without buying the product — howsoever, at this moment allow
--    everyone to write a review for the product below every product, and if
--    they also want to upload pictures as well."
--
-- Two changes, and they are smaller in the database than they are in the
-- application, because the schema was never the thing enforcing the old rule.
-- `reviews.order_id` has been NULLABLE since the first migration and
-- `verified_purchase` has defaulted to false since then too — the "you must
-- have a delivered order" gate lived entirely in `submit-review` and in the
-- storefront, which is where it is being lifted (see `shared/reviews.ts` for
-- the whole rule and what the order check became instead: the Verified badge,
-- not a permission).
--
-- What the database still owes the new behaviour is:
--
--   1. somewhere to put the photographs;
--   2. a way for a reviewer WITH NO ACCOUNT AND NO ORDER to come back and edit
--      or remove what they wrote, since neither `auth.uid()` nor an order's
--      `review_token` identifies them;
--   3. the one duplicate-review rule that `unique (order_id, product_id)` can
--      no longer express once `order_id` is usually null.
--
-- WRITES ARE STILL CLOSED. `reviews` gains no insert, update or delete policy
-- here: every write continues to go through the `submit-review` Edge Function
-- with the service role key, for the same reason it always did. "Anyone may
-- review" is a decision about who the FUNCTION says yes to, not an invitation
-- to let the browser write rows. Rate limiting, sanitisation, the photo cap
-- and `verified_purchase` are all decided there, and none of them survives
-- handing the anon key an insert policy.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. Photographs
-- ===========================================================================
--
-- A jsonb array of objects rather than a `review_photos` table, which is what
-- `product_images` is. The difference between the two cases is who reads them
-- and how: product images are queried on their own (ordered, repositioned,
-- one of them chosen as the thumbnail by a lateral join in
-- `product_summaries`), while review photos are ONLY ever read as part of the
-- review they hang off, never sorted, never counted, never joined to. A table
-- would add a join to every public review read to store at most four rows that
-- have no independent life.
--
-- Each element is `{ "thumbUrl": …, "fullUrl": …, "width": n, "height": n }`,
-- written only by the Edge Function, with the URLs pointing into the same
-- public `media` bucket everything else uses (see section 4 below).

alter table public.reviews
  add column if not exists photos jsonb not null default '[]'::jsonb;

-- The cap the customer's picker shows, the Edge Function enforces and
-- `MAX_REVIEW_PHOTOS` in `shared/media.ts` states — restated here because a
-- constraint is the only one of the four that cannot be bypassed. Four is a
-- strip of tiles that fits under a comment on a phone.
alter table public.reviews
  drop constraint if exists reviews_photos_shape;
alter table public.reviews
  add constraint reviews_photos_shape check (
    jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 4
  );


-- ===========================================================================
-- 2. How an anonymous reviewer proves the review is theirs
-- ===========================================================================
--
-- Section 16 asks that a review be "editable or removable within a reasonable
-- window", and that window is now open to people the shop knows nothing about.
-- A signed-in customer is identified by their session and a guest with an
-- order by that order's `review_token`; someone who simply wrote a review has
-- neither.
--
-- So the browser mints a random token, keeps it (in `localStorage` —
-- `storefront/src/lib/myReviews.ts`) and sends it with the review; the Edge
-- Function stores only its SHA-256 here. Editing or deleting means presenting
-- the token again, and the function hashes what it was given and compares.
--
-- The browser rather than the server, so that a response lost to a timeout
-- costs nothing: the token is already on the device that will need it.
--
-- THE HASH, NOT THE TOKEN, IS WHAT LIVES IN THIS COLUMN, and that is the whole
-- point. `"visible reviews are public"` lets anyone holding the anon key
-- select every column of every visible review — storing the raw token would
-- publish the key to editing everybody's reviews. A SHA-256 of a v4 UUID is
-- safe to hand out: there is nothing to reverse and nothing to guess.
--
-- Losing the token — a cleared browser, a different device — means losing the
-- ability to edit, which is the honest cost of not asking anyone to sign in.
-- The admin can still remove anything, which is the case that matters.

alter table public.reviews
  add column if not exists author_token_hash text;

-- NO INDEX ON THIS COLUMN, deliberately. Nothing ever filters by it: the
-- browser remembers its own review's ID, so both the storefront's read and the
-- Edge Function's ownership check find the row by primary key and then compare
-- the hash in code. An index here would be a write cost on every review to
-- serve a query nobody makes (requirements section 19 asks for an index behind
-- each query, which is also an argument against the ones with no query behind
-- them).


-- ===========================================================================
-- 3. One review per person per product, as far as that can be known
-- ===========================================================================
--
-- `unique (order_id, product_id)` from the first migration still stands and
-- still means what it meant: one review per product per ORDER. It simply stops
-- applying to most reviews, because Postgres treats NULLs as distinct — two
-- rows with a null `order_id` never collide, which is exactly what makes the
-- open path possible without dropping the constraint.
--
-- For a signed-in customer who reviews something they did not buy there IS a
-- stable identity to hold to, so it is held: one open review per account per
-- product. A guest with no account is bounded by rate limiting and moderation
-- instead, which is the trade the client asked for — an anonymous visitor
-- determined to write twice can clear their storage and do it, and the answer
-- to that is the Reviews screen in the dashboard, not a gate on the form.

create unique index if not exists reviews_one_open_per_user
  on public.reviews (user_id, product_id)
  where order_id is null and user_id is not null;


-- ===========================================================================
-- 4. Where a review photograph is stored
-- ===========================================================================
--
-- The existing `media` bucket (20260830000001), under its own prefix, with the
-- two variants of one photograph sharing a folder:
--
--   reviews/<uuid>/thumb.webp
--   reviews/<uuid>/full.webp
--
-- The folder is NOT a review id. The files are uploaded when the customer
-- picks them, before the review exists, and renaming an object afterwards
-- would change a URL the review already points at.
--
-- No new bucket and no new policy. The bucket is already public for reading —
-- these photographs go on a public product page, exactly like the product
-- shots beside them — and its insert policy is already `is_admin()`, which is
-- the correct answer for anyone holding the anon key: a customer must not be
-- able to upload to storage directly. The bytes go through the
-- `upload-review-photo` Edge Function, which uses the service role key and so
-- bypasses RLS, having first rate-limited the caller and re-checked the size
-- and type. Uploading is a thing the shop DOES for a customer, not a thing a
-- customer is given permission to do.
--
-- The bucket's own 5 MB limit and MIME allow-list therefore still apply to
-- every review photo, unchanged and enforced by storage itself, which is why
-- nothing below touches them.
--
-- Photos are deleted with the review when the REVIEWER removes it (the Edge
-- Function does both). A review deleted by an ADMIN from the dashboard leaves
-- its files behind: that path is a plain `delete` through PostgREST with no
-- server code in it, and orphaning a few hundred kilobytes is a better outcome
-- than a moderation button that can fail halfway. Everything of that kind is
-- under `reviews/`, and `reviews.photos` across the table is the list of what
-- is still in use, if the shop ever wants to sweep the difference.


-- ===========================================================================
-- 5. The landing page's testimonial strip needs an index now
-- ===========================================================================
--
-- `listTestimonials` reads the newest four-star-and-up reviews across the whole
-- table. It has always done that, but two things changed underneath it:
--
--   - it no longer also filters on `verified_purchase`, since requiring a badge
--     the client has just made optional would have left the strip empty on a
--     shop whose customers do not bother verifying;
--   - reviews are open, so this table now grows at the rate people write
--     opinions rather than at the rate they take delivery of parcels.
--
-- The only index it could have used before was `reviews_product`, which leads
-- on `product_id` and is no help to a query that spans every product. So the
-- query has in practice always been a sequential scan and a sort — invisible at
-- thirty-six demo reviews, and exactly the kind of thing requirements section
-- 19 is about ("any column used for filtering or ordering needs an index in the
-- migration that introduces the query"). The query is being changed here, so
-- the index belongs here.
--
-- Partial on the same two conditions the read applies, so it is small and the
-- planner can serve the whole thing from it: hidden reviews are excluded by RLS
-- on every public read anyway, and the four-star floor is what makes a
-- testimonial a testimonial.

create index if not exists reviews_testimonials
  on public.reviews (created_at desc)
  where not hidden and rating >= 4;


-- ===========================================================================
-- 6. What did NOT change, and why it is worth saying
-- ===========================================================================
--
-- `product_summaries.rating_avg` / `rating_count` average every VISIBLE review
-- of a product, verified or not, and still do. An unverified review is a real
-- review — that is the client's instruction — so it counts towards the stars
-- on the product card, and hiding an abusive one from the dashboard corrects
-- the average with no further action, exactly as before.
--
-- `find_order_for_review` (20260831000002) is unchanged, including its
-- `o.status = 'delivered'` test and its rate limit. It is no longer the door
-- into writing a review; it is how a guest who wants the Verified badge claims
-- one. Returning nothing now costs them a badge rather than the ability to
-- speak, which is a much smaller thing for it to be wrong about.
