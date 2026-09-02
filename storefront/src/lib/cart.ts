import type { Product, Settings, Size } from "@shared/types";
import { MAX_ORDER_LINES, MAX_QTY_PER_LINE } from "@shared/checkout";
import { isPlausibleSizeCode } from "@/lib/sizes";
import { stockInSize } from "@shared/stock";

/**
 * The bag (requirements section 6) — storage, validation and arithmetic.
 *
 * THE CART HAS NO SERVER. Every client write to the database is denied by row
 * level security, and a bag is per-visitor state that nothing else needs, so it
 * lives in `localStorage` on the visitor's own device. It is handed to the
 * `place-order` Edge Function only at checkout.
 *
 * That shapes the two rules this module exists to enforce:
 *
 *  1. **A stored line holds identity only** — product id, slug, size, quantity.
 *     It never holds a price, a name or an image. Those are re-read from the
 *     catalog every time the bag is rendered, so a price the admin changes is
 *     right the moment it changes, and a bag left open for a week cannot show
 *     last week's total. Requirements section 17 has the SERVER recompute every
 *     total from stored prices; a client that cached one would only ever be
 *     disagreeing with it.
 *  2. **Anything read back out is untrusted input.** Storage is plain text the
 *     visitor can edit, so `readCart` validates every field and drops what does
 *     not typecheck, rather than handing the rest of the app a negative
 *     quantity (section 17 — reject malformed or oversized input).
 *
 * The stored line is deliberately a superset of the `items` in
 * `PlaceOrderInput`, so checkout in section 7 can hand it almost straight to
 * the `place-order` Edge Function — drop `slug` and it is the payload.
 */

/** One line in the bag: a product in a size. Identity only — never a price. */
export interface CartItem {
  productId: string;
  /** Kept so the bag can re-read the product without an id-to-slug lookup. */
  slug: string;
  size: Size;
  qty: number;
}

const STORAGE_KEY = "velora.cart.v1";

/**
 * Caps. A bag is a shopping list, not a bulk order channel, and these are the
 * client half of the reject-oversized-input rule (section 17). The server
 * applies the SAME two limits independently, in the place-order Edge Function
 * and in `place_order()`, so they now live in `shared/checkout.ts` with the
 * rest of the order payload contract rather than being declared twice.
 */
export { MAX_QTY_PER_LINE };
export const MAX_LINES = MAX_ORDER_LINES;

/** Two lines are the same line when they are the same product in the same size. */
function sameLine(a: CartItem, b: { productId: string; size: Size }): boolean {
  return a.productId === b.productId && a.size === b.size;
}

function clampQty(qty: number, max = MAX_QTY_PER_LINE): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.min(Math.max(Math.trunc(qty), 1), Math.max(1, max));
}

/** Validates one parsed entry. Returns null for anything that is not a real line. */
function parseItem(raw: unknown): CartItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { productId, slug, size, qty } = raw as Record<string, unknown>;

  if (typeof productId !== "string" || productId.length === 0 || productId.length > 128) {
    return null;
  }
  if (typeof slug !== "string" || slug.length === 0 || slug.length > 128) return null;
  // A SHAPE check, not a membership one. There is no global list of sizes to
  // check against any more — which sizes exist is a question about a PRODUCT,
  // and this function has not looked one up yet. `buildCart` below resolves
  // every line against real stock and marks an impossible one "sold-out", so a
  // hand-edited size reaches the bag and is then refused there, with a message,
  // rather than vanishing out of it without explanation.
  if (!isPlausibleSizeCode(size)) return null;
  if (typeof qty !== "number") return null;

  return { productId, slug, size: size as Size, qty: clampQty(qty) };
}

/**
 * The bag as stored. Never throws: a corrupt or hand-edited value yields an
 * empty bag rather than a page that will not render. Storage itself throws in
 * a handful of real browsers — private mode, and anywhere the visitor has
 * blocked site data — so every access is guarded.
 */
export function readCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const items: CartItem[] = [];
    for (const entry of parsed) {
      const item = parseItem(entry);
      // A duplicate line is a merge, not a second row — the same thing
      // `addToCart` guarantees on the way in.
      if (item && !items.some((held) => sameLine(held, item))) items.push(item);
      if (items.length >= MAX_LINES) break;
    }
    return items;
  } catch {
    return [];
  }
}

/** Persists the bag. A failure here must never break the interaction. */
export function writeCart(items: CartItem[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_LINES)));
  } catch {
    /* Storage full, or blocked. The in-memory bag still works for this visit. */
  }
}

/* --------------------------------------------------------------------------
 * Mutations. All pure: they take the bag and return the next one, so the
 * provider stays a thin wrapper and the rules are testable on their own.
 * ----------------------------------------------------------------------- */

export function addToCart(
  items: CartItem[],
  line: { productId: string; slug: string; size: Size },
  qty = 1,
  /** Stock for that size right now, so a bag can never exceed what exists. */
  available = MAX_QTY_PER_LINE,
): CartItem[] {
  const cap = Math.min(MAX_QTY_PER_LINE, Math.max(0, available));
  if (cap === 0) return items;

  const existing = items.find((held) => sameLine(held, line));
  if (existing) {
    return items.map((held) =>
      sameLine(held, line) ? { ...held, qty: clampQty(held.qty + qty, cap) } : held,
    );
  }

  if (items.length >= MAX_LINES) return items;
  return [...items, { ...line, qty: clampQty(qty, cap) }];
}

export function setCartQty(
  items: CartItem[],
  line: { productId: string; size: Size },
  qty: number,
  available = MAX_QTY_PER_LINE,
): CartItem[] {
  // Stepping below one is how a visitor removes a line, and it is what they
  // mean by it (requirements section 6 — update the quantity OR remove).
  if (qty < 1) return removeFromCart(items, line);
  const cap = Math.min(MAX_QTY_PER_LINE, Math.max(1, available));
  return items.map((held) => (sameLine(held, line) ? { ...held, qty: clampQty(qty, cap) } : held));
}

export function removeFromCart(
  items: CartItem[],
  line: { productId: string; size: Size },
): CartItem[] {
  return items.filter((held) => !sameLine(held, line));
}

/** Total number of garments in the bag — what the header badge counts. */
export function cartCount(items: CartItem[]): number {
  return items.reduce((n, item) => n + item.qty, 0);
}

/* --------------------------------------------------------------------------
 * Hydration and arithmetic.
 * ----------------------------------------------------------------------- */

/**
 * Why a line cannot be ordered as it stands. Requirements section 11 is
 * explicit that an unavailable option must not be purchasable, and a bag can
 * sit for days while the admin retires a piece or it sells out underneath it.
 */
export type CartLineProblem = "gone" | "sold-out" | "reduced";

/** A stored line joined to the live catalog — this is what the UI renders. */
export interface CartLine {
  item: CartItem;
  /** Null when the piece has been retired or the slug no longer resolves. */
  product: Product | null;
  /** Read from the catalog on every render. Never from storage. */
  unitPrice: number;
  /** Stock remaining in THIS line's size, right now. */
  available: number;
  problem?: CartLineProblem;
  /** The quantity if it can be fulfilled, otherwise what is actually there. */
  orderableQty: number;
  lineTotal: number;
}

export interface CartTotals {
  lines: CartLine[];
  subtotal: number;
  deliveryCharge: number;
  total: number;
  /** Garments counted across orderable lines. */
  count: number;
  /** True when anything in the bag blocks checkout (section 11). */
  hasProblems: boolean;
  /** How much more buys free delivery. Null when it is not offered or the bag is empty. */
  freeDeliveryRemaining: number | null;
}

/**
 * Joins the stored bag to the catalog and does the money.
 *
 * Pure, and the ONE place the bag is priced: the drawer, the cart page and the
 * header badge all read this, so the mini bag and the full bag cannot disagree
 * about a total (requirements section 18).
 */
export function buildCart(
  items: CartItem[],
  products: Map<string, Product | null>,
  settings: Settings | null | undefined,
): CartTotals {
  const lines: CartLine[] = items.map((item) => {
    const product = products.get(item.slug) ?? null;

    if (!product) {
      return {
        item,
        product: null,
        unitPrice: 0,
        available: 0,
        problem: "gone",
        orderableQty: 0,
        lineTotal: 0,
      };
    }

    const available = stockInSize(product.sizes, item.size);
    const orderableQty = Math.min(item.qty, available);
    const problem: CartLineProblem | undefined =
      available === 0 ? "sold-out" : orderableQty < item.qty ? "reduced" : undefined;

    return {
      item,
      product,
      unitPrice: product.price,
      available,
      problem,
      orderableQty,
      lineTotal: product.price * orderableQty,
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const count = lines.reduce((n, line) => n + line.orderableQty, 0);

  /**
   * Delivery is admin-configured (requirements section 10) and shown here so
   * the bag's total is the real one. The SERVER recomputes it at checkout —
   * this is display, never the figure an order is written from (section 17).
   */
  const threshold = settings?.freeDeliveryThreshold;
  const qualifies = threshold !== undefined && subtotal >= threshold;
  const deliveryCharge = subtotal === 0 || qualifies ? 0 : (settings?.deliveryCharge ?? 0);

  return {
    lines,
    subtotal,
    deliveryCharge,
    total: subtotal + deliveryCharge,
    count,
    hasProblems: lines.some((line) => line.problem !== undefined),
    freeDeliveryRemaining:
      threshold === undefined || subtotal === 0 ? null : Math.max(0, threshold - subtotal),
  };
}
