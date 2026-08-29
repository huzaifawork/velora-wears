import { useCart } from "@/features/cart/CartContext";

/**
 * The bag control in the header (requirements section 6).
 *
 * It opens the drawer rather than navigating, so a visitor can check what is in
 * the bag without losing the page they were reading. The cart PAGE is still one
 * tap further in, from inside the drawer, and is the linkable surface.
 *
 * The badge is right on the FIRST render, with no empty flash, because the bag
 * is an external store read synchronously rather than state seeded by an effect
 * — see `lib/cartStore.ts`.
 */
export function CartButton() {
  const { count, openDrawer } = useCart();
  const filled = count > 0;

  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-haspopup="dialog"
      className="relative -mr-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-canvas-alt"
    >
      <span className="sr-only">
        {filled ? `Your bag, ${count} ${count === 1 ? "item" : "items"}` : "Your bag, empty"}
      </span>

      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 8h14l-1.1 11.2a1.6 1.6 0 0 1-1.6 1.4H7.7a1.6 1.6 0 0 1-1.6-1.4z" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3" />
      </svg>

      {filled && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[0.5625rem] font-medium tabular-nums text-ink"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}
