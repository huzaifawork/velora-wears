/**
 * Sizes — re-exported from `shared/sizes.ts`, which is where they are defined.
 *
 * **This file used to re-export a global `SIZES` and `SIZE_LABELS`**, back when
 * the shop sold everything in Small, Medium and Large. There is no global list
 * any more: a product names a SIZE SCALE and its stock rows name codes on it,
 * so the ordered list of sizes belongs to a product rather than to the shop.
 * See `shared/sizes.ts` for the reasoning.
 *
 * The order and the wording are still not the storefront's to decide alone —
 * the admin dashboard edits per-size stock and has to show the same sizes in
 * the same order — which is why the definition stayed in `shared/` and this
 * file only forwards it.
 */
export {
  DEFAULT_SIZE_SCALE,
  SIZE_SCALES,
  SIZE_SCALE_LIST,
  isPlausibleSizeCode,
  orderLineSize,
  orderSizeCodes,
  scaleSizeCodes,
  sizeLabel,
  sizeScale,
  sizeShort,
} from "@shared/sizes";

export type { Size, SizeOption, SizeScale, SizeScaleId } from "@shared/sizes";
