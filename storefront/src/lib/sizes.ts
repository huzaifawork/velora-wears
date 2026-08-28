import type { Size } from "@shared/types";

/**
 * Sizes, in the order they are always shown (requirements section 4 — Small,
 * Medium, Large).
 *
 * `Record<Size, SizeStock>` is an unordered map, so something has to decide the
 * order the options appear in. That decision lives here, once: the product
 * detail page's size selector, the cart lines (section 6) and the stock
 * displays (section 11) must all agree, and iterating `Object.keys` would leave
 * the order up to whatever wrote the record.
 */
export const SIZES: readonly Size[] = ["S", "M", "L"];

/** Full names, for labels and screen readers — the letter alone reads poorly. */
export const SIZE_LABELS: Record<Size, string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
};
