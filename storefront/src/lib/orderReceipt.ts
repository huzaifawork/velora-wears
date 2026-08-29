import type { Size } from "@shared/types";

/**
 * The receipt — what the confirmation page knows about the order that was just
 * placed (requirements section 7: a success page after the order is confirmed).
 *
 * **It has to be held on the client, because the client cannot read the order
 * back.** `orders` is invisible to the anon key by design — customer name,
 * phone and address are in it, and section 17 requires that personal data is
 * never publicly readable. So there is no "fetch order by number" to call: the
 * only moment the storefront ever sees this order is the response to
 * `place-order`, and this module is where that moment is kept.
 *
 * `sessionStorage`, not router state, and not `localStorage`:
 *
 *  - router state alone is lost on a refresh, and a customer refreshing the
 *    page that says their order worked is not a rare thing to do;
 *  - `localStorage` would still be showing the confirmation weeks later, on a
 *    tab that has nothing to do with it. A receipt is for this visit.
 *
 * The customer's name, phone and address are deliberately NOT stored. The
 * confirmation only needs to prove the order landed and say where it is going
 * in the broadest terms; keeping the rest in browser storage would leave
 * personal data lying around for no benefit (section 17).
 */

/** One line as it was ordered. Prices are the catalog's at the moment of the order. */
export interface ReceiptLine {
  name: string;
  slug: string;
  thumb: string;
  size: Size;
  qty: number;
  unitPrice: number;
}

export interface OrderReceipt {
  orderId: string;
  orderNumber: string;
  /** The SERVER's total. Never the browser's arithmetic (section 17). */
  total: number;
  /**
   * Grants review access to a guest, who has no account to prove anything with
   * (requirements section 16). Section 16's review flow reads it from here; it
   * is not shown on the page.
   */
  reviewToken: string;
  /** Where the order is going — the city only, for a line of reassurance. */
  city: string;
  /** Where the confirmation was sent. Shown so a typo is noticed immediately. */
  email: string;
  lines: ReceiptLine[];
  placedAt: number;
}

const STORAGE_KEY = "velora.order.v1";

/** Never throws: private mode and blocked site data both make storage fail. */
export function saveReceipt(receipt: OrderReceipt): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(receipt));
  } catch {
    /* The confirmation still renders from router state for this navigation. */
  }
}

/**
 * The stored receipt, or null. Like the bag, anything read back out of storage
 * is untrusted input, so a value that does not typecheck reads as "no receipt"
 * rather than rendering a broken confirmation (section 17).
 */
export function readReceipt(): OrderReceipt | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const receipt = parsed as Partial<OrderReceipt>;
    if (
      typeof receipt.orderNumber !== "string" ||
      receipt.orderNumber.length === 0 ||
      typeof receipt.total !== "number" ||
      !Array.isArray(receipt.lines)
    ) {
      return null;
    }

    return receipt as OrderReceipt;
  } catch {
    return null;
  }
}

export function clearReceipt(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to do — a receipt that cannot be cleared expires with the tab. */
  }
}

/** What the lines came to, before delivery. Derived, never stored twice. */
export function receiptSubtotal(receipt: OrderReceipt): number {
  return receipt.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}
