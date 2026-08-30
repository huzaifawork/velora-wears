/**
 * Turning a Postgres or PostgREST failure into a sentence an admin can act on.
 *
 * Supabase surfaces database errors more or less raw. `duplicate key value
 * violates unique constraint "products_slug_key"` is precise, correct, and
 * useless to the person who just typed a product name that already exists —
 * and worse, the two failures an admin will actually hit most often say
 * nothing about their real cause:
 *
 *   - a `42501` / "new row violates row-level security policy" almost always
 *     means the signed-in account's `profiles.role` is not `'admin'`, not
 *     that anything is wrong with the data;
 *   - a foreign key violation on `products_category_slug_fkey` means "that
 *     category was deleted while this form was open".
 *
 * So every write in `services/` funnels its error through here. Anything not
 * recognised falls back to the raw message rather than a generic apology —
 * an unhelpful specific error still beats a helpful vague one when the next
 * step is sending it to a developer.
 */

interface SupabaseLikeError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

function asError(value: unknown): SupabaseLikeError {
  return typeof value === "object" && value !== null ? (value as SupabaseLikeError) : {};
}

/** Constraint names mapped to what the admin actually did wrong. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  products_slug_key:
    "A product with this web address (slug) already exists. Change the slug — or the name, which generates it.",
  categories_pkey: "A category with this slug already exists. Choose a different one.",
  products_category_slug_fkey:
    "That category no longer exists. Reload the page and pick another one.",
  product_sizes_pkey: "That size is already listed for this product.",
  reviews_order_id_product_id_key:
    "That order already has a review for this product.",
  orders_order_number_key: "An order with this number already exists.",
};

export function describeError(value: unknown): string {
  const error = asError(value);
  const raw = error.message ?? String(value);

  // Row level security. The single most likely first-run failure, and the one
  // whose raw message points hardest in the wrong direction.
  if (
    error.code === "42501" ||
    /row-level security|violates row level security/i.test(raw)
  ) {
    return "Your account is not permitted to make this change. An administrator has to set your profiles.role to 'admin' before the dashboard can write anything.";
  }

  // A unique or foreign key violation, matched on the constraint name that
  // Postgres puts in the message.
  if (error.code === "23505" || error.code === "23503") {
    for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
      if (raw.includes(constraint)) return message;
    }
    if (error.code === "23505") return "That value is already used by another record.";
    return "This record is still referenced by something else, so it cannot be changed or removed yet.";
  }

  // A check constraint — a negative price, negative stock, a second settings row.
  if (error.code === "23514") {
    if (raw.includes("stock")) return "Stock cannot be negative.";
    if (raw.includes("price")) return "Price cannot be negative.";
    if (raw.includes("delivery_charge")) return "The delivery charge cannot be negative.";
    return "That value is outside what the database allows.";
  }

  // A restricted delete: the category still has products, or the product is on
  // an order (`order_items.product_id` is `on delete restrict` deliberately —
  // deleting a product must never rewrite what a customer bought).
  if (/violates foreign key constraint/i.test(raw) && /order_items/.test(raw)) {
    return "This product appears on a customer order, so it cannot be deleted — a past order must always show what was actually bought. Deactivate it instead: it disappears from the shop and the order history stays intact.";
  }

  if (/violates foreign key constraint/i.test(raw) && /products_category/.test(raw)) {
    return "This category still has products in it. Move or delete them first.";
  }

  if (/Failed to fetch|NetworkError|network/i.test(raw)) {
    return "Could not reach the database. Check your connection and try again.";
  }

  // Storage: the bucket's own limits (see the migration), enforced server-side.
  if (/exceeded the maximum allowed size|Payload too large/i.test(raw)) {
    return "That image is too large even after compression. Try a smaller file.";
  }
  if (/mime type .* is not supported/i.test(raw)) {
    return "That file type is not accepted. Upload a JPEG, PNG, WebP or AVIF image.";
  }

  return raw;
}

/**
 * Throws with a readable message, or returns the data.
 *
 * Every service call ends in this, so no caller has to remember that Supabase
 * returns `{ data, error }` rather than rejecting.
 */
export function unwrap<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw new Error(describeError(error));
  return data;
}
