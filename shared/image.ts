import {
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  type ImageVariantSpec,
} from "./media";

/**
 * Client-side image processing — resize and re-encode BEFORE anything is
 * uploaded.
 *
 * SHARED, and deliberately so: this used to live in `admin/src/lib/image.ts`
 * because the dashboard was the only thing in the project that accepted a
 * file. It has two callers now —
 *
 *   the ADMIN      uploading product and landing-page imagery (§19), straight
 *                  into the `media` bucket with an admin's own session.
 *   the STOREFRONT attaching photographs to a review, which a customer holding
 *                  nothing but the anon key cannot write to a bucket, so those
 *                  bytes go through the `upload-review-photo` Edge Function
 *                  instead (`storefront/src/lib/reviewPhotos.ts`).
 *
 * The two differ only in WHERE the encoded blob is sent. Resizing a phone
 * photograph is the same problem either way, and a second copy of it in the
 * storefront would be the same file with a different set of bugs.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BROWSER DOES THIS AND NOT THE SERVER
 * ---------------------------------------------------------------------------
 * Requirements section 19 asks the dashboard for both image variants, and the
 * dashboard brief asks that images be compressed before upload. There is no
 * image pipeline in this project — no Edge Function that transforms, no
 * transformation CDN in the plan — so the choice is: upload a 4 MB photograph
 * from a phone and serve it to every customer, or resize it here.
 *
 * For a review photograph the same arithmetic is the argument for letting a
 * customer attach one at all: a 4 MB camera file is refused by the bucket and
 * would be a cruel thing to ask a phone to upload over mobile data, while the
 * ~120 KB it comes out as here is not.
 *
 * A `<canvas>` does this in a few milliseconds with no dependency, no upload of
 * the original, and no server cost. A 4 MB JPEG straight off a camera comes out
 * as roughly a 40 KB thumbnail and a 250 KB full-size WebP — which is the
 * difference between a product grid that loads on a phone and one that does
 * not.
 *
 * ---------------------------------------------------------------------------
 * ASPECT RATIO IS PRESERVED. NOTHING IS CROPPED.
 * ---------------------------------------------------------------------------
 * The variant specs in `shared/media.ts` are a BOX to fit inside, not a shape
 * to force. Cropping to 3:4 automatically would be tidier in the grid and would
 * also, sooner or later, cut the top off a garment nobody checked. The
 * storefront renders these with `object-cover` inside its own fixed aspect box,
 * so it crops for DISPLAY while the stored file stays whole — which means an
 * admin who does not like the crop can re-shoot rather than having lost pixels
 * at upload time.
 *
 * The real output dimensions are measured and returned, so `product_images.
 * width`/`height` describe the file that actually exists.
 */

export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
  /** `webp` normally; `png` on a browser whose canvas cannot encode WebP. */
  extension: string;
}

export interface ImagePair {
  thumb: EncodedImage;
  full: EncodedImage;
  /** The original file's size, so the UI can show what the compression saved. */
  originalBytes: number;
}

/**
 * Rejects a file the encoder should not even open, with a sentence explaining
 * why. Returns `undefined` when the file is fine.
 *
 * The bucket enforces its own limits server-side (see the migration) — this is
 * the guard on the way IN, so a 40 MB raw camera file is refused with a message
 * rather than freezing the tab while it decodes.
 */
export function rejectFile(file: File): string | undefined {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `${file.name} is not an image the shop can use. Upload a JPEG, PNG, WebP or AVIF.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is too large to process in the browser. Export it under 12 MB and try again.`;
  }
  return undefined;
}

/**
 * Decode once, encode twice.
 *
 * `createImageBitmap` decodes off the main thread where it is supported, which
 * is every browser this dashboard targets; the `<img>` fallback exists because
 * a decode failure here means the admin cannot add a product at all.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through — some browsers refuse certain AVIF/progressive JPEGs here
      // but load them fine through an <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be read. It may be corrupt."));
      img.src = url;
    });
  } finally {
    // Revoked after the load resolves; the decoded pixels are already held by
    // the element, so the object URL is no longer needed.
    URL.revokeObjectURL(url);
  }
}

function sourceSize(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };
}

/**
 * The largest size that fits inside the box without distorting the image, and
 * never larger than the original — upscaling a small photograph produces a
 * bigger file with no more detail in it.
 */
function fitWithin(
  source: { width: number; height: number },
  box: { width: number; height: number },
): { width: number; height: number } {
  const scale = Math.min(box.width / source.width, box.height / source.height, 1);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(
  source: ImageBitmap | HTMLImageElement,
  spec: ImageVariantSpec,
): Promise<EncodedImage> {
  const size = fitWithin(sourceSize(source), spec);

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process images.");

  // Downscaling without this is visibly aliased on fabric texture, which is
  // most of what these photographs are.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, size.width, size.height);

  let blob = await toBlob(canvas, "image/webp", spec.quality);
  let extension = "webp";

  // A canvas that cannot encode WebP silently returns a PNG (or null). PNG is
  // large for a photograph but correct, and the bucket accepts it — a broken
  // upload would be worse than a heavy one.
  if (!blob || blob.type !== "image/webp") {
    blob = await toBlob(canvas, "image/png", 1);
    extension = "png";
  }

  if (!blob) throw new Error("That image could not be converted for upload.");

  return { blob, width: size.width, height: size.height, extension };
}

/**
 * One file in, both variants out (requirements section 19).
 *
 * The two are produced from a SINGLE decode, which is the whole reason this is
 * one function rather than two calls: decoding a 12-megapixel photograph twice
 * is the expensive half of the work.
 */
export async function encodeVariants(
  file: File,
  specs: { thumb: ImageVariantSpec; full: ImageVariantSpec },
): Promise<ImagePair> {
  const source = await decode(file);

  try {
    const [thumb, full] = await Promise.all([
      encode(source, specs.thumb),
      encode(source, specs.full),
    ]);
    return { thumb, full, originalBytes: file.size };
  } finally {
    if (!(source instanceof HTMLImageElement)) source.close();
  }
}

/**
 * A local preview URL for a file that has not been uploaded yet.
 *
 * The caller MUST revoke it (`URL.revokeObjectURL`) when the preview is gone —
 * an object URL pins the whole decoded file in memory until it is, and an admin
 * adding thirty product photographs in a session would otherwise hold every one
 * of them.
 */
export function previewUrl(file: File): string {
  return URL.createObjectURL(file);
}
