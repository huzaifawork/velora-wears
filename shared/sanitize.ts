/**
 * Velora Wears — text sanitisation (requirements section 17: "Sanitise and
 * escape all customer-supplied text — including names, addresses, and review
 * comments — before storing or displaying it").
 *
 * **Escaping is React's job, and it already does it.** Every piece of
 * customer text in this app is rendered as a plain text node — nothing in
 * `storefront/` uses `dangerouslySetInnerHTML` — so HTML injection is not a
 * live risk here; React escapes on render regardless of what was stored.
 *
 * **Sanitising BEFORE storing is this file's job**, and it is a narrower,
 * separate thing: stripping the characters that have no business being in a
 * name, an address or a review — control characters, and the invisible
 * Unicode characters spammers use to break simple text filters or pad a
 * short comment past a length check. `shared/checkout.ts` and
 * `shared/reviews.ts` both call this before their own trim-and-collapse
 * normalisation runs.
 *
 * THE SERVER'S COPY IS INLINE IN BOTH EDGE FUNCTIONS, for the same reason
 * every other shared rule is: Deno bundles only what is under `supabase/`
 * and cannot import this file.
 */

/**
 * C0 and C1 control characters (excluding tab, newline, carriage return,
 * which `cleanField`/`cleanReviewText` already collapse into a single space
 * immediately after this runs), the zero-width characters used to hide text
 * inside otherwise-innocent-looking input (U+200B-U+200F), and the
 * byte-order mark (U+FEFF).
 *
 * Built with `new RegExp` from an escaped string, not a regex literal — every
 * character this matches is written as a `\xNN` / `\uNNNN` escape, so the
 * source file itself contains no actual control or invisible characters.
 * A file whose job is stripping hidden characters should not be hiding any
 * of its own.
 */
const UNSAFE_CHARS = new RegExp(
  "[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F-\\x9F\\u200B-\\u200F\\uFEFF]",
  "g",
);

export function stripUnsafeChars(value: string): string {
  return value.replace(UNSAFE_CHARS, "");
}
