/**
 * Sizes, in the order they are always shown (requirements section 4 — Small,
 * Medium, Large).
 *
 * **The definition moved to `shared/stock.ts` in section 11** and this file
 * re-exports it. The order and the names are not the storefront's to decide
 * alone: the admin dashboard edits per-size stock and must show the same three
 * in the same order, and `shared/stock.ts` needs the order itself to answer
 * "which sizes can actually be bought". Every existing import still works.
 */
export { SIZES, SIZE_LABELS } from "@shared/stock";
