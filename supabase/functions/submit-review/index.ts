// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rateLimited } from "../_shared/rateLimit.ts";

/**
 * submit-review — the trusted server code that writes, edits or removes a
 * review (requirements section 16).
 *
 * ===========================================================================
 * WHAT CHANGED ON 2026-09-05, AND WHAT DID NOT
 * ===========================================================================
 * This function used to exist mainly to REFUSE. Its job was to prove that
 * whoever was writing had a delivered order containing the product, and to
 * turn every request that could not prove it away. The client has asked for
 * the opposite policy — anyone may review any product, account or no account,
 * purchase or no purchase (the instruction is quoted in full in
 * `shared/reviews.ts`) — so the proving is still here and the refusing is not:
 *
 *   BEFORE  no delivered order  ->  403, nothing written.
 *   NOW     no delivered order  ->  the review is written, without the
 *                                   Verified badge.
 *
 * `verified_purchase` is the whole of what that check now decides, and it is
 * still decided EXCLUSIVELY here, from an order this function looked up
 * itself. A browser cannot set it, cannot ask for it, and cannot get it by
 * echoing back an order id — which is the same rule as before, applied to a
 * badge rather than to permission.
 *
 * The three ways ownership of an order can be shown are unchanged, and all
 * three are now optional:
 *
 *   1. Authorization header  -> the signed-in customer's own orders, found by
 *                               user_id.
 *   2. orderId + reviewToken -> the guest, same-session path: the token
 *                               `place-order` handed back and the storefront
 *                               kept in `sessionStorage`.
 *   3. orderNumber + email   -> the guest, "later" path, re-verified here
 *                               rather than taken on the client's word.
 *
 * None of them being present is a perfectly ordinary request now.
 *
 * ---------------------------------------------------------------------------
 * WHO OWNS A REVIEW WITH NO ORDER AND NO ACCOUNT BEHIND IT
 * ---------------------------------------------------------------------------
 * Section 16 still asks that a review be editable and removable for a while,
 * and the old answer — "the order it belongs to" — is gone for most reviews.
 * So a review written anonymously carries an AUTHOR TOKEN: the browser
 * generates one, keeps it in `localStorage`, and sends it to edit or delete.
 * Only its SHA-256 is stored, because `reviews` is publicly selectable and a
 * raw token in a public column would be the key to editing everyone's reviews.
 * See the migration (20260905000001) for the rest of that reasoning.
 *
 * ---------------------------------------------------------------------------
 * WHAT STILL PROTECTS THIS ENDPOINT
 * ---------------------------------------------------------------------------
 * Opening the door does not mean removing the lock from everything else:
 *
 *   - rate limiting per IP, checked before any validation (section 17);
 *   - field validation and control-character stripping, unchanged;
 *   - photo URLs accepted only if they point into this project's own `media`
 *     bucket under `reviews/` — a review cannot be used to hang an arbitrary
 *     image, or an arbitrary link, off a product page;
 *   - `reviews` STILL has no insert/update/delete policy for anon or
 *     authenticated. Everything here runs with the service role key, which is
 *     what makes all of the above unavoidable rather than optional.
 *
 * And the moderation half of section 16 is what catches the rest: reviews
 * publish immediately and an admin hides or removes abuse from the dashboard.
 *
 * ---------------------------------------------------------------------------
 * THE STOREFRONT'S COPY OF THE RULES IS `shared/reviews.ts`.
 * ---------------------------------------------------------------------------
 * Deno, deployed on its own by the Supabase CLI, which bundles only what is
 * under `supabase/` — it cannot import that file, so the same constants are
 * inlined below. CHANGING A RULE MEANS CHANGING BOTH.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const fail = (code: string, message: string, status = 400) =>
  json({ error: { code, message } }, status);

/* ---------------------------------------------------------------------------
 * Validation — requirements section 17. THE STOREFRONT'S COPY IS
 * `shared/reviews.ts`. CHANGING A RULE MEANS CHANGING BOTH FILES.
 * ------------------------------------------------------------------------ */

/**
 * The one status an order may be in for a review written against it to carry
 * the **Verified** badge. Nothing is refused for failing this any more — see
 * the note at the top — but the badge is not given away either.
 *
 * Mirrored in the storefront (`shared/reviews.ts` — `REVIEWABLE_ORDER_STATUS`)
 * and in `find_order_for_review`'s SQL. CHANGING THE RULE MEANS CHANGING ALL
 * THREE.
 */
const REVIEWABLE_STATUS = "delivered";

const COMMENT_MIN = 4;
const COMMENT_MAX = 1000;
const NAME_MIN = 2;
const NAME_MAX = 60;
const EDIT_WINDOW_DAYS = 30;
/** `MAX_REVIEW_PHOTOS` in `shared/media.ts`, and a `check` on `reviews.photos`. */
const MAX_PHOTOS = 4;

const BUCKET = "media";
/** Every photo URL a review may carry begins with this, and nothing else does. */
const PHOTO_URL_PREFIX = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/${BUCKET}/reviews/`;

/**
 * Control characters and invisible Unicode stripped before anything is
 * stored (requirements section 17) — same pattern as `place-order` and
 * `shared/sanitize.ts`, inlined here for the same reason every other shared
 * rule is: Deno cannot import from `shared/`.
 */
const UNSAFE_CHARS = new RegExp(
  "[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F-\\x9F\\u200B-\\u200F\\uFEFF]",
  "g",
);

const clean = (value: unknown): string =>
  typeof value === "string" ? value.replace(UNSAFE_CHARS, "").trim().replace(/\s+/g, " ") : "";

interface Photo {
  thumbUrl: string;
  fullUrl: string;
  width: number;
  height: number;
}

/**
 * Photographs, accepted ONLY as URLs this project's own `upload-review-photo`
 * function produced.
 *
 * The bytes never come through here — they were uploaded when the customer
 * picked the file, and this receives the two public URLs that came back. That
 * makes the prefix test the entire security question: without it, a
 * hand-written request could hang any image on the internet — a tracking
 * pixel, something obscene, something that stops resolving next week — off a
 * product page, and the shop would be serving it.
 *
 * Anything malformed is DROPPED rather than made into an error. A review is
 * mostly its words; losing one attachment to a client bug should not cost the
 * customer the paragraph they wrote.
 */
function cleanPhotos(raw: unknown): Photo[] {
  if (!Array.isArray(raw)) return [];

  const photos: Photo[] = [];
  for (const entry of raw.slice(0, MAX_PHOTOS)) {
    const thumbUrl = typeof entry?.thumbUrl === "string" ? entry.thumbUrl : "";
    const fullUrl = typeof entry?.fullUrl === "string" ? entry.fullUrl : "";
    if (!thumbUrl.startsWith(PHOTO_URL_PREFIX) || !fullUrl.startsWith(PHOTO_URL_PREFIX)) continue;

    const width = Math.trunc(Number(entry?.width));
    const height = Math.trunc(Number(entry?.height));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) continue;

    photos.push({ thumbUrl, fullUrl, width, height });
  }
  return photos;
}

/** The storage path inside `media` for one of our own public URLs. */
function storagePathOf(url: string): string | undefined {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  return at === -1 ? undefined : url.slice(at + marker.length);
}

/**
 * Deletes the files behind photos a review no longer has — because it was
 * removed, or because the reviewer took a picture off while editing.
 *
 * Never throws and never blocks the write. Storage housekeeping failing is not
 * a reason to tell a customer their review could not be saved; the files are
 * all under `reviews/` and can be swept later.
 */
async function forgetPhotos(supabase: any, photos: Photo[]): Promise<void> {
  const paths = photos
    .flatMap((photo) => [photo.thumbUrl, photo.fullUrl])
    .map(storagePathOf)
    .filter((path): path is string => Boolean(path));

  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.error("submit-review: could not remove review photos:", error);
}

function validateDraft(raw: any): { draft?: { rating: number; comment: string; displayName: string }; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const rating = Number(raw?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = "Choose a star rating.";
  }

  const comment = clean(raw?.comment);
  if (comment.length < COMMENT_MIN || comment.length > COMMENT_MAX) {
    errors.comment = `Write a review between ${COMMENT_MIN} and ${COMMENT_MAX} characters.`;
  }

  const displayName = clean(raw?.displayName);
  if (displayName.length < NAME_MIN || displayName.length > NAME_MAX) {
    errors.displayName = "Enter a name to show with your review.";
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { draft: { rating, comment, displayName }, errors };
}

function withinEditWindow(createdAtIso: string): boolean {
  const elapsedMs = Date.now() - new Date(createdAtIso).getTime();
  return elapsedMs <= EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * SHA-256 of the author token, hex.
 *
 * The token itself is never stored and never leaves the browser that made it,
 * except to be presented on an edit. Hashing is what makes it safe for
 * `author_token_hash` to sit in a publicly selectable table.
 */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * A token has to be long enough that guessing one is hopeless. The storefront
 * sends `crypto.randomUUID()`; anything of a plausible length is accepted,
 * because the only thing a bad token buys its owner is the inability to edit
 * their own review.
 */
function validAuthorToken(token: string): boolean {
  return token.length >= 20 && token.length <= 200;
}

interface Author {
  /** The DELIVERED order that vouches for this review, if one was proved. */
  orderId: string | null;
  /** The signed-in customer, if there is one. Null for a guest. */
  userId: string | null;
  /** Exactly `orderId !== null`, named for what it means rather than how it
   *  was derived, because this is the value that becomes the badge. */
  verified: boolean;
}

const ANONYMOUS: Author = { orderId: null, userId: null, verified: false };

/**
 * Works out WHO is asking and whether a DELIVERED order of this product can be
 * found behind them.
 *
 * Every path here is now optional and none of them can refuse the request.
 * Each either produces an order id THIS FUNCTION looked up — never one merely
 * echoed back from the request body (requirements section 17) — or produces
 * nothing and leaves the review unverified. A failed verification is not an
 * error; it is the ordinary case.
 */
async function resolveAuthor(
  supabase: any,
  request: Request,
  body: any,
  productId: string,
): Promise<Author> {
  const authHeader = request.headers.get("Authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    // This is also where the ANON KEY lands when the storefront sends it as a
    // bearer token, which is why a failure here is silent: "that is not a
    // user" is not a problem, it is a guest.
    const { data: userData } = await supabase.auth.getUser(authHeader.slice(7));
    userId = userData?.user?.id ?? null;
  }

  if (userId) {
    const { data } = await supabase
      .from("orders")
      .select("id, order_items!inner(product_id)")
      .eq("user_id", userId)
      .eq("order_items.product_id", productId)
      .eq("status", REVIEWABLE_STATUS)
      .order("created_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0) return { orderId: data[0].id, userId, verified: true };
  }

  const orderId = clean(body?.orderId);
  const reviewToken = clean(body?.reviewToken);
  if (orderId && reviewToken) {
    const { data } = await supabase
      .from("orders")
      .select("id, status, review_token, order_items(product_id)")
      .eq("id", orderId)
      .maybeSingle();

    const matches =
      data &&
      String(data.review_token) === reviewToken &&
      data.status === REVIEWABLE_STATUS &&
      data.order_items?.some((item: { product_id: string }) => item.product_id === productId);

    if (matches) return { orderId: data.id, userId, verified: true };
  }

  const orderNumber = clean(body?.orderNumber);
  const email = clean(body?.email).toLowerCase();
  if (orderNumber && email) {
    const { data } = await supabase
      .from("orders")
      .select("id, order_items!inner(product_id)")
      .eq("order_number", orderNumber)
      .ilike("email", email)
      .eq("status", REVIEWABLE_STATUS)
      .eq("order_items.product_id", productId)
      .maybeSingle();

    if (data) return { orderId: data.id, userId, verified: true };
  }

  return { ...ANONYMOUS, userId };
}

interface ExistingReview {
  id: string;
  created_at: string;
  photos: Photo[];
}

/**
 * The reviewer's OWN existing review of this product, if they have one — the
 * row an edit updates and a delete removes.
 *
 * Three ways to find it, in descending order of how strongly it is proved,
 * and the whole of what stops one person editing another's review:
 *
 *   the order       the review belongs to an order this request just proved
 *                   ownership of. Unchanged from before.
 *   the token       a review id plus the author token whose hash is stored on
 *                   the row. This is the anonymous reviewer's only proof, so
 *                   it is compared against the row that was actually fetched —
 *                   an id alone gets nowhere.
 *   the account     a signed-in customer's open review, found by user_id. They
 *                   are identified by a session, which is proof enough without
 *                   a token.
 *
 * `null` means "write a new one". It is deliberately NOT an error to have
 * asked for a review that could not be matched: a stale id in a browser's
 * storage should cost the customer a new row, not a refusal.
 */
async function findOwnReview(
  supabase: any,
  productId: string,
  author: Author,
  body: any,
): Promise<ExistingReview | null> {
  const select = "id, created_at, photos, product_id, user_id, author_token_hash";

  if (author.orderId) {
    const { data } = await supabase
      .from("reviews")
      .select(select)
      .eq("order_id", author.orderId)
      .eq("product_id", productId)
      .maybeSingle();
    if (data) return { id: data.id, created_at: data.created_at, photos: cleanPhotos(data.photos) };
  }

  const reviewId = clean(body?.reviewId);
  const authorToken = clean(body?.authorToken);
  if (reviewId && authorToken && validAuthorToken(authorToken)) {
    const { data } = await supabase.from("reviews").select(select).eq("id", reviewId).maybeSingle();
    if (
      data &&
      data.product_id === productId &&
      data.author_token_hash &&
      data.author_token_hash === (await hashToken(authorToken))
    ) {
      return { id: data.id, created_at: data.created_at, photos: cleanPhotos(data.photos) };
    }
  }

  if (author.userId) {
    const { data } = await supabase
      .from("reviews")
      .select(select)
      .eq("user_id", author.userId)
      .eq("product_id", productId)
      .is("order_id", null)
      .maybeSingle();
    if (data) return { id: data.id, created_at: data.created_at, photos: cleanPhotos(data.photos) };
  }

  return null;
}

/** Photos the edit dropped, matched on the full-size URL. */
function droppedPhotos(before: Photo[], after: Photo[]): Photo[] {
  const kept = new Set(after.map((photo) => photo.fullUrl));
  return before.filter((photo) => !kept.has(photo.fullUrl));
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Use POST.", 405);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail("BAD_REQUEST", "Could not read the request.", 400);
  }

  // The service role key bypasses row level security, which is exactly why it
  // lives here and never in the browser (mirrors `place-order`).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  /**
   * Requirements section 17 — "apply rate limiting to... review submission."
   * Checked before ANY validation, same reasoning as `place-order`: a flood of
   * malformed requests should not even get as far as a validation error.
   *
   * This matters more than it did. The old delivered-order gate meant a
   * script had nothing to gain by hammering this endpoint — it could not write
   * anything. Now it could, so the rate limit is no longer a courtesy on top
   * of a real check; it IS the check on volume, and the dashboard's moderation
   * screen is the check on content.
   */
  const limited = await rateLimited(supabase, request, "submit-review", 15, 900, CORS);
  if (limited) return limited;

  const action = body?.action === "delete" ? "delete" : "upsert";
  const productId = clean(body?.productId);
  if (!productId) return fail("VALIDATION", "A product must be given.");

  const author = await resolveAuthor(supabase, request, body, productId);
  const existing = await findOwnReview(supabase, productId, author, body);

  if (action === "delete") {
    if (!existing) return fail("NOT_FOUND", "There is no review here to remove.", 404);
    if (!withinEditWindow(existing.created_at)) {
      return fail(
        "EDIT_WINDOW_EXPIRED",
        `This review can no longer be removed — it has been more than ${EDIT_WINDOW_DAYS} days.`,
        403,
      );
    }

    const { error } = await supabase.from("reviews").delete().eq("id", existing.id);
    if (error) {
      console.error("submit-review: delete failed:", error);
      return fail("REVIEW_FAILED", "Your review could not be removed just now. Please try again.", 500);
    }

    // After the row is gone, so a storage failure cannot leave a review that
    // the customer was told was deleted.
    await forgetPhotos(supabase, existing.photos);
    return json({ deleted: true });
  }

  if (existing && !withinEditWindow(existing.created_at)) {
    return fail(
      "EDIT_WINDOW_EXPIRED",
      `This review can no longer be edited — it has been more than ${EDIT_WINDOW_DAYS} days.`,
      403,
    );
  }

  const { draft, errors } = validateDraft(body);
  if (!draft) {
    return json({ error: { code: "VALIDATION", message: "Please check your review.", fields: errors } }, 400);
  }

  const photos = cleanPhotos(body?.photos);

  /**
   * The token the browser will need to come back and edit this.
   *
   * Only ever set when the review is CREATED, and only stored as a hash. An
   * edit leaves whatever is already on the row alone — re-minting it on every
   * save would silently lock out any other device holding the original.
   */
  const submittedToken = clean(body?.authorToken);
  const authorTokenHash =
    !existing && submittedToken && validAuthorToken(submittedToken)
      ? await hashToken(submittedToken)
      : null;

  // An edit is a fresh statement of the review, so it goes back to visible —
  // an admin who hid an earlier version of it will see the new one and can
  // moderate it again if it is still a problem (section 16 leaves hiding to
  // the admin dashboard; this function only ever writes `hidden: false`).
  const columns: Record<string, unknown> = {
    rating: draft.rating,
    comment: draft.comment,
    display_name: draft.displayName,
    photos,
    hidden: false,
  };

  /**
   * The badge is only ever ADDED by a save, never taken away by one.
   *
   * An order proved on this request sets it (and ties the review to that
   * order, so a customer who wrote before their parcel arrived and edits after
   * it did picks the badge up). A request that proves nothing leaves both
   * columns exactly as they are — which is what stops a guest losing a badge
   * they already earned simply because they did not re-type their order number
   * to fix a typo in their own sentence.
   *
   * Withdrawing a badge is a moderation decision, and moderation has a screen.
   */
  if (author.orderId) {
    columns.order_id = author.orderId;
    columns.verified_purchase = true;
  } else if (!existing) {
    columns.verified_purchase = false;
  }

  const returning = "id, rating, comment, display_name, photos, verified_purchase, created_at, updated_at";

  const { data: saved, error: saveError } = existing
    ? await supabase.from("reviews").update(columns).eq("id", existing.id).select(returning).single()
    : await supabase
        .from("reviews")
        .insert({
          ...columns,
          product_id: productId,
          user_id: author.userId,
          author_token_hash: authorTokenHash,
        })
        .select(returning)
        .single();

  if (saveError || !saved) {
    // A concurrent request for the same order+product, or a signed-in customer
    // with two tabs open on the same product, would land here as a unique
    // violation — rare, and not a 500-worthy surprise if it happens.
    console.error("submit-review: save failed:", saveError);
    return fail("REVIEW_FAILED", "Your review could not be saved just now. Please try again.", 500);
  }

  // Pictures the customer took off while editing. After the save, for the same
  // reason the delete path cleans up after itself.
  if (existing) await forgetPhotos(supabase, droppedPhotos(existing.photos, photos));

  return json({
    review: {
      id: saved.id,
      rating: saved.rating,
      comment: saved.comment,
      displayName: saved.display_name,
      photos: cleanPhotos(saved.photos),
      verifiedPurchase: saved.verified_purchase,
      createdAt: saved.created_at,
      updatedAt: saved.updated_at,
    },
  });
});
