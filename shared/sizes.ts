/**
 * Velora Wears — SIZE SCALES.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * The shop shipped with `type Size = "S" | "M" | "L"` and a `product_size`
 * Postgres enum to match. That was never a description of what the shop sells —
 * it was a description of the first few products in it. A sneaker does not come
 * in Medium and a trouser does not come in Large; they come in EU 42 and in a
 * 32 inch waist. With one global enum the admin had three boxes to type into
 * whatever the piece was, and the storefront rendered "Small / Medium / Large"
 * under a photograph of a shoe.
 *
 * A SIZE SCALE is the set of sizes one KIND of garment is measured in, in the
 * order it is always shown. A product names its scale; its stock rows name
 * codes from that scale. Nothing else in the system needs to know that shoes
 * are different from shirts.
 *
 * ---------------------------------------------------------------------------
 * THE TWO THINGS A SIZE CODE IS NOT
 * ---------------------------------------------------------------------------
 * 1. It is NOT a closed enum any more. `Size` is a string, and the authority on
 *    which strings a given product accepts is that product's OWN stock rows —
 *    not this file. This file only decides ORDER and WORDING. A checkout that
 *    validated against a global list would reject a size the admin had just
 *    added, and accept one this product has never come in; the database already
 *    answers the real question ("is there a stock row for this product and this
 *    size?") and that is the check that matters.
 *
 * 2. It is NOT a display string. `code` is what is stored and compared; `short`
 *    is what goes on a size button; `label` is what a screen reader and an
 *    order line say. "42" / "42" / "EU 42" are three different jobs.
 *
 * ---------------------------------------------------------------------------
 * ADDING A SCALE
 * ---------------------------------------------------------------------------
 * Add it to `SIZE_SCALES` here, and to the `products_size_scale_known` check
 * constraint in `supabase/migrations/20260902000002_size_scales.sql`. Those two
 * lists are the same list, and the migration says so beside the constraint.
 * Nothing else needs touching — every screen reads scales through this file.
 */

/** The scales the shop sells in. Mirrored by the SQL check constraint. */
export type SizeScaleId =
  | "alpha"
  | "waist-in"
  | "shoe-eu"
  | "shoe-uk"
  | "one-size";

/**
 * A size code as stored: `product_sizes.size`, `order_items.size`, the cart.
 *
 * Deliberately `string` and not a union — see the note above. Kept as a named
 * type because "this string is a size" is worth saying at every boundary it
 * crosses, and because it is what the whole codebase already imports.
 */
export type Size = string;

export interface SizeOption {
  /** Stored and compared. Never shown on its own for a numeric scale. */
  code: Size;
  /** What goes on a size button — short enough for a small circle. */
  short: string;
  /** The full name, for screen readers, order lines and admin labels. */
  label: string;
}

export interface SizeScale {
  id: SizeScaleId;
  /** How the admin picks it out of a dropdown. */
  name: string;
  /** One line under the dropdown saying what it is for. */
  description: string;
  sizes: readonly SizeOption[];
}

const alpha = (code: string, label: string): SizeOption => ({ code, short: code, label });

const inches = (n: string, noun: string): SizeOption => ({
  code: n,
  short: n,
  label: `${n} inch ${noun}`,
});

const region = (prefix: string, n: string): SizeOption => ({
  code: n,
  short: n,
  label: `${prefix} ${n}`,
});

/**
 * Every scale, keyed by id. The ORDER of `sizes` is the order every surface
 * shows them in — the size buttons on the product page, the stock fields in the
 * product editor, and the columns on the inventory screen all read it from
 * here, so they cannot disagree.
 */
export const SIZE_SCALES: Record<SizeScaleId, SizeScale> = {
  alpha: {
    id: "alpha",
    name: "Clothing (XS – 3XL)",
    description: "Shirts, tees, hoodies, sweatshirts — anything measured small to large.",
    sizes: [
      alpha("XS", "Extra small"),
      alpha("S", "Small"),
      alpha("M", "Medium"),
      alpha("L", "Large"),
      alpha("XL", "Extra large"),
      alpha("XXL", "Double extra large"),
      alpha("3XL", "Triple extra large"),
    ],
  },

  "waist-in": {
    id: "waist-in",
    name: "Waist (inches)",
    description: "Trousers, jeans, shorts — sized by the waist measurement.",
    sizes: [
      inches("28", "waist"),
      inches("30", "waist"),
      inches("32", "waist"),
      inches("34", "waist"),
      inches("36", "waist"),
      inches("38", "waist"),
      inches("40", "waist"),
      inches("42", "waist"),
    ],
  },

  "shoe-eu": {
    id: "shoe-eu",
    name: "Shoes (EU)",
    description: "Sneakers, sandals, boots — European sizing, the usual scale here.",
    sizes: [
      region("EU", "38"),
      region("EU", "39"),
      region("EU", "40"),
      region("EU", "41"),
      region("EU", "42"),
      region("EU", "43"),
      region("EU", "44"),
      region("EU", "45"),
      region("EU", "46"),
    ],
  },

  "shoe-uk": {
    id: "shoe-uk",
    name: "Shoes (UK)",
    description: "For ranges quoted in UK sizes rather than European ones.",
    sizes: [
      region("UK", "5"),
      region("UK", "6"),
      region("UK", "7"),
      region("UK", "8"),
      region("UK", "9"),
      region("UK", "10"),
      region("UK", "11"),
      region("UK", "12"),
    ],
  },

  "one-size": {
    id: "one-size",
    name: "One size",
    description: "Caps, belts, bags, scarves — anything that does not come in sizes.",
    sizes: [{ code: "OS", short: "One size", label: "One size" }],
  },
};

/**
 * What a product is on unless it says otherwise.
 *
 * `alpha` is not an arbitrary default: it CONTAINS S, M and L, which is every
 * size code that existed before scales did. That is what lets the migration
 * convert the old enum to text and set this default without touching a single
 * stock row — every historic row is already a valid `alpha` code.
 */
export const DEFAULT_SIZE_SCALE: SizeScaleId = "alpha";

/** In the order the admin's dropdown offers them. */
export const SIZE_SCALE_LIST: readonly SizeScale[] = Object.values(SIZE_SCALES);

export function isSizeScaleId(value: unknown): value is SizeScaleId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SIZE_SCALES, value);
}

/**
 * The scale a product is on. Falls back to `alpha` rather than throwing: an id
 * this build does not recognise is a deployment one version behind, and a
 * product page that renders its sizes in a slightly wrong order is better than
 * one that renders a stack trace.
 */
export function sizeScale(id: string | undefined): SizeScale {
  return isSizeScaleId(id) ? SIZE_SCALES[id] : SIZE_SCALES[DEFAULT_SIZE_SCALE];
}

/** Every code the scale offers, in display order. What the admin can tick. */
export function scaleSizeCodes(id: string | undefined): readonly Size[] {
  return sizeScale(id).sizes.map((size) => size.code);
}

function optionFor(id: string | undefined, code: Size): SizeOption | undefined {
  return sizeScale(id).sizes.find((size) => size.code === code);
}

/**
 * The long name — "Extra large", "EU 42", "32 inch waist".
 *
 * Falls back to the raw code for a size that is not on the scale. That happens
 * for real: a product moved from `alpha` to `shoe-eu` keeps its old stock rows
 * until an admin clears them, and an order placed months ago carries whatever
 * code was current then. Showing "L" is honest; showing nothing is not.
 */
export function sizeLabel(id: string | undefined, code: Size): string {
  return optionFor(id, code)?.label ?? code;
}

/** The short form, for a size button or a table column heading. */
export function sizeShort(id: string | undefined, code: Size): string {
  return optionFor(id, code)?.short ?? code;
}

/**
 * Put a product's OWN size codes into its scale's order.
 *
 * The codes come from the stock rows, so this is the function that decides what
 * a product page shows: a shirt stocked only in S, M and L shows three buttons,
 * not seven with four struck out. A code the scale does not know is kept and
 * pushed to the end — never dropped, because a size with stock in it is a size
 * a customer can buy.
 */
export function orderSizeCodes(id: string | undefined, codes: Iterable<Size>): Size[] {
  const order = scaleSizeCodes(id);
  const rank = new Map(order.map((code, index) => [code, index]));

  return [...new Set(codes)].sort((a, b) => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

/**
 * How to word the size on a line of a PLACED ORDER.
 *
 * Takes the snapshot and falls back to the code — and deliberately never
 * consults a scale, because the product's scale today is not necessarily the
 * one it was sold under. This is the only correct way to render `OrderItem`,
 * `Order` receipts, and the guest review lookup, so it lives here rather than
 * being re-derived at each of them.
 */
export function orderLineSize(line: { size: Size; sizeLabel?: string }): string {
  return line.sizeLabel?.trim() || line.size;
}

/** The longest a size code may be, in the database and everywhere else. */
export const MAX_SIZE_CODE_LENGTH = 16;

/**
 * Is this a plausible size code AT ALL — the shape check, not the "does this
 * product come in it" check.
 *
 * Used where untrusted text arrives (the saved cart, the checkout payload)
 * purely to reject junk before it reaches the database. The real answer comes
 * from the product's stock rows; see the note at the top of this file.
 */
export function isPlausibleSizeCode(value: unknown): value is Size {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SIZE_CODE_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9. /-]*$/.test(value)
  );
}
