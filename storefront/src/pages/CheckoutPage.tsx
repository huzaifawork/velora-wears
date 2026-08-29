import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { OrderCustomer } from "@shared/types";
import type { CheckoutErrors } from "@shared/checkout";
import type { CheckoutDraft } from "@shared/checkout";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/account/AuthContext";
import { CartLineRow } from "@/features/cart/CartLineRow";
import { CartSummary } from "@/features/cart/CartSummary";
import { useCart } from "@/features/cart/CartContext";
import { useCartContents } from "@/features/cart/useCartContents";
import { CheckoutForm } from "@/features/checkout/CheckoutForm";
import { useAsync } from "@/hooks/useAsync";
import { clearCatalogCache, isLiveSource } from "@/lib/queries";
import { PlaceOrderError, isBagProblem, placeOrder } from "@/lib/placeOrder";
import { listMyOrders } from "@/lib/myOrders";
import { saveReceipt, type ReceiptLine } from "@/lib/orderReceipt";
import { CART, CHECKOUT, HOME, ORDER_CONFIRMED, PRODUCTS, SIGN_IN } from "@/lib/routes";

/**
 * Checkout (requirements section 7).
 *
 * **Guest checkout is still the whole path, unchanged.** Section 7 makes
 * checkout without authentication mandatory, so nothing here requires an
 * account. What optional accounts (the note added to section 12) add is
 * strictly additive: a signed-in customer's order carries an `Authorization`
 * header so the Edge Function links it to them (`placeOrder` already had this
 * parameter, unused, since section 7), and the form opens pre-filled from
 * their most recent order rather than blank — "skip re-typing details next
 * time", as the note puts it. A guest sees neither: no header sent, an empty
 * form, exactly as before.
 *
 * The page composes, like the rest of the storefront. The form and its rules
 * are `features/checkout/CheckoutForm`, the bag beside it is the same
 * `CartLineRow` and `CartSummary` the cart page and the drawer render, and the
 * order itself is placed by `lib/placeOrder`. What lives here is the sequence:
 * the guards that decide whether checkout may be attempted at all, the call,
 * and what happens to the bag afterwards.
 *
 * ### The three guards
 *
 * 1. **An empty bag has nothing to check out**, so it says so rather than
 *    showing a form that cannot be submitted.
 * 2. **A bag with a problem in it cannot be confirmed** (section 11 — an
 *    unavailable option must not be purchasable). The form is disabled rather
 *    than hidden, and the summary's own "remove them and continue" control
 *    still works, so the way out is on the screen the customer is already on.
 * 3. **The lines are re-priced against the live catalog on every render** by
 *    `useCartContents`, so a piece that sells out while the form is being
 *    filled in blocks the button before the server has to.
 *
 * None of that is trusted. The server re-validates the fields, re-reads every
 * price, re-checks every size and recomputes the total inside one transaction
 * (section 17). These guards exist so the customer finds out early, in words.
 */
export function CheckoutPage() {
  const cart = useCartContents();
  const { clear } = useCart();
  const navigate = useNavigate();
  const { status: authStatus, user, accessToken } = useAuth();

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<PlaceOrderError>();
  const [fieldErrors, setFieldErrors] = useState<CheckoutErrors>();
  /** Set the moment the order lands, so the emptied bag cannot flash "empty". */
  const [placed, setPlaced] = useState(false);
  const alert = useRef<HTMLDivElement>(null);

  /**
   * The signed-in customer's most recent order, read once to pre-fill the
   * form. Resolves to `[]` immediately for a guest, so this never waits on a
   * network call that a guest's session was never going to make.
   */
  const prefill = useAsync(
    () => (authStatus === "signed-in" ? listMyOrders() : Promise.resolve([])),
    `checkout-prefill:${authStatus}:${authStatus === "signed-in" ? user?.id : ""}`,
  );

  const authReady = authStatus !== "loading" && (authStatus !== "signed-in" || !prefill.loading);
  const initialValues: Partial<CheckoutDraft> | undefined =
    authStatus === "signed-in"
      ? (() => {
          const latest = prefill.data?.[0];
          return {
            fullName: latest?.customer.fullName ?? "",
            email: latest?.customer.email ?? user?.email ?? "",
            phone: latest?.customer.phone ?? "",
            address: latest?.customer.address ?? "",
            city: latest?.customer.city ?? "",
            postalCode: latest?.customer.postalCode ?? "",
          };
        })()
      : undefined;

  const empty = !cart.loading && cart.lines.length === 0;
  const blocked = cart.hasProblems || cart.subtotal === 0;
  const preparing = cart.loading || !authReady;

  async function submit(customer: OrderCustomer) {
    setSubmitting(true);
    setFailure(undefined);
    setFieldErrors(undefined);

    /**
     * Identity, size and quantity — nothing else. Sending a price would be
     * pointless as well as unsafe: the server reads its own (section 17).
     * `orderableQty` rather than the stored quantity, so a line that was
     * reduced can never ask for more than exists.
     */
    const orderable = cart.lines.filter((line) => line.problem === undefined && line.product);
    const items = orderable.map((line) => ({
      productId: line.item.productId,
      size: line.item.size,
      qty: line.orderableQty,
    }));

    // Snapshotted BEFORE the bag is emptied — the confirmation has to list what
    // was bought, and by then the bag will not know.
    const lines: ReceiptLine[] = orderable.map((line) => ({
      productId: line.item.productId,
      name: line.product?.name ?? "",
      slug: line.item.slug,
      thumb: line.product?.images[0]?.thumb ?? "",
      size: line.item.size,
      qty: line.orderableQty,
      unitPrice: line.unitPrice,
    }));

    try {
      const result = await placeOrder({ items, customer }, accessToken, {
        subtotal: cart.subtotal,
        deliveryCharge: cart.deliveryCharge,
        total: cart.total,
      });

      saveReceipt({
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        total: result.total,
        reviewToken: result.reviewToken,
        paymentMethod: result.paymentMethod,
        city: customer.city,
        email: customer.email,
        lines,
        placedAt: Date.now(),
      });

      setPlaced(true);
      // The bag is done with, and stock has moved for everyone — the cached
      // catalog would otherwise keep showing the pre-order counts for a minute.
      clear();
      clearCatalogCache();
      // `replace`, so the back button does not return to a checkout form whose
      // bag no longer exists.
      navigate(ORDER_CONFIRMED, { replace: true });
    } catch (error) {
      const problem =
        error instanceof PlaceOrderError
          ? error
          : new PlaceOrderError("ORDER_FAILED", "Your order could not be placed just now.");

      setFailure(problem);
      setFieldErrors(problem.fields);
      setSubmitting(false);

      // On a phone the customer is at the submit button, and the explanation is
      // a screen away at the top of the form.
      requestAnimationFrame(() => {
        alert.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  }

  if (placed) return null;

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Home", to: HOME }, { label: "Your bag", to: CART }, { label: "Checkout" }]}
      />

      <PageHeader
        eyebrow="Checkout"
        title="Complete your order"
        description={
          empty
            ? "There is nothing to check out yet."
            : "Cash on delivery, nationwide. No account needed — fill in where the order is going and we will do the rest."
        }
      />

      <Container className="py-14 sm:py-20">
        {preparing ? (
          <CheckoutSkeleton />
        ) : cart.error ? (
          <p className="py-10 text-center text-sm text-ink-soft">
            Your bag could not be priced just now, so checkout is not safe to open. Please refresh
            the page — nothing has been lost.
          </p>
        ) : empty ? (
          <EmptyBag />
        ) : (
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-14">
            <div className="min-w-0">
              <div ref={alert}>
                {!isLiveSource() && <DemoNotice />}
                {blocked && <BlockedNotice />}
                {failure && <FailureNotice error={failure} />}
                {authStatus === "signed-out" && <SignInPrompt />}
              </div>

              <CheckoutForm
                total={cart.total}
                submitting={submitting}
                serverErrors={fieldErrors}
                disabled={blocked}
                initialValues={initialValues}
                onSubmit={submit}
              />
            </div>

            {/* The bag, restated beside the form. Requirements section 6 asks
                the customer to see product, size, quantity and total before
                they confirm, and taking them back to /cart to check would be
                a step out of the thing they are trying to finish. */}
            <aside className="lg:sticky lg:top-28">
              <div className="rounded-sm border border-line bg-canvas-alt p-6 sm:p-7">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
                    Your order
                  </h2>
                  <Link
                    to={CART}
                    className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase underline underline-offset-4 transition hover:text-accent"
                  >
                    Edit bag
                  </Link>
                </div>

                <ul className="divide-y divide-line border-b border-line">
                  {cart.lines.map((line) => (
                    <CartLineRow
                      key={`${line.item.productId}-${line.item.size}`}
                      line={line}
                      compact
                      readOnly
                    />
                  ))}
                </ul>

                <div className="mt-6">
                  <CartSummary cart={cart} compact showActions={false} />
                </div>
              </div>
            </aside>
          </div>
        )}
      </Container>
    </>
  );
}

/* --------------------------------------------------------------------------
 * The states around the form.
 * ----------------------------------------------------------------------- */

const notice = "mb-8 rounded-sm border p-5 text-sm leading-relaxed";

function EmptyBag() {
  return (
    <div className="py-10 text-center">
      <h2 className="text-2xl">There is nothing to check out</h2>
      <p className="mx-auto mt-4 max-w-prose leading-relaxed text-ink-soft">
        Add a piece to your bag and it will be waiting here. Nothing is reserved until an order is
        placed.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to={PRODUCTS} className={buttonClasses({ size: "lg" })}>
          Shop the collection
        </Link>
        <Link to={CART} className={buttonClasses({ variant: "secondary", size: "lg" })}>
          View your bag
        </Link>
      </div>
    </div>
  );
}

/** Requirements section 11 — an unavailable option must not be purchasable. */
function BlockedNotice() {
  return (
    <div className={`${notice} border-danger/30 bg-danger/5 text-danger`} role="alert">
      Something in your bag is no longer available, so the order cannot be confirmed yet. Remove it
      using the control in the order summary, or go back to your bag to change the size.
    </div>
  );
}

/**
 * The one place checkout mentions accounts at all — a convenience, not a
 * gate. `?next=` sends the customer straight back here after signing in, so
 * `SignInPage` lands them where they left off rather than on `/account`.
 */
function SignInPrompt() {
  return (
    <p className="mb-8 text-sm text-ink-soft">
      Have an account?{" "}
      <Link
        to={`${SIGN_IN}?next=${encodeURIComponent(CHECKOUT)}`}
        className="text-ink underline underline-offset-4 transition hover:text-accent"
      >
        Sign in to use your saved details
      </Link>
      .
    </p>
  );
}

function FailureNotice({ error }: { error: PlaceOrderError }) {
  return (
    <div className={`${notice} border-danger/30 bg-danger/5 text-danger`} role="alert">
      <p>{error.message}</p>
      {isBagProblem(error) && (
        <Link
          to={CART}
          className="mt-3 inline-block text-[0.625rem] tracking-eyebrow uppercase underline underline-offset-4 transition hover:text-ink"
        >
          Back to your bag
        </Link>
      )}
    </div>
  );
}

/**
 * The storefront is still reading the throwaway demo catalog, whose product
 * ids do not exist in the database, so the real `place-order` function would
 * refuse every order (it has nothing to sell). `placeOrder` (`lib/
 * placeOrder.ts`) works around that by simulating a successful order locally
 * instead of calling it — the form, its validation and the confirmation page
 * are all the genuine article, only the write at the end is a local stand-in.
 * That is worth saying out loud rather than leaving a customer to assume a
 * "DEMO-" order number is real.
 *
 * This whole component disappears when `VITE_DATA_SOURCE` becomes `supabase`.
 */
function DemoNotice() {
  return (
    <div className={`${notice} border-warning/40 bg-warning/5 text-warning`}>
      <p className="font-medium">Preview catalog — this order is a demo.</p>
      <p className="mt-2">
        The pieces on this site are placeholders while the admin dashboard is being built, so
        this order is not written to the store's real database — it will not appear in order
        history or be shipped. Everything else on this page is the real checkout: the form, its
        rules, and the order confirmation you will see.
      </p>
    </div>
  );
}

/** Mirrors the real layout, so nothing jumps once the bag is priced. */
function CheckoutSkeleton() {
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-13 w-full" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
