import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { OrderCustomer } from "@shared/types";
import type { CheckoutErrors } from "@shared/checkout";
import type { CheckoutDraft } from "@shared/checkout";
import { Logo } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/account/AuthContext";
import { useCart } from "@/features/cart/CartContext";
import { useCartContents } from "@/features/cart/useCartContents";
import { CheckoutForm } from "@/features/checkout/CheckoutForm";
import { CheckoutSummary } from "@/features/checkout/CheckoutSummary";
import { useAsync } from "@/hooks/useAsync";
import { clearCatalogCache, isLiveSource } from "@/lib/queries";
import { PlaceOrderError, isBagProblem, placeOrder } from "@/lib/placeOrder";
import { listMyOrders } from "@/lib/myOrders";
import { sizeLabel } from "@/lib/sizes";
import { saveReceipt, type ReceiptLine } from "@/lib/orderReceipt";
import { clearSavedCheckout, readSavedCheckout, saveCheckout } from "@/lib/savedCheckout";
import { CART, HOME, ORDER_CONFIRMED, PRODUCTS } from "@/lib/routes";

/**
 * Checkout (requirements section 7).
 *
 * **Guest checkout is still the whole path, unchanged.** Section 7 makes
 * checkout without authentication mandatory, so nothing here requires an
 * account. What optional accounts (the note added to section 12) add is
 * strictly additive: a signed-in customer's order carries an `Authorization`
 * header so the Edge Function links it to them, and the form opens pre-filled
 * from their most recent order rather than blank. A guest is no longer left
 * with an empty form either — see "What the form opens with" below.
 *
 * ### The layout is the client's reference design (2026-09-04)
 *
 * A checkout of its own rather than a page inside the shop: the site header,
 * its navigation and the footer are all suppressed on this route (see
 * `App.tsx`), and what replaces them is the brand mark at the top and a short
 * row of ways out at the bottom. That is deliberate and standard — every link
 * in a full site header at this point is an invitation to abandon a filled-in
 * form — and it is what the reference shows.
 *
 * Below it the page is two columns from `lg` up: the form, and the order
 * beside it on its own ground. On a phone they stack, with the order collapsed
 * into a single "Order summary" bar above the form (`CheckoutSummary`), so the
 * first field is reachable without scrolling past the bag (section 15).
 *
 * ### What the form opens with
 *
 * In order of precedence:
 *
 *  1. **What this device remembers** — the details of the last order placed on
 *     it, if the customer left "Save this information" ticked. This is the
 *     client's second ask on 2026-09-04, and it works for a guest, which is
 *     the point: most orders here are guest orders. `lib/savedCheckout.ts` has
 *     the storage rules.
 *  2. **The signed-in customer's most recent order**, read from the database.
 *     Still the better source across devices — a new phone knows nothing.
 *  3. **The account's email address**, when there is no order to read.
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
   * What this device remembers, read ONCE — a lazy initial state rather than a
   * read per render. Storage can change under a mounted page (another tab
   * placing an order), and re-reading it would move values inside a form the
   * customer is typing into.
   */
  const [saved] = useState(readSavedCheckout);

  /**
   * The signed-in customer's most recent order, read to pre-fill anything the
   * device does not already know. Resolves to `[]` immediately for a guest, so
   * this never waits on a network call that a guest's session was never going
   * to make.
   */
  const prefill = useAsync(
    () => (authStatus === "signed-in" ? listMyOrders() : Promise.resolve([])),
    `checkout-prefill:${authStatus}:${authStatus === "signed-in" ? user?.id : ""}`,
  );

  const authReady = authStatus !== "loading" && (authStatus !== "signed-in" || !prefill.loading);
  const latest = authStatus === "signed-in" ? prefill.data?.[0] : undefined;

  const initialValues: Partial<CheckoutDraft> | undefined =
    latest || saved || user?.email
      ? {
          fullName: latest?.customer.fullName ?? "",
          email: latest?.customer.email ?? user?.email ?? "",
          phone: latest?.customer.phone ?? "",
          address: latest?.customer.address ?? "",
          city: latest?.customer.city ?? "",
          postalCode: latest?.customer.postalCode ?? "",
          // Last, so this device's own remembered details win over an older
          // order read from the database. Only non-empty fields are in here.
          ...(saved ?? {}),
        }
      : undefined;

  const empty = !cart.loading && cart.lines.length === 0;
  const blocked = cart.hasProblems || cart.subtotal === 0;
  const preparing = cart.loading || !authReady;

  async function submit(customer: OrderCustomer, remember: boolean) {
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
      // Resolved here, while the product (and so its scale) is still in hand.
      // The confirmation page reads only this receipt.
      sizeLabel: sizeLabel(line.product?.sizeScale, line.item.size),
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

      /**
       * The client's "auto-fill it next time" (2026-09-04), and only now that
       * the order has actually landed — a form the customer abandoned leaves
       * nothing behind. Unticking the box is an instruction to forget, not
       * merely to skip this one, so it clears what is already there.
       */
      if (remember) saveCheckout(customer);
      else clearSavedCheckout();

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
    <CheckoutShell>
      {preparing ? (
        <CheckoutSkeleton />
      ) : cart.error ? (
        <Centered>
          <p className="text-sm leading-relaxed text-ink-soft">
            Your bag could not be priced just now, so checkout is not safe to open. Please refresh
            the page — nothing has been lost.
          </p>
        </Centered>
      ) : empty ? (
        <Centered>
          <EmptyBag />
        </Centered>
      ) : (
        /* Two columns from `lg`, and the ORDER COMES FIRST in the document so a
           phone meets the collapsed summary bar before the form. `lg:order-2`
           puts it back on the right on a wide screen, where reading order and
           visual order agree again. */
        <div className="lg:grid lg:grid-cols-2">
          <aside className="border-b border-line bg-canvas-deep lg:order-2 lg:border-b-0 lg:border-l">
            <div className="mx-auto w-full max-w-lg px-4 sm:px-6 lg:sticky lg:top-0 lg:mr-auto lg:ml-0 lg:px-10 lg:py-12">
              <CheckoutSummary cart={cart} />
            </div>
          </aside>

          <div className="lg:order-1">
            <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6 lg:mr-0 lg:ml-auto lg:px-10 lg:py-12">
              <div ref={alert}>
                {!isLiveSource() && <DemoNotice />}
                {blocked && <BlockedNotice />}
                {failure && <FailureNotice error={failure} />}
              </div>

              <CheckoutForm
                total={cart.total}
                deliveryCharge={cart.deliveryCharge}
                submitting={submitting}
                serverErrors={fieldErrors}
                disabled={blocked}
                initialValues={initialValues}
                /* `initialRemember` is left at its default, ticked. The box is
                   a standing offer rather than a memory of the last answer:
                   someone who unticked it placed an order that cleared this
                   device, so there is nothing of theirs left to protect, and
                   the reference design shows it the same way every time. */
                showSignIn={authStatus === "signed-out"}
                onSubmit={submit}
              />
            </div>
          </div>
        </div>
      )}
    </CheckoutShell>
  );
}

/* --------------------------------------------------------------------------
 * The checkout's own chrome. The site header and footer are suppressed on this
 * route (`App.tsx`), so these two are the whole frame.
 * ----------------------------------------------------------------------- */

function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl justify-center px-4 py-6 sm:px-6 lg:px-8">
          <Link
            to={HOME}
            aria-label="Velora Wears — home"
            className="text-ink transition hover:opacity-80"
          >
            <Logo size="lg" />
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* The ways out, and one way to ask a question. The support address is the
          brand's real one, the same the site footer carries — repeated here
          rather than reached by rendering the whole footer, which is the thing
          this layout deliberately does without. */}
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-center gap-x-8 gap-y-3 px-4 py-6 sm:px-6 lg:px-8">
          {[
            { label: "Continue shopping", to: PRODUCTS },
            { label: "Your bag", to: CART },
          ].map((link) => (
            <Link
              key={link.label}
              to={link.to}
              className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase transition hover:text-accent"
            >
              {link.label}
            </Link>
          ))}
          <a
            href="mailto:wearvelora84@gmail.com"
            className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase transition hover:text-accent"
          >
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}

/** The one-column states — empty bag, and a bag that could not be priced. */
function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-6 lg:px-8">{children}</div>
  );
}

/* --------------------------------------------------------------------------
 * The states around the form.
 * ----------------------------------------------------------------------- */

const notice = "mb-8 rounded-sm border p-5 text-sm leading-relaxed";

function EmptyBag() {
  return (
    <>
      <h1 className="text-2xl">There is nothing to check out</h1>
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
    </>
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
    <div className="lg:grid lg:grid-cols-2">
      <div className="border-b border-line bg-canvas-deep lg:order-2 lg:border-b-0 lg:border-l">
        <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 lg:mr-auto lg:ml-0 lg:px-10 lg:py-12">
          <Skeleton className="h-6 w-full lg:h-72" />
        </div>
      </div>

      <div className="lg:order-1">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-10 sm:px-6 lg:mr-0 lg:ml-auto lg:px-10 lg:py-12">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-13 w-full" />
        </div>
      </div>
    </div>
  );
}
