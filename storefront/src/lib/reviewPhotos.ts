import { REVIEW_IMAGE } from "@shared/media";
import { encodeVariants, rejectFile } from "@shared/image";
import type { ReviewPhoto } from "@shared/types";

/**
 * Attaching a photograph to a review (the client's 2026-09-05 instruction —
 * see `shared/reviews.ts`).
 *
 * The shape mirrors `admin/src/lib/storage.ts`, because it is the same job:
 * resize and re-encode in the browser (`shared/image.ts`), upload both
 * variants, hand back a `thumbUrl`/`fullUrl` pair. What differs is WHO is
 * allowed to write to the bucket. An admin uploads with their own session and
 * a storage policy that names them; a customer holding nothing but the anon
 * key has no such policy and must not be given one — so these bytes go
 * through the `upload-review-photo` Edge Function instead, which rate-limits,
 * re-checks size and type, and does the write with the service role key.
 *
 * `fetch` rather than the Supabase SDK, for the reason every other lib/ file
 * here gives: reaching a review form must not pull the SDK into the bundle for
 * a visitor in demo mode.
 *
 * ---------------------------------------------------------------------------
 * UPLOADED WHEN PICKED, NOT WHEN SUBMITTED
 * ---------------------------------------------------------------------------
 * `ReviewComposer` calls this the moment a file is chosen, and holds the
 * returned pair in its draft. That is what lets a real thumbnail appear with a
 * remove button beside it, and it means a photo that cannot go through fails
 * while the customer is still looking at the picker — rather than taking a
 * written review down with it at submit time.
 *
 * The cost is a photo uploaded for a review that is then abandoned, which sits
 * in the bucket referenced by nothing. It is tens of kilobytes, it is under
 * `reviews/`, and the alternative is worse (see the Edge Function's own note).
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Generous: a phone photo is re-encoded to ~120 KB before it is sent, so this
 *  only ever bites on a genuinely bad connection. */
const TIMEOUT_MS = 30_000;

export class ReviewPhotoError extends Error {}

/**
 * A UUID-shaped id tying the two variants of one photograph together in the
 * bucket. The Edge Function matches it against a UUID pattern before it
 * reaches a path, so the shape is not cosmetic.
 *
 * The fallback is for a plain-HTTP origin, where `crypto.randomUUID` does not
 * exist because the page is not a secure context. It is not a good UUID and
 * does not need to be — nothing is authorised by it; it only decides which
 * folder two files share.
 */
function randomGroup(): string {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();

  const hex = (length: number) =>
    Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
}

async function put(blob: Blob, variant: "thumb" | "full", group: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(
      `${SUPABASE_URL}/functions/v1/upload-review-photo?variant=${variant}&group=${group}`,
      {
        method: "POST",
        // The raw bytes as the body, with the image's own type as the content
        // type — no multipart wrapper to parse on the far side, and nothing in
        // the request that the server turns into a file path.
        headers: { "Content-Type": blob.type, apikey: ANON_KEY },
        body: blob,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch {
    throw new ReviewPhotoError(
      "That photo could not be uploaded. Check your connection and try again.",
    );
  }

  const body = await response.json().catch(() => undefined);

  if (!response.ok || typeof body?.url !== "string") {
    throw new ReviewPhotoError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : "That photo could not be uploaded just now. Please try again.",
    );
  }

  return body.url;
}

/**
 * Resize, encode and upload one photograph, returning what the review will
 * store.
 *
 * The two variants go up in parallel — they are independent objects and a
 * customer waiting on a phone should wait once, not twice. If either fails the
 * whole photo fails: a half-pair is a thumbnail that opens onto nothing, which
 * is worse than no attachment at all. The orphaned half is left in the bucket
 * rather than chased, since it is unreferenced either way.
 */
export async function uploadReviewPhoto(file: File): Promise<ReviewPhoto> {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new ReviewPhotoError("Photo uploads are not configured on this deployment.");
  }

  const rejection = rejectFile(file);
  if (rejection) throw new ReviewPhotoError(rejection);

  let pair;
  try {
    pair = await encodeVariants(file, REVIEW_IMAGE);
  } catch {
    throw new ReviewPhotoError("That image could not be read. Try a different photo.");
  }

  // One id for both halves, so they land in the same folder in the bucket and
  // a photograph is one thing to find rather than two.
  const group = randomGroup();

  const [thumbUrl, fullUrl] = await Promise.all([
    put(pair.thumb.blob, "thumb", group),
    put(pair.full.blob, "full", group),
  ]);

  return { thumbUrl, fullUrl, width: pair.full.width, height: pair.full.height };
}
