import type { ProductSummary } from "@shared/types";
import { STOCK_LEVEL_LABEL } from "@shared/stock";
import { Badge } from "@/components/ui/Badge";

/**
 * Stock status (requirements section 11), read from the summary's PRECOMPUTED
 * `inStock` / `lowStock` flags — never walked from a sizes map in a list view
 * (section 19).
 *
 * **The wording and the "low" threshold are no longer decided here.** They
 * come from `shared/stock.ts`, which is also what the `product_summaries` VIEW
 * and the demo catalog compute against. Before section 11 the three disagreed:
 * the view called a piece "low" at a different count than the demo catalog
 * did, so the badge changed meaning when `VITE_DATA_SOURCE` flipped and
 * nothing would have caught it.
 *
 * Section 11 also asks that the "available product quantity" be shown where it
 * matters. On a badge over a card, the count belongs next to the words only
 * once stock is actually low — a full shelf does not need a number, but a
 * shopper deciding whether to add the last few does. `totalStock` is optional
 * on the contract (a summary from an older build may not carry it), so the
 * badge degrades to the plain word rather than rendering "Low stock · left".
 */
export function StockBadge({ product }: { product: ProductSummary }) {
  if (!product.inStock) return <Badge tone="danger">{STOCK_LEVEL_LABEL["out-of-stock"]}</Badge>;

  if (product.lowStock) {
    const count = product.totalStock;
    return (
      <Badge tone="warning">
        {STOCK_LEVEL_LABEL["low-stock"]}
        {typeof count === "number" && count > 0 ? ` · ${count} left` : ""}
      </Badge>
    );
  }

  return <Badge tone="success">{STOCK_LEVEL_LABEL["in-stock"]}</Badge>;
}
