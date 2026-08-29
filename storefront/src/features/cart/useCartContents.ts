import type { Product } from "@shared/types";
import { useCart } from "@/features/cart/CartContext";
import { useAsync } from "@/hooks/useAsync";
import { buildCart, type CartTotals } from "@/lib/cart";
import { getProductBySlug, getSettings } from "@/lib/queries";

/**
 * Joins the stored bag to the live catalog and prices it (requirements
 * section 6).
 *
 * This is where the bag's central rule is actually carried out: nothing priced
 * or named comes out of storage. Each line is re-read from the catalog, so a
 * price the admin changed is right immediately, a piece they retired shows as
 * gone, and a size that sold out while the bag sat there blocks checkout
 * instead of being ordered (sections 11 and 17).
 *
 * It is one read per DISTINCT product, in parallel, and every one of them is
 * served from the cache in `queries.ts` when the visitor has just come from the
 * product page — which is the usual way a bag gets filled. A bag is bounded by
 * `MAX_LINES`, so this is never an unbounded read (section 19).
 *
 * The bag needs the FULL product rather than the summary because stock is
 * tracked per size and only `products/{id}.sizes` carries it; the summary's
 * `inStock` flag cannot answer "is Medium still there".
 *
 * Both the drawer and the cart page call this, so the mini bag and the full bag
 * cannot disagree about a total (section 18).
 */
export interface CartContents extends CartTotals {
  loading: boolean;
  error: Error | undefined;
}

export function useCartContents(): CartContents {
  const { items } = useCart();

  // Distinct and sorted, so reordering the bag or changing a quantity does not
  // look like a different request and refetch the same products.
  const slugs = [...new Set(items.map((item) => item.slug))].sort();

  const catalog = useAsync(
    async () => {
      if (slugs.length === 0) return [] as Array<Product | null>;
      return Promise.all(slugs.map((slug) => getProductBySlug(slug)));
    },
    `cart:${slugs.join(",")}`,
  );

  const settings = useAsync(() => getSettings(), "settings");

  const products = new Map<string, Product | null>(
    slugs.map((slug, i) => [slug, catalog.data?.[i] ?? null]),
  );

  const totals = buildCart(items, products, settings.data);

  return {
    ...totals,
    // The stored bag is available on the first render; what is still in flight
    // is the catalog it has to be priced against. An EMPTY bag is never
    // loading — there is nothing to price, so it says so immediately.
    loading: items.length > 0 && catalog.loading,
    error: catalog.error,
  };
}
