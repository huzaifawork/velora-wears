/**
 * Velora Wears — shared data contract.
 *
 * SOURCE OF TRUTH for the shape of everything in the Realtime Database.
 * Both the storefront and the admin dashboard must conform to this file.
 * Changing a type here is a breaking change for the other developer — agree
 * it between both sides before editing.
 */

import type { PaymentMethod } from "./payment";
import type { Size, SizeScaleId } from "./sizes";

export type { PaymentMethod };

/**
 * A size code, and the scale it belongs to.
 *
 * **This used to be `"S" | "M" | "L"`.** It is now an open string, because a
 * shoe is not sized on the same scale as a shirt — see `shared/sizes.ts` for
 * the whole reasoning and for the helpers that order and label a code. Which
 * codes a PARTICULAR product accepts is answered by its own `sizes` map, never
 * by a global list.
 */
export type { Size, SizeScaleId };

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Image variants. Stored at write time so the client never downloads more than it shows. */
export interface ProductImage {
  /** Small, for cards and thumbnails in list views. */
  thumb: string;
  /** Full size, for the product detail gallery. */
  full: string;
  alt?: string;
  /** Intrinsic dimensions — lets the UI reserve space and avoid layout shift. */
  width?: number;
  height?: number;
}

export interface SizeStock {
  stock: number;
}

/**
 * `productSummaries/{productId}` — the LIST view projection.
 *
 * Deliberately small and denormalised so the products grid, search, and category
 * pages each load one flat node instead of fetching full product documents.
 * Written by the admin dashboard whenever the corresponding product changes.
 */
export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  price: number;
  categorySlug: string;
  /** Card-sized image only — never the full-resolution one. */
  thumb: string;
  /** Precomputed so listings never have to read the sizes map to know availability. */
  inStock: boolean;
  lowStock: boolean;
  /**
   * Units left across every size. Section 11 asks for the "available product
   * quantity" to be shown, and a grid cannot read the per-size map to work it
   * out (§19) — so the summary carries the total, exactly as `product_summaries`
   * has always computed it. Optional, because a summary from a source that
   * predates the field is still a usable summary: treat a missing value as
   * "unknown", not as zero, and fall back to the two flags above.
   */
  totalStock?: number;
  /**
   * The product's size scale, denormalised onto the summary so the inventory
   * screen can label a stock column without reading the full product.
   *
   * ADDITIVE and optional, like `totalStock`: read a missing value as `alpha`.
   */
  sizeScale?: SizeScaleId;
  ratingAvg: number;
  ratingCount: number;
  active: boolean;
  createdAt: number;
  /** Lowercased name + category, for prefix search without downloading the catalog. */
  searchText: string;
  /**
   * Chosen by the admin for the landing page's featured strip (section 8).
   *
   * ADDITIVE and optional, like `totalStock` above: the strip used to be "the
   * newest eight", and a summary from a source that predates the column is
   * still a usable summary. Treat a missing value as "not featured" — a shop
   * with nothing marked featured falls back to newest-first rather than
   * showing an empty section.
   */
  featured?: boolean;
  /** Ascending display order within the featured strip. Ties break on `createdAt`. */
  featuredPosition?: number;
}

/** `products/{productId}` — the DETAIL view. Only ever fetched one at a time. */
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  categorySlug: string;
  images: ProductImage[];
  /**
   * Which scale this product is sized on — see `shared/sizes.ts`.
   *
   * Decides the ORDER and the WORDING of the codes in `sizes` below, and
   * nothing else. Optional so that a read which predates size scales is still a
   * valid product; treat a missing value as `alpha`, which is what
   * `sizeScale()` does and what the database column defaults to.
   */
  sizeScale?: SizeScaleId;
  /**
   * Per-size stock, keyed by size code — **only the sizes this product is
   * actually sold in**.
   *
   * THIS CHANGED WITH SIZE SCALES. It used to be a complete S/M/L record where
   * a missing key was impossible and a zero meant sold out. Now a key that is
   * ABSENT means "this piece does not come in that size" and a key present with
   * `stock: 0` means "it does, and it is sold out" — two different sentences
   * that the product page says differently: an absent size is not rendered at
   * all, a sold-out one is rendered struck through and disabled.
   *
   * Collapsing them back into one would mean a shirt stocked in S, M and L
   * showing seven buttons with four permanently struck out, which is how the
   * scale's full range would read if presence stopped carrying meaning.
   */
  sizes: Record<Size, SizeStock>;
  active: boolean;
  /** See `ProductSummary.featured`. Additive and optional for the same reason. */
  featured?: boolean;
  featuredPosition?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Where a landing page image is shown (requirements section 8).
 *
 * `hero` — the large image at the top of the landing page. More than one may
 * be active: the storefront shows the first and offers the rest as a thumbnail
 * strip beside it, so a brand can put up a small seasonal set without needing
 * a carousel nobody asked for.
 *
 * `promo` — the editorial banner panels further down the page.
 */
export type SiteImageSlot = "hero" | "promo";

/**
 * `site_images/{id}` — an admin-managed landing page image (section 8).
 *
 * Every text field is OPTIONAL, and that is the important part of this shape:
 * the storefront component that renders one keeps its own default copy and
 * only overrides what the record actually carries. Uploading a photograph and
 * nothing else is a complete, valid record — the shop window changes and the
 * words stay as they were written.
 */
export interface SiteImage {
  id: string;
  slot: SiteImageSlot;
  /** Card-sized variant, for admin grids. Never rendered on the landing page. */
  thumb: string;
  /** What the landing page actually displays. */
  full: string;
  alt?: string;
  width?: number;
  height?: number;
  eyebrow?: string;
  title?: string;
  body?: string;
  /** Text of the call-to-action button. Shown only when `ctaHref` is set too. */
  ctaLabel?: string;
  /** Where it links. An in-app path (`/products?category=shirts`) or a full URL. */
  ctaHref?: string;
  /** Text of the SECOND button. Shown only when `cta2Href` is set too. */
  cta2Label?: string;
  /** Where the second button links. Same two forms as `ctaHref`. */
  cta2Href?: string;
  position: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** `categories/{categorySlug}` */
export interface Category {
  slug: string;
  name: string;
  sortOrder: number;
  /**
   * The category this one sits UNDER, or absent for a top-level category
   * (requirements section 5 — subcategories).
   *
   * ADDITIVE and optional, like `active` and `description` above: every row
   * that existed before subcategories has none, which is what "top level"
   * means. A source that predates the column returns categories that are by
   * definition top-level, so read a missing value as "no parent", never as an
   * unknown one.
   *
   * EXACTLY ONE LEVEL. A category with a parent can never itself be a parent —
   * the database enforces it (`categories_enforce_one_level()`), so no reader
   * has to walk a tree of unknown depth. Use the helpers in
   * `shared/categories.ts` rather than reading this field directly; they are
   * what both applications group, count and filter with.
   *
   * A product belongs to ONE category, parent or child alike —
   * `products.category_slug` is unchanged. Browsing a parent shows everything
   * in its children too; that roll-up is `categoryBranchSlugs()`.
   */
  parentSlug?: string;
  /**
   * Which size scale NEW products in this category should start on — so nobody
   * has to remember that shoes are EU-sized and trousers go by the waist.
   *
   * A SUGGESTION and nothing else. A product's own `sizeScale` is the
   * authority, and changing this never rewrites products already in the
   * category; the product editor reads it once, when creating.
   */
  defaultSizeScale?: SizeScaleId;
  thumb?: string;
  /**
   * One line of copy introducing the category, shown on the category tiles and
   * at the top of a category listing (requirements section 5).
   *
   * ADDITIVE and optional — every read path renders correctly without it, so
   * nothing breaks for either developer while it is absent. The admin dashboard
   * should offer it as an optional field when section 8 gets to categories.
   */
  description?: string;
  /**
   * Whether the category is shown on the storefront at all (section 8 — the
   * admin can retire a category without deleting it, which the `on delete
   * restrict` on `products.category_slug` would block anyway while it still
   * has products in it).
   *
   * ADDITIVE and optional: every row defaults to `true`, and a source that
   * predates the column returns categories that are by definition live. Read a
   * missing value as `true`, never as hidden.
   *
   * Deactivating a category does NOT deactivate its products — they keep their
   * own `active` flag and their own detail pages.
   */
  active?: boolean;
  /**
   * How many products are in this category. Computed LIVE by a related-row
   * count in the same query that reads `categories` (`lib/sources/
   * supabaseSource.ts`) — there is no stored column, so the admin dashboard
   * does not need to update anything here when a product is created, retired
   * or recategorised. (Earlier, on the Firebase design, this genuinely was a
   * denormalised value the admin had to keep in sync — that obligation no
   * longer exists.)
   */
  productCount: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  slug: string;
  thumb: string;
  size: Size;
  /**
   * How that size was WORDED when the order was placed — "Extra large",
   * "EU 42", "32 inch waist".
   *
   * Snapshotted for exactly the reason `name`, `slug`, `thumb` and `unitPrice`
   * above are: an order is a record of what someone bought, and it must keep
   * reading correctly after the product has been edited. The code alone is not
   * enough to recover the wording, because the wording lives on the product's
   * SCALE — move a sneaker from EU to UK sizing and a stored "42" would start
   * rendering as "UK 42", which is a shoe that does not exist.
   *
   * Optional: rows written before this column carry none. Fall back to the raw
   * `size` code, never to a guess from the current scale.
   */
  sizeLabel?: string;
  qty: number;
  /** Price at the time of ordering, written by the server — never sent by the client. */
  unitPrice: number;
}

export interface OrderCustomer {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  /** Optional per requirements section 17. */
  postalCode?: string;
  notes?: string;
}

/** `orders/{orderId}` — written ONLY by trusted server code. */
export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customer: OrderCustomer;
  items: OrderItem[];
  /** All money fields are computed server-side. Never trust client values. */
  subtotal: number;
  deliveryCharge: number;
  total: number;
  /**
   * HOW the order is paid (requirements section 9). Written by the server, not
   * sent by the browser — see `shared/payment.ts`. Optional on this type only
   * because orders written before the column existed do not carry it; read it
   * through `paymentMethodOf()`, which resolves that to cash on delivery.
   */
  paymentMethod?: PaymentMethod;
  isGuest: boolean;
  userId?: string;
  /** Grants review access to a guest who has no account. */
  reviewToken: string;
  createdAt: number;
  updatedAt: number;
}

/** `reviews/{productId}/{reviewId}` */
export interface Review {
  id: string;
  productId: string;
  orderId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  /** Display name only. The customer's email must never be exposed publicly. */
  displayName: string;
  verifiedPurchase: boolean;
  hidden: boolean;
  userId?: string;
  createdAt: number;
}

/**
 * `profiles/{userId}` — a CUSTOMER ACCOUNT, created automatically at sign-up.
 *
 * One row per Supabase Auth user, written by a database trigger rather than by
 * either application, so it cannot be skipped, forged, or forgotten. See
 * `supabase/migrations/20260830000002_customer_profiles.sql`.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT WHERE AN ORDER'S DETAILS COME FROM
 * ---------------------------------------------------------------------------
 * An `Order` carries its own copy of the name, phone and address it was placed
 * with, and that copy is the authority for that order forever. A customer
 * correcting their phone number here must never rewrite the number on a
 * delivery already out with a courier. This is who someone IS; an order records
 * what they told us THEN.
 *
 * Guest checkout (requirements section 7) creates none of this. A guest has no
 * account and no profile, and orders exactly as they always have.
 */
/**
 * What an account may do.
 *
 * Every sign-up is a `user`. `admin` is granted by an existing administrator,
 * from the dashboard's Customers screen, through the `set_user_role()` database
 * function — never by writing the column, which no client may do. That function
 * refuses a caller acting on their own row in either direction, and refuses to
 * demote the last administrator.
 *
 * Mirrors the `public.user_role` enum. Add to both together.
 */
export type UserRole = "user" | "admin";

export interface Profile {
  /** The Supabase Auth user id. There is one profile per account, keyed on it. */
  id: string;
  /**
   * `user` unless somebody has been made an administrator.
   *
   * This is what the whole dashboard is gated on — but reading it here is only
   * ever for DISPLAY. The authority is `is_admin()` inside row level security,
   * which Postgres evaluates per statement against this same column; a browser
   * that lied about it would reach screens where every read returns nothing.
   *
   * Optional so that a profile read which did not select the column is still a
   * valid `Profile`. Treat a missing value as `user`, never as `admin`.
   */
  role?: UserRole;
  /**
   * Mirrored from `auth.users` and kept in step by a trigger. Read-only to the
   * customer: changing an email address is an auth operation, not a form field.
   */
  email?: string;
  fullName?: string;
  phone?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A `Profile` with what they have bought — the admin's customer list
 * (`customer_summaries`, a view). Computed by Postgres in the same query that
 * reads the profile, so a list of customers costs one request rather than one
 * per row.
 */
export interface CustomerSummary extends Profile {
  orderCount: number;
  /** Total spent, excluding cancelled orders. */
  totalSpent: number;
  /** Undefined for someone who has an account but has never ordered. */
  lastOrderAt?: number;
}

/** `settings/` — admin-configurable, read by checkout. */
export interface Settings {
  deliveryCharge: number;
  freeDeliveryThreshold?: number;
  lowStockThreshold: number;
  storeAnnouncement?: string;
}

/** Payload accepted by the placeOrder Cloud Function. */
export interface PlaceOrderInput {
  items: Array<{ productId: string; size: Size; qty: number }>;
  customer: OrderCustomer;
}

export interface PlaceOrderResult {
  orderId: string;
  orderNumber: string;
  reviewToken: string;
  total: number;
  /** What the store recorded the order as being paid by (section 9). */
  paymentMethod: PaymentMethod;
}
