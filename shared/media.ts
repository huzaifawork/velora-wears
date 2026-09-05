/**
 * Velora Wears — the IMAGE VARIANT contract (requirements section 19).
 *
 * Requirements section 19 asks the admin dashboard for one specific, concrete
 * thing: "the admin dashboard must write both image variants (`thumb_url` and
 * `full_url`) when uploading product images". `product_images` and
 * `site_images` both carry the two columns, and the storefront reads the small
 * one in every grid and the large one only in a detail gallery.
 *
 * What neither the schema nor that sentence pins down is HOW BIG each variant
 * is — and that number is needed in two places that must agree:
 *
 *   - the ADMIN's encoder, which resizes and re-encodes a 4 MB phone photo
 *     before it is uploaded;
 *   - the STOREFRONT's `<Image>`, which declares `width`/`height` so the
 *     browser reserves the space and the page does not shift as images arrive.
 *
 * If the encoder writes 800px thumbs while the cards declare 600, every card
 * reserves the wrong box. So the dimensions live here, once, in shared code —
 * the same discipline `shared/stock.ts` holds the "low stock" rule to after it
 * had drifted into three different definitions.
 *
 * The existing committed demo art already matches these numbers exactly
 * (`storefront/src/lib/demoData.ts` — `IMAGE_SIZE`), so nothing about the
 * current storefront changes by adopting them.
 */

export interface ImageVariantSpec {
  /** Longest-edge box the encoder fits the image into, preserving aspect ratio. */
  width: number;
  height: number;
  /** WebP quality, 0-1. Passed straight to `canvas.toBlob`. */
  quality: number;
}

/**
 * PRODUCT imagery — a 3:4 portrait crop, which is what `ProductCard` and the
 * detail gallery both render.
 *
 * `thumb` is what every grid in the shop downloads. At 600x800 WebP it lands
 * around 30-60 KB, which is the difference between a product page that opens
 * instantly on a phone and one that pulls eight full-resolution files.
 */
export const PRODUCT_IMAGE = {
  thumb: { width: 600, height: 800, quality: 0.82 },
  full: { width: 1100, height: 1467, quality: 0.86 },
} as const satisfies Record<"thumb" | "full", ImageVariantSpec>;

/**
 * LANDING PAGE imagery — the hero and the promo banners.
 *
 * Wider than a product shot and larger at full size, because the hero is the
 * page's largest paint and is the one image the storefront loads eagerly.
 */
export const SITE_IMAGE = {
  thumb: { width: 640, height: 800, quality: 0.82 },
  full: { width: 1600, height: 2000, quality: 0.86 },
} as const satisfies Record<"thumb" | "full", ImageVariantSpec>;

/**
 * A REVIEW photograph — a customer's own picture of the piece they bought
 * (the client's 2026-09-05 change: anyone may review, and attach photos).
 *
 * Smaller than product imagery on both counts, for two reasons that pull the
 * same way. These are snapshots taken on a phone in a bedroom, not styled
 * studio shots, so there is no detail past 1200px worth carrying; and unlike a
 * product image — uploaded once by an admin over office wifi — these are
 * uploaded by a customer, on mobile data, through an Edge Function that has to
 * hold the whole file in memory. `full` lands around 100-150 KB, which is the
 * difference between an attachment that works on a train and one that times
 * out.
 *
 * `thumb` is square-ish on purpose: review photos are rendered as a small
 * strip of tiles under the comment, so the grid wants a consistent tile and
 * the lightbox is what shows the whole picture.
 */
export const REVIEW_IMAGE = {
  thumb: { width: 400, height: 400, quality: 0.78 },
  full: { width: 1200, height: 1200, quality: 0.8 },
} as const satisfies Record<"thumb" | "full", ImageVariantSpec>;

/**
 * How many photographs may hang off ONE review.
 *
 * Four is a strip that fits on a phone in one row of tiles without wrapping
 * into a gallery, and it is enough to show the fit, the fabric and the colour —
 * the three things a photograph adds to a written review. It is also the cap
 * the Edge Function enforces (`supabase/functions/upload-review-photo`) and the
 * one `reviews.photos` is CHECKed against, so a client that ignores it gets
 * nowhere.
 */
export const MAX_REVIEW_PHOTOS = 4;

/** Everything the uploader accepts. The `media` bucket enforces the same list. */
export const ACCEPTED_IMAGE_TYPES: readonly string[] = [
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/avif",
];

/**
 * The largest file the uploader will read, before compression. The bucket
 * rejects anything over 5 MB AFTER compression; this is the guard on the way
 * in, so a 40 MB raw camera file is refused with a sentence rather than
 * freezing a tab while it is decoded.
 */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** The Storage bucket both applications read images out of. */
export const MEDIA_BUCKET = "media";
