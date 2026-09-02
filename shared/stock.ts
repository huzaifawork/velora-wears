/**
 * Velora Wears — the STOCK rules (requirements section 11).
 *
 * Section 11 asks for four things: that stock is tracked, that availability is
 * displayed, that a badge says which of in stock / low stock / out of stock a
 * piece is, and that an unavailable product **or size** cannot be purchased.
 * Three of those are display, and display is where a shop quietly starts lying:
 * the number is right in the database and the word next to it is decided
 * somewhere else.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE EXISTS BECAUSE THE WORD "LOW" HAD THREE DEFINITIONS.
 * ---------------------------------------------------------------------------
 * Before it:
 *
 *   the `product_summaries` VIEW   low_stock = total > 0 and total <= threshold
 *   `lib/demoData.ts`              lowStock  = total > 0 and total <= threshold + 1
 *   `SizeSelector`                 "only N left" when stock <= threshold
 *
 * With the shipped threshold of 4, a piece with 5 left was **"Low stock" in
 * demo mode and "In stock" against the database**. The badge changed meaning
 * when `VITE_DATA_SOURCE` flipped, which is the one thing a badge must not do,
 * and nothing would have caught it: both readings are individually plausible.
 *
 * So the rule is written once, here, and the fallback threshold is written once
 * too. The SQL view is the fourth copy and cannot import TypeScript — the drift
 * check described in the section 11 notes in `context.md` reads the migration as
 * text and asserts it still agrees, the same way the checkout rules are held to
 * the Edge Function.
 *
 * **Developer B needs this file too.** The admin dashboard decides what to
 * highlight as running low, and an admin told a piece is fine while the shop
 * shows customers "Low stock" has been given the worse of the two answers.
 */

import type { Size, SizeStock } from "./types";
import { orderSizeCodes } from "./sizes";

/**
 * At or below this many units, a piece is running low. It is admin-configurable
 * (`settings.low_stock_threshold`); this is what to use when settings have not
 * loaded yet or a row is missing, and it is the same number the SQL view falls
 * back to. Changing it means changing the view as well.
 */
export const FALLBACK_LOW_STOCK_THRESHOLD = 4;

/* ---------------------------------------------------------------------------
 * WHERE `SIZES` AND `SIZE_LABELS` WENT
 * ---------------------------------------------------------------------------
 * They used to live here: one frozen `["S", "M", "L"]` and one label map, read
 * by every screen. They are gone, and their absence is the point.
 *
 * There is no longer a single list of sizes the shop sells, because a sneaker
 * and a shirt are not measured on the same scale. The ordered list belongs to a
 * PRODUCT — it is that product's own stock rows, put into the order of its
 * scale — so every function below that used to close over the global list now
 * takes the sizes map (and, where order matters, the scale) as an argument.
 *
 * Wording moved to `sizeLabel()` / `sizeShort()` in `shared/sizes.ts`, which
 * need the scale to answer at all: "42" is "EU 42" on a shoe and "42 inch
 * waist" on a trouser, and a global map cannot know which.
 * ------------------------------------------------------------------------ */

export type StockLevel = "out-of-stock" | "low-stock" | "in-stock";

/**
 * The one definition. `quantity` is a TOTAL for a product on a list surface and
 * a SINGLE SIZE's stock on the product page — deliberately the same rule for
 * both, because "only 2 left" means the same thing to a customer whichever it
 * is counting, and two thresholds would need a second admin setting to
 * configure.
 */
export function stockLevel(
  quantity: number,
  threshold: number = FALLBACK_LOW_STOCK_THRESHOLD,
): StockLevel {
  if (!Number.isFinite(quantity) || quantity <= 0) return "out-of-stock";
  return quantity <= Math.max(0, threshold) ? "low-stock" : "in-stock";
}

/** The badge wording, one definition for every surface that shows one. */
export const STOCK_LEVEL_LABEL: Record<StockLevel, string> = {
  "out-of-stock": "Sold out",
  "low-stock": "Low stock",
  "in-stock": "In stock",
};

/**
 * Total units across every size the product is sold in. What a list view's
 * badge counts.
 *
 * Sums the map itself rather than a fixed list of keys — with scales, the keys
 * ARE the answer to "which sizes does this come in", and a product on the
 * one-size scale has exactly one of them.
 */
export function totalStock(sizes: Record<Size, SizeStock> | undefined): number {
  if (!sizes) return 0;
  return Object.values(sizes).reduce((sum, entry) => sum + Math.max(0, entry?.stock ?? 0), 0);
}

/**
 * Stock in one size. Zero for a size the product is not sold in at all, which
 * is the same answer as a size that is sold out — deliberately, because the
 * question this answers is "can one be bought", and both mean no. Use
 * `offeredSizes()` when the difference matters.
 */
export function stockInSize(sizes: Record<Size, SizeStock> | undefined, size: Size): number {
  return Math.max(0, sizes?.[size]?.stock ?? 0);
}

/**
 * Every size this product is SOLD in, in its scale's order — sold out ones
 * included. What the product page draws a button for.
 *
 * The keys of the map are the offered sizes (see `Product.sizes`); this only
 * decides what order they come in, which is why it needs the scale.
 */
export function offeredSizes(
  sizes: Record<Size, SizeStock> | undefined,
  scaleId: string | undefined,
): Size[] {
  return orderSizeCodes(scaleId, Object.keys(sizes ?? {}));
}

/**
 * The sizes a visitor can actually buy — offered AND in stock. Section 11
 * requires that an out-of-stock size is not purchasable AND that the visitor is
 * told; a page that lists "Small, Medium and Large" under a piece whose Medium
 * is gone has failed the second half while passing the first.
 */
export function availableSizes(
  sizes: Record<Size, SizeStock> | undefined,
  scaleId: string | undefined,
): Size[] {
  return offeredSizes(sizes, scaleId).filter((size) => stockInSize(sizes, size) > 0);
}

/**
 * "Small and Large", "Small, Medium and Large", "None". English lists, because
 * the alternative is a row of struck-through letters restating what the size
 * buttons directly above already say.
 */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
