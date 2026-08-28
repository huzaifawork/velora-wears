import type { Size, SizeStock } from "@shared/types";
import { SIZES, SIZE_LABELS } from "@/lib/sizes";

/**
 * Size selection (requirements section 4 — the user picks a size before adding
 * to the cart) with per-size availability (section 11).
 *
 * A size with no stock is rendered struck through and is genuinely `disabled`,
 * not merely styled as unavailable: section 11 requires that an out-of-stock
 * option cannot be purchased, and the selected size is what the cart line and
 * the order will carry. The remaining quantity for the chosen size is shown
 * underneath, so a visitor is told what is left before they commit to it.
 *
 * Reused by the cart's size switcher in section 6 — do not write a second one.
 */
export function SizeSelector({
  sizes,
  selected,
  onSelect,
  lowStockThreshold,
}: {
  sizes: Record<Size, SizeStock>;
  selected: Size | undefined;
  onSelect: (size: Size) => void;
  /** From admin settings; below or at this, the remaining count is called out. */
  lowStockThreshold: number;
}) {
  const stockFor = (size: Size) => sizes[size]?.stock ?? 0;
  const anyAvailable = SIZES.some((size) => stockFor(size) > 0);
  const selectedStock = selected ? stockFor(selected) : 0;

  return (
    <div>
      <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
        {anyAvailable ? "Select a size" : "Sizes"}
      </p>

      <div role="radiogroup" aria-label="Size" className="mt-4 flex flex-wrap gap-3">
        {SIZES.map((size) => {
          const stock = stockFor(size);
          const soldOut = stock === 0;
          const active = selected === size;

          return (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={soldOut}
              onClick={() => onSelect(size)}
              title={SIZE_LABELS[size]}
              className={`h-12 min-w-14 rounded-full border px-5 text-sm font-medium tracking-eyebrow uppercase transition duration-200 ease-brand ${
                soldOut
                  ? "cursor-not-allowed border-line text-ink-muted line-through"
                  : active
                    ? "border-ink bg-ink text-canvas"
                    : "border-line-strong text-ink hover:border-ink"
              }`}
            >
              {size}
              <span className="sr-only">
                {" "}
                — {SIZE_LABELS[size]}
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
            : selectedStock <= lowStockThreshold
              ? `Only ${selectedStock} left in ${SIZE_LABELS[selected]}.`
              : `${SIZE_LABELS[selected]} is in stock.`}
      </p>
    </div>
  );
}
