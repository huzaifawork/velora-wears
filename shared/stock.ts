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

/**
 * At or below this many units, a piece is running low. It is admin-configurable
 * (`settings.low_stock_threshold`); this is what to use when settings have not
 * loaded yet or a row is missing, and it is the same number the SQL view falls
 * back to. Changing it means changing the view as well.
 */
export const FALLBACK_LOW_STOCK_THRESHOLD = 4;

/**
 * Every size the shop sells, in the order they are always shown.
 *
 * `Record<Size, SizeStock>` is an unordered map, so something has to decide the
 * order — and it belongs in shared code rather than in the storefront, because
 * the admin dashboard edits per-size stock and has to show the same three in
 * the same order. `storefront/src/lib/sizes.ts` re-exports these two so the
 * order is not decided twice.
 */
export const SIZES: readonly Size[] = ["S", "M", "L"];

/** Full names, for labels and screen readers — the letter alone reads poorly. */
export const SIZE_LABELS: Record<Size, string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
};

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

/** Total units across every size. What a list view's badge counts. */
export function totalStock(sizes: Record<Size, SizeStock> | undefined): number {
  if (!sizes) return 0;
  return SIZES.reduce((sum, size) => sum + Math.max(0, sizes[size]?.stock ?? 0), 0);
}

/** Stock in one size. Zero for a size that does not exist on the record. */
export function stockInSize(sizes: Record<Size, SizeStock> | undefined, size: Size): number {
  return Math.max(0, sizes?.[size]?.stock ?? 0);
}

/**
 * The sizes a visitor can actually buy. Section 11 requires that an
 * out-of-stock size is not purchasable AND that the visitor is told — a page
 * that lists "Small, Medium and Large" under a piece whose Medium is gone has
 * failed the second half while passing the first.
 */
export function availableSizes(sizes: Record<Size, SizeStock> | undefined): Size[] {
  return SIZES.filter((size) => stockInSize(sizes, size) > 0);
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
