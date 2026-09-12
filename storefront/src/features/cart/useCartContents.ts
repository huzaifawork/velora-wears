import type { Product, ProductSummary } from "@shared/types";
import { useCart } from "@/features/cart/CartContext";
import { useAsync } from "@/hooks/useAsync";
import { buildCart, type CartTotals } from "@/lib/cart";
import { getProductBySlug, getProductSummaryBySlug, getSettings } from "@/lib/queries";

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
 * It needs the SUMMARY as well, and only for one field: the sale price Postgres
 * computed (`product_summaries.sale_price`). A discount is resolved in the
 * database, never in the browser — so rather than the bag working out its own
 * answer from a list of discounts, it reads the same figure the card and the
 * product page read. One calculation, three surfaces, no way for them to
 * disagree about what a shirt costs today. Both reads share the cache in
 * `queries.ts`, and a visitor who just came from the product page has both
 * already.
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
      if (slugs.length === 0) {
        return [[], []] as [Array<Product | null>, Array<ProductSummary | null>];
      }
      // One wave, not two: the bag cannot be priced until both halves are in,
      // and settling them separately would price it at full price for a frame
      // and then flicker down to the sale price.
      return Promise.all([
        Promise.all(slugs.map((slug) => getProductBySlug(slug))),
        Promise.all(slugs.map((slug) => getProductSummaryBySlug(slug))),
      ]);
    },
    `cart:${slugs.join(",")}`,
  );

  const settings = useAsync(() => getSettings(), "settings");

  const [fullProducts, summaryRows] = catalog.data ?? [undefined, undefined];

  const products = new Map<string, Product | null>(
    slugs.map((slug, i) => [slug, fullProducts?.[i] ?? null]),
  );
  const summaries = new Map<string, ProductSummary | null>(
    slugs.map((slug, i) => [slug, summaryRows?.[i] ?? null]),
  );

  const totals = buildCart(items, products, settings.data, summaries);

  return {
    ...totals,
    // The stored bag is available on the first render; what is still in flight
    // is the catalog it has to be priced against. An EMPTY bag is never
    // loading — there is nothing to price, so it says so immediately.
    loading: items.length > 0 && catalog.loading,
    error: catalog.error,
  };
}
