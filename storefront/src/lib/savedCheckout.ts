import {
  CHECKOUT_LIMITS,
  cleanField,
  normalisePhone,
  type CheckoutDraft,
} from "@shared/checkout";

/**
 * The customer's delivery details, remembered on THIS DEVICE (client request,
 * 2026-09-04: "when the user fills in the fields and places the order, the next
 * time he comes his data is auto filled there and saved in localStorage").
 *
 * ---------------------------------------------------------------------------
 * This reverses a decision `CheckoutForm` used to state in its own notes — that
 * a name, phone number and home address should never sit in browser storage.
 * The client has asked for exactly that, so the trade is made deliberately and
 * with three limits on it rather than being made silently:
 *
 *  1. **It is opt-in and visible.** The form carries a "Save my details on this
 *     device" checkbox (the reference design's "Save this information for next
 *     time"). Unticking it CLEARS whatever was stored, so the customer has a
 *     way out on the same screen — see `CheckoutPage`.
 *  2. **Only the fields that repeat are kept.** The order note is not: it is
 *     about one delivery ("leave it with the guard"), and pre-filling the next
 *     order with it would attach an instruction the customer did not write.
 *  3. **It is saved only after an order actually lands**, never keystroke by
 *     keystroke, so an abandoned form leaves nothing behind.
 *
 * `localStorage`, not `sessionStorage`, because the whole point is the NEXT
 * visit — a receipt is for this visit (`lib/orderReceipt.ts` explains the other
 * side of that choice), and this is not.
 * ---------------------------------------------------------------------------
 *
 * Like the bag (`lib/cart.ts`), anything read back out of storage is untrusted
 * input: the visitor can edit it, and a build from six months ago may have
 * written a different shape. Every field is re-cleaned and re-bounded on the
 * way out, and anything that does not typecheck is dropped rather than handed
 * to the form (requirements section 17).
 */

/**
 * What is worth remembering: everything on the form except the per-order note.
 * These are exactly the fields the reference design's "Save this information"
 * checkbox sits under.
 */
export const REMEMBERED_FIELDS = [
  "fullName",
  "email",
  "phone",
  "address",
  "city",
  "postalCode",
] as const;

export type RememberedField = (typeof REMEMBERED_FIELDS)[number];

/** Partial on purpose — a stored value that no longer validates is simply absent. */
export type SavedCheckoutDetails = Partial<Record<RememberedField, string>>;

const STORAGE_KEY = "velora.checkout.v1";

/** One stored value, cleaned the way the form and the server would clean it. */
function parseField(field: RememberedField, raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;

  const value = field === "phone" ? normalisePhone(raw) : cleanField(raw);
  // Over-length is a hand-edited value, not a real one: dropped rather than
  // truncated, so the form never opens with half an address in it.
  if (value.length === 0 || value.length > CHECKOUT_LIMITS[field].max) return undefined;

  return value;
}

/**
 * The remembered details, or `null` when there are none to offer. Never throws:
 * private mode and blocked site data both make storage fail.
 */
export function readSavedCheckout(): SavedCheckoutDetails | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

    const stored = parsed as Record<string, unknown>;
    const details: SavedCheckoutDetails = {};

    for (const field of REMEMBERED_FIELDS) {
      const value = parseField(field, stored[field]);
      if (value !== undefined) details[field] = value;
    }

    // An empty object is the same as nothing stored, and saying so here keeps
    // every caller from having to count the keys itself.
    return Object.keys(details).length > 0 ? details : null;
  } catch {
    return null;
  }
}

/** Whether this device has details to offer — what the checkbox opens as. */
export function hasSavedCheckout(): boolean {
  return readSavedCheckout() !== null;
}

/**
 * Remember the details of an order that has just been placed.
 *
 * Takes the draft or the `OrderCustomer` that went to the server — both carry
 * the same field names — and stores only the remembered subset, cleaned. A
 * failure to write must never break the confirmation the customer is on their
 * way to.
 */
export function saveCheckout(details: Partial<CheckoutDraft>): void {
  const kept: SavedCheckoutDetails = {};
  for (const field of REMEMBERED_FIELDS) {
    const value = parseField(field, details[field]);
    if (value !== undefined) kept[field] = value;
  }

  if (Object.keys(kept).length === 0) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    /* Storage full, or blocked. This order is unaffected — nothing depends on it. */
  }
}

/** Forget them. What unticking the checkbox does, on the next order placed. */
export function clearSavedCheckout(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to do. Storage that cannot be written cannot be holding anything. */
  }
}
