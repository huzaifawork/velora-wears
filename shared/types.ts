/**
 * Velora Wears — shared data contract.
 *
 * SOURCE OF TRUTH for the shape of everything in the Realtime Database.
 * Both the storefront and the admin dashboard must conform to this file.
 * Changing a type here is a breaking change for the other developer — agree
 * it between both sides before editing.
 */

import type { PaymentMethod } from "./payment";

export type { PaymentMethod };

export type Size = "S" | "M" | "L";

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
export interface Profile {
  /** The Supabase Auth user id. There is one profile per account, keyed on it. */
  id: string;
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
