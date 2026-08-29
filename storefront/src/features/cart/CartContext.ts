import { createContext, use } from "react";

import type { Size } from "@shared/types";
import type { CartItem } from "@/lib/cart";

/**
 * The bag's context and its hook, kept apart from `CartProvider` because a
 * module that exports both components and plain values loses fast refresh.
 *
 * The bag is deliberately the only piece of global client state in the app.
 * Everything else the storefront shows is server data and goes through
 * `lib/queries.ts`; this is the one thing that belongs to the visitor.
 */
export interface CartApi {
  items: CartItem[];
  /** Garments in the bag, for the header badge. */
  count: number;

  add: (line: { productId: string; slug: string; size: Size }, qty?: number, available?: number) => void;
  setQty: (line: { productId: string; size: Size }, qty: number, available?: number) => void;
  remove: (line: { productId: string; size: Size }) => void;
  /** Drops the lines the catalog can no longer fulfil (requirements section 11). */
  removeMany: (lines: Array<{ productId: string; size: Size }>) => void;
  clear: () => void;

  /** The mini bag. Opening it is how adding to the bag confirms itself. */
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const CartContext = createContext<CartApi | null>(null);

export function useCart(): CartApi {
  const api = use(CartContext);
  if (!api) throw new Error("useCart must be used inside <CartProvider>");
  return api;
}
