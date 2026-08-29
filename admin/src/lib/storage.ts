import { MEDIA_BUCKET, type ImageVariantSpec } from "@shared/media";
import { encodeVariants } from "@admin/lib/image";
import { describeError } from "@admin/lib/errors";
import { getSupabase } from "@admin/lib/supabase";

/**
 * Supabase Storage — uploading and removing the shop's images.
 *
 * The bucket (`media`) and the policies that let an admin write to it are
 * created in `supabase/migrations/20260830000001_admin_dashboard.sql`. It is
 * PUBLIC for reading, because every image in it is already on a public web
 * page; writing is gated on `is_admin()` like everything else.
 *
 * Paths say what an object belongs to, which matters when something has to be
 * cleaned up by hand a year from now:
 *
 *     products/<product-id>/<random>-thumb.webp
 *     site/<slot>/<random>-full.webp
 *
 * The random middle segment is what makes a REPLACEMENT safe. Overwriting
 * `hero.webp` in place would leave every CDN edge and every browser holding the
 * old picture under a URL that now means something else; a new name means the
 * new image is visible immediately and the old one can be deleted on its own
 * schedule.
 */

export interface UploadedImage {
  thumbUrl: string;
  fullUrl: string;
  /** Dimensions of the FULL variant — what the storefront reserves space for. */
  width: number;
  height: number;
  originalBytes: number;
  uploadedBytes: number;
}

function randomName(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

async function put(path: string, blob: Blob): Promise<string> {
  const storage = getSupabase().storage.from(MEDIA_BUCKET);

  const { error } = await storage.upload(path, blob, {
    contentType: blob.type,
    // A year, because the path is unique per upload — the bytes at a given URL
    // never change, so there is nothing for a cache to get wrong.
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) throw new Error(describeError(error));

  return storage.getPublicUrl(path).data.publicUrl;
}

/**
 * Compress, resize, and upload BOTH variants of one image (§19).
 *
 * The two uploads run in parallel; if the second fails the first is deleted
 * before the error is re-thrown, so a failed upload never leaves an orphaned
 * half-pair sitting in the bucket costing storage and referenced by nothing.
 */
export async function uploadImagePair({
  file,
  folder,
  specs,
  onProgress,
}: {
  file: File;
  /** e.g. `products/<id>` or `site/hero`. No leading or trailing slash. */
  folder: string;
  specs: { thumb: ImageVariantSpec; full: ImageVariantSpec };
  /** Called with `encoding` then `uploading`, for the progress indicator. */
  onProgress?: (stage: "encoding" | "uploading") => void;
}): Promise<UploadedImage> {
  onProgress?.("encoding");
  const pair = await encodeVariants(file, specs);

  onProgress?.("uploading");
  const base = `${folder}/${randomName()}`;
  const thumbPath = `${base}-thumb.${pair.thumb.extension}`;
  const fullPath = `${base}-full.${pair.full.extension}`;

  const thumbUrl = await put(thumbPath, pair.thumb.blob);

  let fullUrl: string;
  try {
    fullUrl = await put(fullPath, pair.full.blob);
  } catch (error) {
    await removeByPath([thumbPath]).catch(() => undefined);
    throw error;
  }

  return {
    thumbUrl,
    fullUrl,
    width: pair.full.width,
    height: pair.full.height,
    originalBytes: pair.originalBytes,
    uploadedBytes: pair.thumb.blob.size + pair.full.blob.size,
  };
}

/**
 * Compress, resize and upload ONE variant.
 *
 * For `categories.thumb`, which is a single column rather than a pair: the
 * storefront renders a category tile at card size and never opens a full-size
 * version of it, so producing one would be a file nothing ever requests.
 * Everything with a detail view — products, the hero, the banners — uses
 * `uploadImagePair` above and gets both (§19).
 */
export async function uploadSingleImage({
  file,
  folder,
  spec,
  onProgress,
}: {
  file: File;
  folder: string;
  spec: ImageVariantSpec;
  onProgress?: (stage: "encoding" | "uploading") => void;
}): Promise<{ url: string; width: number; height: number }> {
  onProgress?.("encoding");
  const pair = await encodeVariants(file, { thumb: spec, full: spec });

  onProgress?.("uploading");
  const path = `${folder}/${randomName()}-thumb.${pair.thumb.extension}`;
  const url = await put(path, pair.thumb.blob);

  return { url, width: pair.thumb.width, height: pair.thumb.height };
}

/**
 * The storage path inside `media` for one of our public URLs, or `undefined`
 * for a URL that did not come from this bucket.
 *
 * That second case is not defensive noise: the storefront's committed demo art
 * (`/products/...webp`) and any image an admin pastes in by hand are perfectly
 * valid `thumb_url` values that this bucket knows nothing about. Trying to
 * delete one has to be a no-op, not an error.
 */
export function storagePathOf(publicUrl: string): string | undefined {
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const at = publicUrl.indexOf(marker);
  if (at === -1) return undefined;
  return decodeURIComponent(publicUrl.slice(at + marker.length));
}

async function removeByPath(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await getSupabase().storage.from(MEDIA_BUCKET).remove(paths);
  if (error) throw new Error(describeError(error));
}

/**
 * Delete the files behind a set of public URLs. Anything not in our bucket is
 * skipped.
 *
 * CALLERS SHOULD NOT AWAIT THIS BEFORE REPORTING SUCCESS. Removing the database
 * row is what removes the image from the shop; deleting the bytes is
 * housekeeping. An admin whose delete "failed" because a storage cleanup
 * errored — while the product is already gone from the site — has been told
 * something untrue about their own shop.
 */
export async function deleteImageFiles(urls: readonly string[]): Promise<void> {
  const paths = urls
    .map(storagePathOf)
    .filter((path): path is string => typeof path === "string");

  await removeByPath(paths);
}
