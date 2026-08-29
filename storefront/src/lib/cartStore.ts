import { readCart, writeCart, type CartItem } from "@/lib/cart";

/**
 * The bag as an EXTERNAL STORE (requirements section 6).
 *
 * `localStorage` is not React state — it is a thing outside React that can
 * change without React being told, including from another tab. Modelling it as
 * an external store rather than as `useState` seeded by an effect is what
 * `useSyncExternalStore` exists for, and it removes two problems the effect
 * version had:
 *
 *  - **No cascading render on load.** An effect that reads storage and calls
 *    `setState` renders the whole app twice on every page load, once with an
 *    empty bag. Here the very first render already has the real bag, so the
 *    header badge never flashes empty and there is no "ready" flag to thread
 *    through the UI.
 *  - **One subscription, not one per consumer.** The `storage` event is
 *    listened to once, however many components read the bag.
 *
 * The snapshot is read once at module load and then only ever replaced, so
 * `getCartSnapshot` is pure and returns a stable reference between renders —
 * which is what React requires of it, and what stops it looping.
 */

let snapshot: CartItem[] = readCart();

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Another tab changed the bag. `key` is null when the whole store is cleared. */
function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key === "velora.cart.v1") {
    snapshot = readCart();
    emit();
  }
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function getCartSnapshot(): CartItem[] {
  return snapshot;
}

/**
 * The bag when there is no browser to read it from.
 *
 * The storefront is a pure SPA and never server-renders, so this is only
 * reached by tooling — but `useSyncExternalStore` requires it, and an empty bag
 * is the honest answer: a server has no access to this visitor's storage, and
 * returning anything else would be a hydration mismatch waiting to happen. The
 * array is shared so the reference stays stable between calls, which is what
 * React requires of a snapshot.
 */
const EMPTY: CartItem[] = [];

export function getCartServerSnapshot(): CartItem[] {
  return EMPTY;
}

/**
 * The ONE write path. State and storage move together, so a tab and the stored
 * bag can never disagree, and every mutation goes through the pure helpers in
 * `lib/cart.ts` rather than editing the array in place.
 */
export function updateCart(next: (current: CartItem[]) => CartItem[]): void {
  const updated = next(snapshot);
  if (updated === snapshot) return;
  snapshot = updated;
  writeCart(updated);
  emit();
}
