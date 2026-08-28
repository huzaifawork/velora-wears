/**
 * Shared formatting helpers. Prices are formatted in exactly one place, so a
 * change to how money is displayed never has to be hunted down across pages
 * (requirements section 18).
 *
 * Money is stored as a whole number of rupees — there are no paisa amounts in
 * this catalog, and rounding never enters the picture.
 */

const rupees = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

/** `4290` -> `Rs 4,290`. */
export function formatPrice(amount: number): string {
  return `Rs ${rupees.format(amount)}`;
}

/** `4.75` -> `4.8`. Ratings are shown to one decimal place everywhere. */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/**
 * `hoodies` -> `Hoodies`. A stand-in for a category's real display name, used
 * on a product card before the categories have loaded and in the page title
 * while a category page is still fetching. Always prefer the `name` on the
 * `Category` record when it is available.
 */
export function prettifySlug(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * `1755043200000` -> `12 Aug 2026`. Used on reviews now, and by the order
 * pages in sections 7 and 12 — dates are formatted in exactly one place.
 */
const dateFormat = new Intl.DateTimeFormat("en-PK", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(timestamp: number): string {
  return dateFormat.format(new Date(timestamp));
}
