/**
 * Slugs — the web address a product or category is reachable at.
 *
 * The storefront's canonical product URL is `/products/<slug>` and its
 * category URL is `/products?category=<slug>` (`storefront/src/lib/routes.ts`),
 * so a slug is not an internal detail: it is a public, linkable, shareable
 * address that ends up in a customer's history and in search results.
 *
 * Two consequences the forms in this dashboard are built around:
 *
 *  1. A slug is DERIVED from the name while a record is new, and then it stops
 *     following the name. Renaming "Noor Linen Shirt" to "Noor Linen Shirt
 *     (Ecru)" must not silently break every link to it — so the editor
 *     generates the slug up to the moment the record is first saved, and
 *     afterwards only changes it if the admin edits it deliberately.
 *  2. It is generated the same way every time, here, rather than by whichever
 *     form happens to need one.
 */

/**
 * `"Noor Linen Shirt — Ecru"` -> `"noor-linen-shirt-ecru"`.
 *
 * Non-ASCII letters are transliterated where the browser can (`normalize` +
 * stripping combining marks handles accented Latin), and anything left that is
 * not a letter, a digit or a hyphen becomes a hyphen. A slug that came out
 * empty — a name written entirely in a script this cannot transliterate — is
 * the caller's problem to notice; `isValidSlug` below is what the form checks.
 */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * What the database and the URL will both accept: lowercase, digits and
 * single hyphens, not starting or ending with one.
 */
export function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

export const SLUG_HINT =
  "Lowercase letters, numbers and hyphens. This is the product's web address — changing it on a live product breaks existing links to it.";
