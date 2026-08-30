/**
 * Formatting, in one place, so money and dates are never written two ways
 * (requirements section 18).
 *
 * The price and rating helpers deliberately match `storefront/src/lib/
 * format.ts` character for character in their output — an admin reading
 * "Rs 4,290" in the dashboard and a customer reading it in the shop must be
 * looking at the same string, or checking a disputed order becomes an exercise
 * in mental arithmetic.
 *
 * Money is a whole number of rupees everywhere in this project (see the note
 * at the top of `20260829000001_init.sql`); nothing here rounds.
 */

const rupees = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

/** `4290` -> `Rs 4,290`. */
export function formatPrice(amount: number): string {
  return `Rs ${rupees.format(amount)}`;
}

/** `4290` -> `4,290`. For table cells where a column header already says "Price". */
export function formatNumber(amount: number): string {
  return rupees.format(amount);
}

/** `4.75` -> `4.8`. Ratings are shown to one decimal place everywhere. */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

const dateFormat = new Intl.DateTimeFormat("en-PK", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-PK", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** `1755043200000` -> `12 Aug 2026`. */
export function formatDate(timestamp: number): string {
  return dateFormat.format(new Date(timestamp));
}

/**
 * `12 Aug 2026, 4:30 pm`. Orders get the time as well as the date: two orders
 * from the same customer on the same day are otherwise indistinguishable in a
 * list, which is exactly when an admin is looking.
 */
export function formatDateTime(timestamp: number): string {
  return dateTimeFormat.format(new Date(timestamp));
}

/**
 * `2 hours ago`, `just now`. Used beside the absolute time on the orders list,
 * because "is this new?" is the question an admin actually asks of an order,
 * and a timestamp makes them do the subtraction.
 */
export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000);

  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;

  return formatDate(timestamp);
}

/** `hoodies` -> `Hoodies`. A stand-in until a real display name is available. */
export function prettifySlug(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

/** `12` -> `12 pieces`, `1` -> `1 piece`. The plural is decided once. */
export function formatPieceCount(count: number): string {
  return `${count} ${count === 1 ? "piece" : "pieces"}`;
}

/** `1536000` -> `1.5 MB`. Upload sizes, so "compressed from X to Y" is legible. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
