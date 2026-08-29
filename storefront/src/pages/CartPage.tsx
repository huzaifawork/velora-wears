import { Link } from "react-router-dom";

import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { ValueProps } from "@/components/layout/ValueProps";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { CartLineRow } from "@/features/cart/CartLineRow";
import { CartSummary } from "@/features/cart/CartSummary";
import { useCartContents } from "@/features/cart/useCartContents";
import { useAsync } from "@/hooks/useAsync";
import { formatPieceCount } from "@/lib/format";
import { getSettings } from "@/lib/queries";
import { CATEGORIES, HOME, PRODUCTS } from "@/lib/routes";

/**
 * The bag (requirements section 6) — selected products, their size, quantity
 * and price, the total order amount, and the controls to change a quantity or
 * remove a line before checkout.
 *
 * This is the canonical bag: linkable, sharable and back-button-able. The
 * drawer is the shortcut over the top of it, and both render the same
 * `CartLineRow` and `CartSummary`, so they cannot drift (section 18).
 *
 * It composes; it does not draw. The one thing it owns is the layout — lines on
 * the left, the summary sticky beside them on a desktop and below them on a
 * phone, which is the order they matter in on a small screen (section 15).
 */
export function CartPage() {
  const cart = useCartContents();
  const settings = useAsync(() => getSettings(), "settings");

  const empty = !cart.loading && cart.lines.length === 0;

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", to: HOME }, { label: "Your bag" }]} />

      <PageHeader
        eyebrow="Bag"
        title="Your bag"
        description={
          empty
            ? "Nothing in here yet."
            : "Check the sizes and quantities before you go through to checkout. Nothing is reserved until an order is placed."
        }
      >
        {!cart.loading && cart.lines.length > 0 && (
          <p className="mt-6 text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
            {formatPieceCount(cart.count)}
          </p>
        )}
      </PageHeader>

      <Container className="py-14 sm:py-20">
        {cart.loading ? (
          <CartSkeleton />
        ) : cart.error ? (
          <p className="py-10 text-center text-sm text-ink-soft">
            Your bag could not be priced just now. Please refresh the page — nothing has been
            lost.
          </p>
        ) : empty ? (
          <div className="py-10 text-center">
            <h2 className="text-2xl">There is nothing in your bag yet</h2>
            <p className="mx-auto mt-4 max-w-prose leading-relaxed text-ink-soft">
              Pieces you add will stay here on this device, so you can come back and finish the
              order later.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to={PRODUCTS} className={buttonClasses({ size: "lg" })}>
                Shop the collection
              </Link>
              <Link to={CATEGORIES} className={buttonClasses({ variant: "secondary", size: "lg" })}>
                Browse categories
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-14">
            <section aria-label="Items in your bag">
              <ul className="divide-y divide-line border-y border-line">
                {cart.lines.map((line) => (
                  <CartLineRow key={`${line.item.productId}-${line.item.size}`} line={line} />
                ))}
              </ul>
            </section>

            {/* Sticky on a desktop so the total stays in view down a long bag;
                a plain block on a phone, underneath the lines. */}
            <aside className="lg:sticky lg:top-28">
              <CartSummary cart={cart} />
            </aside>
          </div>
        )}
      </Container>

      <ValueProps settings={settings.data} />
    </>
  );
}

/** Mirrors the real layout, so nothing jumps when the bag is priced. */
function CartSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
      <div className="flex flex-col gap-6">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="aspect-3/4 w-24 shrink-0 sm:w-28" />
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
