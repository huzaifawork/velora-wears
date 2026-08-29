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
