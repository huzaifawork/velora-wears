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
  ratingAvg: number;
  ratingCount: number;
  active: boolean;
  createdAt: number;
  /** Lowercased name + category, for prefix search without downloading the catalog. */
  searchText: string;
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
   * Precomputed at write time so a tile can show "6 pieces" without the
   * storefront counting products (requirements section 19). The admin dashboard
   * must keep it in sync when a product is created, retired or recategorised.
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
