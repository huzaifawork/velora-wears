import type { Size, SizeScaleId, SizeStock } from "@shared/types";
import { availableSizes, offeredSizes, stockInSize, stockLevel } from "@shared/stock";
import { sizeLabel, sizeShort } from "@/lib/sizes";

/**
 * Size selection (requirements section 4 — the user picks a size before adding
 * to the cart) with per-size availability (section 11).
 *
 * ---------------------------------------------------------------------------
 * IT DRAWS THE PRODUCT'S SIZES, NOT THE SHOP'S
 * ---------------------------------------------------------------------------
 * This used to map over a global `SIZES` of exactly `["S", "M", "L"]`, which
 * put "Small / Medium / Large" under every photograph in the shop — including
 * the sneakers. Now the buttons come from the product's own stock rows, put
 * into the order of its scale, so a trouser shows 30 / 32 / 34 and a shoe shows
 * EU 41 / 42 / 43.
 *
 * **A size that is absent and a size that is sold out are different**, and the
 * difference is visible here. A piece not sold in XXL gets no button at all; a
 * piece whose XXL has run out gets one, struck through and genuinely
 * `disabled`, because section 11 requires an out-of-stock option to be
 * unbuyable AND the visitor to be told which one. Rendering every size on the
 * scale would strike out four buttons on a shirt that has only ever come in
 * three sizes, which says something false about the range.
 *
 * The remaining quantity for the chosen size is shown underneath, so a visitor
 * is told what is left before they commit to it.
 *
 * **"Low" is decided by `shared/stock.ts`**, the same rule the
 * `product_summaries` VIEW and `StockBadge` use.
 */
export function SizeSelector({
  sizes,
  scaleId,
  selected,
  onSelect,
  lowStockThreshold,
}: {
  /** Per-size stock, keyed by code — only the sizes this piece is sold in. */
  sizes: Record<Size, SizeStock>;
  /** The product's scale, which decides the order and the wording. */
  scaleId: SizeScaleId | undefined;
  selected: Size | undefined;
  onSelect: (size: Size) => void;
  /** From admin settings; below or at this, the remaining count is called out. */
  lowStockThreshold: number;
}) {
  const offered = offeredSizes(sizes, scaleId);
  const anyAvailable = availableSizes(sizes, scaleId).length > 0;
  const selectedStock = selected ? stockInSize(sizes, selected) : 0;
  const selectedLevel = selected ? stockLevel(selectedStock, lowStockThreshold) : undefined;

  // A piece with no stock rows at all is a half-finished record, not a sold-out
  // one. Saying "every size is sold out" would be a guess; saying nothing is
  // honest, and the Add to bag button is already disabled without a selection.
  if (offered.length === 0) {
    return (
      <div>
        <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">Sizes</p>
        <p className="mt-4 text-sm text-ink-soft">
          Sizes for this piece are not listed yet. Please check back shortly.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
        {anyAvailable ? "Select a size" : "Sizes"}
      </p>

      <div role="radiogroup" aria-label="Size" className="mt-4 flex flex-wrap gap-3">
        {offered.map((size) => {
          const stock = stockInSize(sizes, size);
          const soldOut = stock === 0;
          const active = selected === size;
          const label = sizeLabel(scaleId, size);

          return (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={soldOut}
              onClick={() => onSelect(size)}
              title={label}
              className={`h-12 min-w-14 rounded-full border px-5 text-sm font-medium tracking-eyebrow uppercase transition duration-200 ease-brand ${
                soldOut
                  ? "cursor-not-allowed border-line text-ink-muted line-through"
                  : active
                    ? "border-ink bg-ink text-canvas"
                    : "border-line-strong text-ink hover:border-ink"
              }`}
            >
              {sizeShort(scaleId, size)}
              <span className="sr-only">
                {" "}
                — {label}
                {soldOut ? ", sold out" : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* Announced as it changes, because it is the answer to "can I buy this?" */}
      <p aria-live="polite" className="mt-4 text-sm text-ink-soft">
        {!anyAvailable
          ? "Every size is sold out. This piece is not available to order right now."
          : !selected
            ? "Choose a size to continue."
            : selectedLevel === "low-stock"
              ? `Only ${selectedStock} left in ${sizeLabel(scaleId, selected)}.`
              : `${sizeLabel(scaleId, selected)} is in stock.`}
      </p>
    </div>
  );
}
