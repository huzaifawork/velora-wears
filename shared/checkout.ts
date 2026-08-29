/**
 * Velora Wears — the checkout RULES (requirements sections 7 and 17).
 *
 * ONE definition of what a valid order form is, shared by both halves of
 * checkout, because they have to agree exactly:
 *
 *   the storefront   marks a field invalid as the customer fills it in and
 *                    refuses to submit while anything required is missing.
 *   the server       re-validates every field before an order is written, and
 *                    is the only one of the two that decides anything.
 *
 * Requirements section 17 is explicit that client-side validation "is for user
 * experience only and must never be the only defence". The failure mode that
 * matters is the other way round though: a client that is LOOSER than the
 * server lets a customer fill in the form, press the button, and be rejected
 * by a machine for a reason the form never mentioned. So the rules below are
 * the server's rules, to the letter — same patterns, same bounds, same
 * messages — and nothing is validated here that the server does not also
 * check.
 *
 * ---------------------------------------------------------------------------
 * THE SERVER'S COPY LIVES IN `supabase/functions/place-order/index.ts`.
 * ---------------------------------------------------------------------------
 * It is a Deno function, deployed on its own by the Supabase CLI rather than
 * built with the storefront, and the CLI bundles only what is under
 * `supabase/`, so it cannot import this file. It therefore carries the same
 * constants inline, and CHANGING A RULE MEANS CHANGING BOTH. A drift check
 * that reads the two files and compares them is described in the section 7
 * notes in `context.md`.
 *
 * Note that section 17 describes the name field as "letters and common name
 * characters". No character rule is applied to it here, because the server
 * applies none either: a client-only charset check would reject names the
 * server is perfectly happy with — Pakistani names carry apostrophes, hyphens
 * and dots — and inventing one on this side alone is exactly the drift this
 * file exists to prevent.
 */

import type { OrderCustomer } from "./types";

/** Every field on the checkout form, required and optional alike. */
export type CheckoutField =
  | "fullName"
  | "email"
  | "phone"
  | "address"
  | "city"
  | "postalCode"
  | "notes";

/** The form as the customer types it: strings, always, never undefined. */
export type CheckoutDraft = Record<CheckoutField, string>;

export const CHECKOUT_FIELDS: readonly CheckoutField[] = [
  "fullName",
  "email",
  "phone",
  "address",
  "city",
  "postalCode",
  "notes",
];

/**
 * Required per the authoritative table in requirements section 17 — which
 * deliberately overrides section 7 by making the POSTAL CODE optional.
 */
export const REQUIRED_CHECKOUT_FIELDS: readonly CheckoutField[] = [
  "fullName",
  "email",
  "phone",
  "address",
  "city",
];

export function isRequiredCheckoutField(field: CheckoutField): boolean {
  return REQUIRED_CHECKOUT_FIELDS.includes(field);
}

export const EMPTY_CHECKOUT_DRAFT: CheckoutDraft = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  postalCode: "",
  notes: "",
};

/* --------------------------------------------------------------------------
 * Patterns and bounds. Mirrored in the Edge Function.
 * ----------------------------------------------------------------------- */

/** Pakistani mobile: 03XXXXXXXXX, +923XXXXXXXXX or 00923XXXXXXXXX. */
export const PAKISTAN_MOBILE = /^(?:\+92|0092|0)3\d{9}$/;

/**
 * Deliberately permissive. A stricter grammar rejects real addresses, and the
 * only thing that proves an email works is sending to it — this rules out the
 * typos a customer can see, and nothing more.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Pakistan Post uses a five-digit code. Checked only when one is given. */
export const POSTAL_CODE_PATTERN = /^\d{5}$/;

/** Length bounds, also used as the `maxLength` on the inputs themselves. */
export const CHECKOUT_LIMITS = {
  fullName: { min: 2, max: 80 },
  email: { min: 3, max: 160 },
  /** Long enough for "+92 300 1234567" typed with the spaces in. */
  phone: { min: 11, max: 20 },
  address: { min: 10, max: 300 },
  city: { min: 2, max: 60 },
  postalCode: { min: 5, max: 5 },
  notes: { min: 0, max: 500 },
} as const satisfies Record<CheckoutField, { min: number; max: number }>;

/**
 * The bag's caps. They are checkout rules rather than cart rules — the server
 * enforces them in the Edge Function AND again in `place_order()` — so they
 * live beside the rest of the payload contract instead of only in the
 * storefront's cart module (requirements section 17, reject oversized input).
 */
export const MAX_ORDER_LINES = 20;
export const MAX_QTY_PER_LINE = 10;

/* --------------------------------------------------------------------------
 * Normalisation. What the customer typed is not what gets validated or
 * stored: the server trims and collapses whitespace first, so whitespace-only
 * input is blank (requirements section 17) and "  Ali   Raza " is one name.
 * The client must normalise identically, or the two disagree about lengths.
 * ----------------------------------------------------------------------- */

export function cleanField(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/** Spaces and dashes are how people actually type a phone number. */
export function normalisePhone(value: unknown): string {
  return cleanField(value).replace(/[\s-]/g, "");
}

/** The draft as the SERVER will read it. Validate and submit this, not the raw draft. */
export function normaliseCheckout(draft: Partial<CheckoutDraft>): CheckoutDraft {
  return {
    fullName: cleanField(draft.fullName),
    email: cleanField(draft.email).toLowerCase(),
    phone: normalisePhone(draft.phone),
    address: cleanField(draft.address),
    city: cleanField(draft.city),
    postalCode: cleanField(draft.postalCode),
    notes: cleanField(draft.notes),
  };
}

/* --------------------------------------------------------------------------
 * Validation.
 * ----------------------------------------------------------------------- */

/**
 * Checks ONE normalised field. Returns the message to show, or null.
 *
 * Per-field rather than whole-form, so the same rule can run on blur, on the
 * next keystroke after a field has already been marked wrong, and on submit —
 * which is what section 17 means by validating "both as the customer fills the
 * form and again when they submit".
 *
 * The messages are the Edge Function's own, word for word, so a customer who
 * somehow reaches the server with a bad value is told the same thing twice
 * rather than two different things.
 */
export function validateCheckoutField(field: CheckoutField, value: string): string | null {
  const limits = CHECKOUT_LIMITS[field];

  switch (field) {
    case "fullName":
      return value.length < limits.min || value.length > limits.max
        ? "Please enter your full name."
        : null;

    case "email":
      return !EMAIL_PATTERN.test(value) || value.length > limits.max
        ? "Please enter a valid email address."
        : null;

    case "phone":
      return PAKISTAN_MOBILE.test(value)
        ? null
        : "Enter a Pakistani mobile number, for example 03001234567.";

    case "address":
      return value.length < limits.min || value.length > limits.max
        ? "Please enter a complete delivery address."
        : null;

    case "city":
      return value.length < limits.min || value.length > limits.max
        ? "Please enter your city."
        : null;

    // Optional per requirements section 17 — checked for format only if given.
    case "postalCode":
      return value && !POSTAL_CODE_PATTERN.test(value)
        ? "A Pakistani postal code is 5 digits."
        : null;

    case "notes":
      return value.length > limits.max
        ? "Please keep the note under 500 characters."
        : null;
  }
}

export type CheckoutErrors = Partial<Record<CheckoutField, string>>;

export interface CheckoutValidation {
  /** The normalised values, ready to send. Optional fields are dropped when blank. */
  customer: OrderCustomer;
  errors: CheckoutErrors;
  valid: boolean;
}

/** Validates the whole form. This is what gates the submit button. */
export function validateCheckout(draft: Partial<CheckoutDraft>): CheckoutValidation {
  const clean = normaliseCheckout(draft);
  const errors: CheckoutErrors = {};

  for (const field of CHECKOUT_FIELDS) {
    const message = validateCheckoutField(field, clean[field]);
    if (message) errors[field] = message;
  }

  return {
    customer: {
      fullName: clean.fullName,
      email: clean.email,
      phone: clean.phone,
      address: clean.address,
      city: clean.city,
      // Absent rather than empty: the database stores null for a blank one, and
      // an empty string would read as "the customer gave us one" downstream.
      ...(clean.postalCode ? { postalCode: clean.postalCode } : {}),
      ...(clean.notes ? { notes: clean.notes } : {}),
    },
    errors,
    valid: Object.keys(errors).length === 0,
  };
}
