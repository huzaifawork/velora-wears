import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { CartLineRow } from "@/features/cart/CartLineRow";
import { CartSummary } from "@/features/cart/CartSummary";
import { useCart } from "@/features/cart/CartContext";
import { useCartContents } from "@/features/cart/useCartContents";
import { CART, PRODUCTS } from "@/lib/routes";

/**
 * The mini bag's panel (requirements section 6 — once a product is added, the
 * customer should be able to go straight to checkout).
 *
 * It renders the SAME `CartLineRow` and `CartSummary` as the cart page, so the
 * mini bag and the full bag cannot disagree (section 18), and it is not a
 * replacement for the cart page: `/cart` is the linkable, sharable,
 * back-button-able surface, and this is the shortcut over it.
 *
 * This module is only ever downloaded when the bag is actually opened — see
 * `CartDrawer.tsx`, which is the always-mounted host. That is also why it may
 * assume it is open: it is never rendered otherwise.
 */
export function CartDrawerPanel() {
  const { closeDrawer } = useCart();
  const cart = useCartContents();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };

    // The page behind a sheet must not scroll under it, on a phone especially.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    // Move focus into the panel so a keyboard lands inside the thing that just
    // opened rather than back at the top of the document.
    panel.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDrawer]);

  const empty = !cart.loading && cart.lines.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* The scrim is the click-away target, and is hidden from assistive tech
          because Escape and the close button already do the same job. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={closeDrawer}
        className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        tabIndex={-1}
        className="relative flex h-full w-full max-w-md flex-col bg-canvas shadow-lift focus:outline-none"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-5 sm:px-6">
          <h2 className="text-xl">
            Your bag
            {cart.count > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-muted">({cart.count})</span>
            )}
          </h2>
          <button
            type="button"
            onClick={closeDrawer}
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition hover:bg-canvas-alt"
          >
            <span className="sr-only">Close the bag</span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6">
          {cart.loading ? (
            <div className="flex flex-col gap-4 py-6">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="aspect-3/4 w-20 shrink-0" />
                  <div className="flex flex-1 flex-col gap-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-9 w-28" />
                  </div>
                </div>
              ))}
            </div>
          ) : cart.error ? (
            <p className="py-12 text-center text-sm text-ink-soft">
              Your bag could not be priced just now. Please refresh the page.
            </p>
          ) : empty ? (
            <div className="py-16 text-center">
              <p className="text-lg text-ink">Your bag is empty.</p>
              <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">
                Nothing in here yet — the collection is a good place to start.
              </p>
              <Link to={PRODUCTS} onClick={closeDrawer} className={buttonClasses({ className: "mt-7" })}>
                Shop the collection
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {cart.lines.map((line) => (
                <CartLineRow key={`${line.item.productId}-${line.item.size}`} line={line} compact />
              ))}
            </ul>
          )}
        </div>

        {!empty && !cart.error && (
          <div className="shrink-0 border-t border-line bg-canvas-alt px-5 py-5 sm:px-6">
            <CartSummary cart={cart} compact onNavigate={closeDrawer} />
            <p className="mt-4 text-center">
              <Link
                to={CART}
                onClick={closeDrawer}
                className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase underline underline-offset-4 transition hover:text-accent"
              >
                View the full bag
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
