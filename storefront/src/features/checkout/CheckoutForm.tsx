import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { OrderCustomer } from "@shared/types";
import {
  CHECKOUT_LIMITS,
  EMPTY_CHECKOUT_DRAFT,
  normaliseCheckout,
  validateCheckout,
  validateCheckoutField,
  type CheckoutDraft,
  type CheckoutErrors,
  type CheckoutField,
} from "@shared/checkout";
import { DEFAULT_PAYMENT_METHOD, PAYMENT_METHOD_COPY } from "@shared/payment";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { formatPrice } from "@/lib/format";
import { CHECKOUT, SIGN_IN } from "@/lib/routes";

/**
 * The checkout form (requirements sections 7 and 17).
 *
 * **No account is asked for anywhere in it.** Section 7 makes guest checkout
 * mandatory, so there is no sign-in step, no "continue as guest" fork, and no
 * password: an email address is contact detail here, not an identity. The
 * "Sign in" link beside the Contact heading is a shortcut for someone who
 * already has an account, exactly as the client's reference design has it —
 * nothing below it changes if it is ignored.
 *
 * The validation rules are NOT written in this file. They live in
 * `shared/checkout.ts`, which mirrors the `place-order` Edge Function exactly,
 * because a form that is looser than the server lets a customer fill
 * everything in and then be rejected by a machine for a reason the form never
 * mentioned. This component only decides WHEN to show what that module says.
 *
 * ### The shape of the page
 *
 * Contact, then Delivery, then how it ships, then how it is paid — the order
 * of the reference design the client supplied on 2026-09-04, and the order a
 * customer answers the questions in anyway. The fields are one per row with
 * the label inside the box (`Field`'s `floating`), which is what makes a long
 * form read as a single column to work down rather than a grid to scan.
 *
 * ### When an error appears
 *
 * Section 17 asks for validation "both as the customer fills the form and again
 * when they submit", which cannot mean marking a field wrong the moment it is
 * focused — every field is empty and therefore invalid before it is typed in,
 * and a form that turns red as you tab into it is telling you off for nothing.
 * So a field starts silent, and begins reporting once it has been LEFT (blur)
 * or once the form has been submitted. From that point it re-validates on every
 * keystroke, so the message disappears the moment the value is fixed rather
 * than at the next blur.
 *
 * ### The draft IS remembered now — once the order is placed
 *
 * This file used to argue the opposite: that a name, phone number and home
 * address should never sit in browser storage. The client asked for the
 * reference design's "Save this information for next time" on 2026-09-04, so
 * the checkbox below is that, and `lib/savedCheckout.ts` holds the reasoning
 * and the limits — opt out on the same screen, no order note, and nothing
 * written until an order actually lands. Nothing is stored while typing: an
 * abandoned form still leaves no trace.
 */

/**
 * Version one takes one method and does not ask which (section 9), so this is
 * resolved once at module level rather than being state the form carries.
 * When a second method exists it becomes a choice, and this is the line that
 * changes.
 */
const payment = PAYMENT_METHOD_COPY[DEFAULT_PAYMENT_METHOD];

/**
 * The one country the shop delivers to (requirements section 10 — delivery is
 * nationwide, on a single admin-configured rate). Shown rather than asked,
 * because a select with one option in it is a question with one answer; the
 * reference design's country row is where a customer looks to check they are
 * on the right store, and this answers that.
 */
const COUNTRY = "Pakistan";

export function CheckoutForm({
  total,
  deliveryCharge,
  submitting,
  /** Field errors the SERVER returned. It is the authority; these override. */
  serverErrors,
  disabled = false,
  /**
   * What to open the form with — this device's remembered details, falling
   * back to a signed-in customer's most recent order, so checkout can
   * genuinely "skip re-typing details next time" for a guest and an account
   * holder alike. Read once, on mount: the draft is the customer's from then
   * on, and re-applying it out from under them if their account data loads a
   * moment later would overwrite what they typed. `CheckoutPage` decides what
   * goes in it.
   */
  initialValues,
  /** Whether the save-my-details box opens ticked. See `lib/savedCheckout.ts`. */
  initialRemember = true,
  /** Signed out? Then the sign-in shortcut is worth offering. */
  showSignIn = false,
  onSubmit,
}: {
  total: number;
  /** What delivery costs this bag, so the shipping row states a fact. */
  deliveryCharge: number;
  submitting: boolean;
  serverErrors?: CheckoutErrors;
  disabled?: boolean;
  initialValues?: Partial<CheckoutDraft>;
  initialRemember?: boolean;
  showSignIn?: boolean;
  onSubmit: (customer: OrderCustomer, remember: boolean) => void;
}) {
  const [draft, setDraft] = useState<CheckoutDraft>(() => ({
    ...EMPTY_CHECKOUT_DRAFT,
    ...initialValues,
  }));
  const [remember, setRemember] = useState(initialRemember);
  const [reporting, setReporting] = useState<Partial<Record<CheckoutField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  /** What was last sent, so a server objection can be retired once it is answered. */
  const [sent, setSent] = useState<CheckoutDraft>();
  const form = useRef<HTMLFormElement>(null);

  /**
   * The value the SERVER will see. Validating the raw string would disagree
   * with it about whitespace: "   " is blank to the server, and a name typed
   * with a stray double space is two characters shorter once collapsed.
   */
  const clean = normaliseCheckout(draft);

  /** The message for a field, or undefined while it is not reporting yet. */
  function errorFor(field: CheckoutField): string | undefined {
    /**
     * The server's objection outranks the local rules — it is the authority —
     * but only while the field still holds the value it objected to. Once the
     * customer changes it, the complaint is about something that is no longer
     * there, and the local rules take over again.
     */
    const fromServer = serverErrors?.[field];
    if (fromServer && sent?.[field] === clean[field]) return fromServer;

    if (!submitted && !reporting[field]) return undefined;
    return validateCheckoutField(field, clean[field]) ?? undefined;
  }

  function change(field: CheckoutField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);

    const { customer, valid } = validateCheckout(draft);
    if (!valid) {
      // Take the customer to the first thing that is wrong. On a long form on a
      // phone the offending field is usually off screen, and a submit button
      // that appears to do nothing reads as a broken site.
      requestAnimationFrame(() => {
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }

    setSent(clean);
    onSubmit(customer, remember);
  }

  const busy = submitting || disabled;

  /** Shared wiring, so seven fields do not repeat the same five props. */
  const field = (name: CheckoutField) => ({
    value: draft[name],
    error: errorFor(name),
    maxLength: CHECKOUT_LIMITS[name].max,
    disabled: busy,
    floating: true,
    onChange: (value: string) => change(name, value),
    onBlur: () => setReporting((current) => ({ ...current, [name]: true })),
  });

  return (
    // `noValidate` hands validation to the rules above rather than to the
    // browser's own, which cannot know a Pakistani mobile from any other
    // number and whose bubbles cannot be styled or read consistently.
    <form ref={form} onSubmit={handleSubmit} noValidate className="flex flex-col gap-9">
      <section aria-labelledby="contact-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="contact-heading" className="font-display text-xl text-ink">
            Contact
          </h2>
          {showSignIn && (
            <Link
              to={`${SIGN_IN}?next=${encodeURIComponent(CHECKOUT)}`}
              className="text-xs text-ink-soft underline underline-offset-4 transition hover:text-accent"
            >
              Sign in
            </Link>
          )}
        </div>

        <div className="mt-4">
          <Field
            label="Email address"
            type="email"
            inputMode="email"
            autoComplete="email"
            hint="Your order confirmation goes here."
            {...field("email")}
          />
        </div>
      </section>

      <section aria-labelledby="delivery-heading">
        <h2 id="delivery-heading" className="font-display text-xl text-ink">
          Delivery
        </h2>

        <div className="mt-4 flex flex-col gap-4">
          {/* Stated, not asked — see COUNTRY above. Styled to match the fields
              below it, so the row reads as part of the same column. */}
          <div className="flex h-14 flex-col justify-center rounded-sm border border-line-strong bg-canvas-alt px-4">
            <span className="text-[0.6875rem] text-ink-muted">Country/Region</span>
            <span className="mt-0.5 text-sm text-ink">{COUNTRY}</span>
          </div>

          <Field label="Full name" autoComplete="name" {...field("fullName")} />

          <Field
            label="Address"
            multiline
            rows={2}
            autoComplete="street-address"
            hint="House or flat number, street, area."
            {...field("address")}
          />

          <Field label="Order notes or landmark" optional multiline rows={2} {...field("notes")} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" autoComplete="address-level2" {...field("city")} />
            <Field
              label="Postal code"
              optional
              inputMode="numeric"
              autoComplete="postal-code"
              {...field("postalCode")}
            />
          </div>

          <Field
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            hint="So the courier can reach you — 03001234567"
            {...field("phone")}
          />

          {/* The reference design's "Save this information for next time".
              What it actually does is in `lib/savedCheckout.ts`; unticking it
              also FORGETS anything this device is already holding, which is
              worth saying rather than leaving to the label alone. */}
          <label className="flex cursor-pointer items-start gap-3 pt-1">
            <input
              type="checkbox"
              checked={remember}
              disabled={busy}
              onChange={(event) => setRemember(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span className="text-sm leading-relaxed text-ink-soft select-none">
              Save this information for next time
              <span className="mt-1 block text-xs text-ink-muted">
                Kept on this device only, so checkout opens filled in. Untick to forget it.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* Requirements section 10 — the delivery charge is admin-configured and
          has to be visible. One rate, nationwide, so this states which one the
          bag qualified for instead of offering a choice that does not exist.
          The figure is display only: the server recomputes it (section 17). */}
      <section aria-labelledby="shipping-heading">
        <h2 id="shipping-heading" className="font-display text-xl text-ink">
          Shipping method
        </h2>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-sm border border-ink bg-canvas-alt px-5 py-4">
          <span className="flex items-center gap-3">
            <ChosenDot />
            <span className="text-sm text-ink">Standard delivery &middot; 2-4 working days</span>
          </span>
          <span className="shrink-0 text-sm font-medium tabular-nums text-ink">
            {deliveryCharge === 0 ? (
              <span className="tracking-eyebrow text-success uppercase">Free</span>
            ) : (
              formatPrice(deliveryCharge)
            )}
          </span>
        </div>
      </section>

      {/* Requirements section 9 — cash on delivery is the only method in v1, so
          this is a statement rather than a choice. A single radio button
          pretending to be a decision is worse than saying what happens.

          The words come from `shared/payment.ts` rather than being written
          here, because the confirmation page and the admin dashboard describe
          the same order and must not describe it differently (§18). The method
          itself is NOT submitted with the form: the server decides it, and a
          browser that could name how an order is paid could declare one paid
          (§17). */}
      <section aria-labelledby="payment-heading">
        <h2 id="payment-heading" className="font-display text-xl text-ink">
          Payment
        </h2>

        <div className="mt-4 rounded-sm border border-ink bg-canvas-alt px-5 py-4">
          <span className="flex items-center gap-3">
            <ChosenDot />
            <span className="text-sm font-medium text-ink">{payment.label}</span>
          </span>
          <p className="mt-2 pl-7 text-sm leading-relaxed text-ink-soft">{payment.blurb}</p>
        </div>
      </section>

      <div>
        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {submitting ? "Placing your order…" : `Complete order · ${formatPrice(total)}`}
        </Button>

        <p className="mt-4 text-center text-xs leading-relaxed text-ink-soft">
          No account needed. {payment.agreement}
        </p>
      </div>
    </form>
  );
}

/**
 * The "this is the one you are getting" mark on the shipping and payment rows.
 *
 * Deliberately NOT a disabled radio input: a radio says "choose", and a
 * disabled one says "you may not choose", when the truth is that there is one
 * method and it is already yours. This is the reference design's filled dot,
 * and it is decoration — the words beside it carry the meaning.
 */
function ChosenDot() {
  return (
    <span
      aria-hidden="true"
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-ink"
    >
      <span className="h-2 w-2 rounded-full bg-ink" />
    </span>
  );
}
