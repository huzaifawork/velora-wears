// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rateLimited } from "../_shared/rateLimit.ts";

/**
 * upload-review-photo — the only way a customer's photograph reaches Storage.
 *
 * Reviews were opened to everybody on 2026-09-05 (the client's instruction,
 * written out in full in `shared/reviews.ts`), and the same instruction asked
 * that a reviewer be able to attach pictures. That raises a question the shop
 * has never had to answer before: how does somebody who is not signed in, and
 * may never have bought anything, get a file into the `media` bucket?
 *
 * ---------------------------------------------------------------------------
 * NOT BY BEING GIVEN PERMISSION TO.
 * ---------------------------------------------------------------------------
 * The obvious answer — a storage policy letting `anon` insert under a
 * `reviews/` prefix — is an unauthenticated, unmetered write endpoint on the
 * shop's CDN, and no policy can express "at most a few, at a sane rate, and
 * only if it is really an image". So the bucket keeps `is_admin()` on insert
 * exactly as it is, and the bytes come through here instead, where the service
 * role key does the write AFTER:
 *
 *   - a rate limit per IP (requirements section 17), checked first, before
 *     anything is read into memory;
 *   - a size cap, checked against the declared length AND the bytes actually
 *     received, so a lying `Content-Length` gains nothing;
 *   - a MIME allow-list matching the bucket's own.
 *
 * Uploading is something the shop DOES for a customer. It is not a permission
 * a customer holds.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SEPARATE FROM `submit-review`
 * ---------------------------------------------------------------------------
 * A photo is uploaded THE MOMENT IT IS PICKED, not when the review is
 * submitted. That is what lets the composer show a real thumbnail with a
 * remove button, and it means a customer learns that a picture will not go
 * through while they are still looking at the picker — rather than losing a
 * written review to a failed 800 KB submit. `submit-review` then receives
 * URLs, and re-checks that they point into this shop's own bucket under
 * `reviews/` before storing them, so a hand-written request cannot hang an
 * arbitrary image off a review.
 *
 * The cost is orphans: photos uploaded for a review that was never submitted
 * sit in the bucket referenced by nothing. They are a few tens of kilobytes
 * each, they are all under `reviews/`, and the alternative — holding megabytes
 * of base64 in a JSON body and processing them at submit time — is worse in
 * every way that matters.
 *
 * The browser has already resized and re-encoded both variants before either
 * reaches this function (`shared/image.ts`, `REVIEW_IMAGE` in
 * `shared/media.ts`); this uploads what it is given and checks that what it
 * was given is sane. ONE variant per request — the client calls twice, in
 * parallel, and `storefront/src/lib/reviewPhotos.ts` pairs them up.
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

/** The bucket the whole shop reads its images out of (`shared/media.ts` —
 *  `MEDIA_BUCKET`). Inlined: Deno cannot import from `shared/`. */
const BUCKET = "media";

/** Mirrors the bucket's own `allowed_mime_types`, so a file that would be
 *  refused by storage is refused here with a sentence instead of a 400 from
 *  somewhere else. */
const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png", "image/avif"];

/**
 * Two megabytes, well under the bucket's own five.
 *
 * The browser's encoder lands a full-size review photo around 100-150 KB
 * (`REVIEW_IMAGE`), so this is not a limit any honest upload comes near — it
 * is the ceiling on what a hand-written request can make this function hold in
 * memory, and on what one rate-limit slot is worth spending.
 */
const MAX_BYTES = 2 * 1024 * 1024;

/** Which of the two files this is. Only these two strings become a path. */
const VARIANTS = ["thumb", "full"];

/**
 * The two variants of ONE photograph share a folder, and the client says which
 * by sending the same `group` on both calls.
 *
 * That is the only thing in the request that reaches a path, so it is matched
 * against this and nothing else: 36 characters of hex and hyphens in exactly
 * the shape of a UUID. Anything else — a slash, a `..`, a name — does not
 * match and the request is refused, which is a shorter argument than
 * sanitising would be. A caller who repeats someone else's group can still
 * only ADD `thumb`/`full` objects that do not already exist (`upsert: false`),
 * so the worst it buys them is a wasted rate-limit slot.
 */
const GROUP_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXTENSION: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Use POST.", 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  /**
   * Before the body is read, deliberately.
   *
   * Sixty per fifteen minutes is generous for a person — four photos on a
   * review is eight requests, so that is seven or eight reviews with a full
   * set of pictures — and useless to a script trying to fill the bucket. The
   * budget is its own, separate from `submit-review`'s: a customer picking
   * four photos must not spend the allowance they need to actually post the
   * review.
   */
  const limited = await rateLimited(supabase, request, "upload-review-photo", 60, 900, CORS);
  if (limited) return limited;

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(contentType)) {
    return fail("BAD_TYPE", "That file is not an image the shop can use. Upload a JPEG, PNG or WebP.");
  }

  const query = new URL(request.url).searchParams;
  const variant = query.get("variant") ?? "";
  const group = query.get("group") ?? "";
  if (!VARIANTS.includes(variant) || !GROUP_PATTERN.test(group)) {
    return fail("BAD_REQUEST", "Could not read the request.");
  }

  // The declared length first — it costs nothing and rejects the obvious case
  // without reading a byte. The real length is checked again below, because a
  // header is a claim.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) {
    return fail("TOO_LARGE", "That photo is too large. Please try a smaller one.", 413);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return fail("BAD_REQUEST", "Could not read the request.");
  }

  if (bytes.byteLength === 0) {
    return fail("BAD_REQUEST", "Could not read the request.");
  }
  if (bytes.byteLength > MAX_BYTES) {
    return fail("TOO_LARGE", "That photo is too large. Please try a smaller one.", 413);
  }

  /**
   * The path is built from two values that have both been checked against a
   * fixed set — a UUID-shaped group and one of two literal variant names.
   * No file name and nothing else from the request reaches it, so there is no
   * traversal to sanitise, and `upsert: false` below means an existing object
   * is never overwritten.
   *
   * The folder is not a review id: the review does not exist yet, and renaming
   * an object afterwards would change a URL the review already points at. It
   * is simply what makes the two halves of one photograph findable together.
   */
  const path = `reviews/${group}/${variant}.${EXTENSION[contentType]}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    // A year: the path is unique per upload, so the bytes at this URL never
    // change and there is nothing for a cache to get wrong.
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) {
    console.error("upload-review-photo: upload failed:", error);
    return fail("UPLOAD_FAILED", "That photo could not be uploaded just now. Please try again.", 500);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return json({ url: data.publicUrl });
});
