/**
 * The quantity control (requirements section 6 — the customer must be able to
 * update the quantity of a line before checkout).
 *
 * A pair of buttons around a live number rather than a text input: a `number`
 * input on a phone opens the wrong keyboard, accepts pasted rubbish, and has to
 * be validated on every keystroke. Two buttons cannot produce an invalid value.
 *
 * It never goes above `max`, which the cart passes as the stock remaining in
 * that line's size, so the control itself makes an over-order impossible
 * (section 11). Stepping below one is a removal, which is what the visitor
 * means by it, so the minus button stays live at one and the caller decides.
 */
export function QuantityStepper({
  qty,
  max,
  onChange,
  /** Named for assistive tech: "Quantity, Ivory Oxford Shirt, Medium". */
  label,
  disabled = false,
}: {
  qty: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const atMax = qty >= max;

  const button =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-strong text-ink transition duration-200 ease-brand hover:border-ink disabled:cursor-not-allowed disabled:border-line disabled:text-ink-muted";

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={disabled}
        aria-label={`Decrease quantity of ${label}`}
        className={button}
      >
        <span aria-hidden="true">&minus;</span>
      </button>

      {/* Announced on change, so a screen reader hears the new quantity
          without the buttons having to re-describe themselves. */}
      <span
        aria-live="polite"
        aria-label={`Quantity of ${label}`}
        className="w-8 text-center text-sm font-medium tabular-nums text-ink"
      >
        {qty}
      </span>

      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={disabled || atMax}
        aria-label={`Increase quantity of ${label}`}
        title={atMax ? "That is all the stock there is in this size" : undefined}
        className={button}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
