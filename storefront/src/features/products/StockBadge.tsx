import type { ProductSummary } from "@shared/types";
import { Badge } from "@/components/ui/Badge";

/**
 * Stock status, read from the PRECOMPUTED `inStock` / `lowStock` flags on the
 * summary record (requirements section 19 — derived values are computed at
 * write time, never by walking the sizes map in a list view).
 *
 * Requirements section 11 extends this with per-size availability on the
 * product detail page; the badge itself stays this one component.
 */
export function StockBadge({ product }: { product: ProductSummary }) {
  if (!product.inStock) return <Badge tone="danger">Sold out</Badge>;
  if (product.lowStock) return <Badge tone="warning">Low stock</Badge>;
  return <Badge tone="success">In stock</Badge>;
}
