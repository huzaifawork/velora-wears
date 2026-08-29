import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import type { Size } from "@shared/types";
import { CartContext, type CartApi } from "@/features/cart/CartContext";
import {
  addToCart,
  cartCount,
  removeFromCart,
  setCartQty,
  type CartItem,
} from "@/lib/cart";
import {
  getCartServerSnapshot,
  getCartSnapshot,
  subscribeCart,
  updateCart,
} from "@/lib/cartStore";

/**
 * Holds the bag for the whole app (requirements section 6).
 *
 * It is a thin wrapper by design. The rules live in `lib/cart.ts` (pure), the
 * storage lives in `lib/cartStore.ts` (the external store), and this component
 * only binds the two to React and carries the drawer's open state — which is
 * genuinely React state, because it is not persisted anywhere.
 *
 * `useSyncExternalStore` means the first render already has the real bag, so
 * nothing has to guard against a moment where the bag "is not ready yet".
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribeCart, getCartSnapshot, getCartServerSnapshot);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const api = useMemo<CartApi>(
    () => ({
      items,
      count: cartCount(items),

      add: (line: { productId: string; slug: string; size: Size }, qty = 1, available?: number) =>
        updateCart((current: CartItem[]) => addToCart(current, line, qty, available)),

      setQty: (line: { productId: string; size: Size }, qty: number, available?: number) =>
        updateCart((current: CartItem[]) => setCartQty(current, line, qty, available)),

      remove: (line: { productId: string; size: Size }) =>
        updateCart((current: CartItem[]) => removeFromCart(current, line)),

      removeMany: (lines: Array<{ productId: string; size: Size }>) =>
        updateCart((current: CartItem[]) =>
          lines.reduce((held, line) => removeFromCart(held, line), current),
        ),

      clear: () => updateCart(() => []),

      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    }),
    [items, drawerOpen],
  );

  return <CartContext value={api}>{children}</CartContext>;
}
