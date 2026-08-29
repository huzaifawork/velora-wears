import { useRef, useState } from "react";

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

/**
 * The checkout form (requirements sections 7 and 17).
 *
 * **No account is asked for anywhere in it.** Section 7 makes guest checkout
 * mandatory, so there is no sign-in step, no "continue as guest" fork, and no
 * password: an email address is contact detail here, not an identity.
 *
 * The validation rules are NOT written in this file. They live in
 * `shared/checkout.ts`, which mirrors the `place-order` Edge Function exactly,
 * because a form that is looser than the server lets a customer fill
 * everything in and then be rejected by a machine for a reason the form never
 * mentioned. This component only decides WHEN to show what that module says.
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
 * ### The draft is not persisted
 *
 * Going back to the bag and returning loses what was typed. That is deliberate:
 * the alternative is a name, phone number and home address sitting in browser
 * storage, which is a poor trade for a step the customer has little reason to
 * leave — the bag is shown beside the form precisely so they do not have to.
 */

/**
 * Version one takes one method and does not ask which (section 9), so this is
 * resolved once at module level rather than being state the form carries.
 * When a second method exists it becomes a choice, and this is the line that
 * changes.
 */
const payment = PAYMENT_METHOD_COPY[DEFAULT_PAYMENT_METHOD];

export function CheckoutForm({
  total,
  submitting,
  /** Field errors the SERVER returned. It is the authority; these override. */
  serverErrors,
  disabled = false,
  /**
   * What to open the form with — a signed-in customer's email, and their
   * most recent order's delivery details, so an account can genuinely "skip
   * re-typing details next time" as the note added to section 12 promises.
   * A guest gets `EMPTY_CHECKOUT_DRAFT`. Read once, on mount: the draft is
   * the customer's from then on, and re-applying it out from under them if
   * their account data loads a moment later would overwrite what they typed.
   */
  initialValues,
  onSubmit,
}: {
  total: number;
  submitting: boolean;
  serverErrors?: CheckoutErrors;
  disabled?: boolean;
  initialValues?: Partial<CheckoutDraft>;
  onSubmit: (customer: OrderCustomer) => void;
}) {
  const [draft, setDraft] = useState<CheckoutDraft>(() => ({
    ...EMPTY_CHECKOUT_DRAFT,
    ...initialValues,
  }));
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
    onSubmit(customer);
  }

  const busy = submitting || disabled;

  /** Shared wiring, so seven fields do not repeat the same four props. */
  const field = (name: CheckoutField) => ({
    value: draft[name],
    error: errorFor(name),
    maxLength: CHECKOUT_LIMITS[name].max,
    disabled: busy,
    onChange: (value: string) => change(name, value),
    onBlur: () => setReporting((current) => ({ ...current, [name]: true })),
  });

  return (
    // `noValidate` hands validation to the rules above rather than to the
    // browser's own, which cannot know a Pakistani mobile from any other
    // number and whose bubbles cannot be styled or read consistently.
    <form ref={form} onSubmit={handleSubmit} noValidate className="flex flex-col gap-10">
      <section aria-labelledby="delivery-heading">
        <h2
          id="delivery-heading"
          className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase"
        >
          Delivery details
        </h2>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Full name" autoComplete="name" className="sm:col-span-2" {...field("fullName")} />

          <Field label="Email address" type="email" inputMode="email" autoComplete="email" {...field("email")} />

          <Field
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            hint="So the courier can reach you — 03001234567"
            {...field("phone")}
          />

          <Field
            label="Complete address"
            multiline
            rows={3}
            autoComplete="street-address"
            hint="House or flat number, street, area."
            className="sm:col-span-2"
            {...field("address")}
          />

          <Field label="City" autoComplete="address-level2" {...field("city")} />

          <Field
            label="Postal code"
            optional
            inputMode="numeric"
            autoComplete="postal-code"
            {...field("postalCode")}
          />

          <Field
            label="Order notes or landmark"
            optional
            multiline
            rows={2}
            className="sm:col-span-2"
            {...field("notes")}
          />
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
        <h2
          id="payment-heading"
          className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase"
        >
          Payment
        </h2>

        <div className="mt-6 rounded-sm border border-line bg-canvas-alt p-5">
          <p className="font-display text-lg text-ink">{payment.label}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{payment.blurb}</p>
        </div>
      </section>

      <div>
        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {submitting ? "Placing your order…" : `Place order · ${formatPrice(total)}`}
        </Button>

        <p className="mt-4 text-center text-xs leading-relaxed text-ink-soft">
          No account needed. {payment.agreement}
        </p>
      </div>
    </form>
  );
}
