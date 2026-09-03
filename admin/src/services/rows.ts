import type {
  Category,
  Order,
  OrderItem,
  Product,
  ProductImage,
  ProductSummary,
  Review,
  Settings,
  SiteImage,
  SiteImageSlot,
  Size,
  SizeStock,
} from "@shared/types";
import { isSizeScaleId } from "@shared/sizes";

/**
 * The BOUNDARY between Postgres and the application contract.
 *
 * Postgres speaks snake_case and ISO timestamps; `shared/types.ts` speaks
 * camelCase and epoch milliseconds. That conversion happens here and nowhere
 * else, so no component ever sees a `category_slug` and no service ever has to
 * remember `new Date(iso).getTime()`.
 *
 * This mirrors `storefront/src/lib/sources/supabaseSource.ts`, which does the
 * identical job for the shop. The two files are deliberately parallel: the same
 * column produces the same field on both sides of the project, so a `Product`
 * read by the dashboard and one read by the storefront are the same object.
 *
 * The row interfaces below are what the SELECT lists in `services/` actually
 * ask for. They are not the full tables — every query in this dashboard names
 * its columns (§19: never `select *` on a list read), and these types are how
 * that stays honest.
 */

export const epoch = (iso: string): number => new Date(iso).getTime();

/** Postgres `null` and TypeScript `undefined` mean the same thing to the UI. */
const opt = <T>(value: T | null): T | undefined => value ?? undefined;

/* ---------------------------------------------------------------------------
 * Products
 * ------------------------------------------------------------------------ */

export interface SummaryRow {
  id: string;
  slug: string;
  name: string;
  price: number;
  category_slug: string;
  thumb: string;
  in_stock: boolean;
  low_stock: boolean;
  total_stock: number;
  rating_avg: number | string;
  rating_count: number;
  active: boolean;
  created_at: string;
  search_text: string;
  featured: boolean;
  featured_position: number;
  size_scale: string | null;
}

/**
 * Every column of the summary VIEW the dashboard reads, and no more.
 *
 * The view computes `in_stock`, `low_stock`, `total_stock`, `rating_avg` and
 * `thumb` in Postgres from `product_sizes`, `reviews` and `product_images` —
 * which is why the product LIST here costs one query rather than one query plus
 * a stock read plus an image read per row (the N+1 the brief names explicitly).
 */
export const SUMMARY_COLUMNS =
  "id, slug, name, price, category_slug, thumb, in_stock, low_stock, total_stock, " +
  "rating_avg, rating_count, active, created_at, search_text, featured, featured_position, " +
  "size_scale";

export function toSummary(row: SummaryRow): ProductSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    price: row.price,
    categorySlug: row.category_slug,
    thumb: row.thumb,
    inStock: row.in_stock,
    lowStock: row.low_stock,
    totalStock: Number(row.total_stock),
    // Postgres returns `numeric` as a string, to avoid precision loss in JSON.
    ratingAvg: Number(row.rating_avg),
    ratingCount: Number(row.rating_count),
    active: row.active,
    createdAt: epoch(row.created_at),
    searchText: row.search_text,
    featured: row.featured,
    featuredPosition: row.featured_position,
    // The inventory screen labels its stock columns from this without having to
    // read the full product for every row on the page.
    sizeScale: isSizeScaleId(row.size_scale) ? row.size_scale : undefined,
  };
}

export interface ImageRow {
  id: string;
  position: number;
  thumb_url: string;
  full_url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface SizeRow {
  size: Size;
  stock: number;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  category_slug: string;
  active: boolean;
  featured: boolean;
  featured_position: number;
  created_at: string;
  updated_at: string;
  size_scale: string | null;
  product_images: ImageRow[] | null;
  product_sizes: SizeRow[] | null;
}

export const PRODUCT_COLUMNS =
  "id, slug, name, description, price, category_slug, active, featured, featured_position, " +
  "created_at, updated_at, size_scale, " +
  "product_images(id, position, thumb_url, full_url, alt, width, height), " +
  "product_sizes(size, stock)";

/**
 * The editor's view of a product: the record itself, its images IN ORDER, and
 * a full S/M/L stock map.
 *
 * `AdminProduct` extends the shared `Product` with the image ids, because the
 * dashboard has to be able to delete or reorder ONE image and the customer-
 * facing `ProductImage` has no identity — the shop only ever renders them.
 */
export interface AdminProductImage extends ProductImage {
  id: string;
  position: number;
}

export interface AdminProduct extends Omit<Product, "images"> {
  images: AdminProductImage[];
}

export function toProduct(row: ProductRow): AdminProduct {
  const images: AdminProductImage[] = [...(row.product_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((image) => ({
      id: image.id,
      position: image.position,
      thumb: image.thumb_url,
      full: image.full_url,
      alt: opt(image.alt),
      width: opt(image.width),
      height: opt(image.height),
    }));

  // THE ROWS ARE THE CONTRACT — the same rule the storefront's source follows.
  // This used to materialise a fixed S/M/L record and zero-fill the gaps, which
  // is all it could do while sizes were a global enum. Now a stock row existing
  // is the statement that this piece is SOLD in that size, so the editor shows
  // a field per row and an "add a size" control, rather than three fields that
  // were the same three for a sneaker and a shirt.
  const sizes = Object.fromEntries(
    (row.product_sizes ?? []).map((s) => [s.size, { stock: Math.max(0, s.stock) } as SizeStock]),
  ) as Record<Size, SizeStock>;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: row.price,
    categorySlug: row.category_slug,
    images,
    sizeScale: isSizeScaleId(row.size_scale) ? row.size_scale : undefined,
    sizes,
    active: row.active,
    featured: row.featured,
    featuredPosition: row.featured_position,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}

/* ---------------------------------------------------------------------------
 * Categories
 * ------------------------------------------------------------------------ */

export interface CategoryRow {
  slug: string;
  name: string;
  sort_order: number;
  thumb: string | null;
  description: string | null;
  active: boolean;
  parent_slug: string | null;
  default_size_scale: string | null;
  products?: { count: number }[];
}

export const CATEGORY_COLUMNS =
  "slug, name, sort_order, thumb, description, active, parent_slug, default_size_scale";

export function toCategory(row: CategoryRow): Category {
  return {
    slug: row.slug,
    name: row.name,
    sortOrder: row.sort_order,
    thumb: opt(row.thumb),
    description: opt(row.description),
    active: row.active,
    // Null is "top level" — the state of every category before
    // `20260902000001_subcategories.sql`. See shared/types.ts.
    parentSlug: opt(row.parent_slug),
    defaultSizeScale: isSizeScaleId(row.default_size_scale) ? row.default_size_scale : undefined,
    // Counted live by the same query (`products(count)`), never stored — see
    // the note on `Category.productCount` in shared/types.ts.
    productCount: row.products?.[0]?.count ?? 0,
  };
}

/* ---------------------------------------------------------------------------
 * Orders
 * ------------------------------------------------------------------------ */

export interface OrderItemRow {
  id: string;
  product_id: string;
  name: string;
  slug: string;
  thumb: string;
  size: Size;
  size_label: string | null;
  qty: number;
  unit_price: number;
}

export interface OrderRow {
  id: string;
  order_number: string;
  status: Order["status"];
  full_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string | null;
  notes: string | null;
  subtotal: number;
  delivery_charge: number;
  total: number;
  payment_method: string | null;
  is_guest: boolean;
  user_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItemRow[] | null;
}

/**
 * The order LIST's columns.
 *
 * `review_token` is deliberately absent: it is a capability — anyone holding it
 * can write a review against that order — and the dashboard has no screen that
 * uses one. `notes` and `address` are absent too, because a list shows a row
 * per order and neither fits in one; the detail read below asks for them.
 */
export const ORDER_LIST_COLUMNS =
  "id, order_number, status, full_name, email, phone, city, subtotal, delivery_charge, " +
  "total, payment_method, is_guest, user_id, archived_at, created_at, updated_at";

/** The detail read: everything the list has, plus the address and the lines. */
export const ORDER_DETAIL_COLUMNS =
  "id, order_number, status, full_name, email, phone, address, city, postal_code, notes, " +
  "subtotal, delivery_charge, total, payment_method, is_guest, user_id, archived_at, " +
  "created_at, updated_at, " +
  "order_items(id, product_id, name, slug, thumb, size, size_label, qty, unit_price)";

/**
 * An order as the dashboard holds it.
 *
 * `items` is optional rather than always present, because the LIST does not
 * read them — an admin scanning forty orders does not need four hundred line
 * items, and fetching them would be exactly the N+1-shaped over-read the brief
 * warns against. `undefined` means "not loaded", which is different from an
 * order with no lines (impossible: `place_order` refuses an empty cart).
 */
export interface AdminOrder extends Omit<Order, "items" | "reviewToken"> {
  items?: OrderItem[];
  /**
   * When an administrator filed this order away, or `undefined` while it is
   * still on the working list. It is a dashboard-side fact and not part of
   * `shared/types.ts` on purpose: the storefront reads the same row and must
   * never behave differently because the shop has tidied its own list.
   */
  archivedAt?: number;
}

export function toOrderItem(row: OrderItemRow): OrderItem {
  return {
    productId: row.product_id,
    name: row.name,
    slug: row.slug,
    thumb: row.thumb,
    size: row.size,
    // The wording frozen onto the line when the order was placed. Never
    // re-derived from the product's current scale — see `OrderItem.sizeLabel`.
    sizeLabel: row.size_label ?? undefined,
    qty: row.qty,
    unitPrice: row.unit_price,
  };
}

export function toOrder(row: OrderRow): AdminOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    customer: {
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      // The list read does not select these; an empty string is what a cell
      // renders as nothing, and the detail view is what fills them in.
      address: (row as { address?: string }).address ?? "",
      city: row.city,
      postalCode: opt(row.postal_code ?? null),
      notes: opt(row.notes ?? null),
    },
    items: row.order_items ? row.order_items.map(toOrderItem) : undefined,
    subtotal: row.subtotal,
    deliveryCharge: row.delivery_charge,
    total: row.total,
    // Resolved through `paymentMethodOf()` at the point of display, so an order
    // written before the column existed reads as cash on delivery rather than
    // blank — see shared/payment.ts.
    paymentMethod: (row.payment_method ?? undefined) as Order["paymentMethod"],
    isGuest: row.is_guest,
    userId: opt(row.user_id),
    archivedAt: row.archived_at ? epoch(row.archived_at) : undefined,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}

/* ---------------------------------------------------------------------------
 * Reviews
 * ------------------------------------------------------------------------ */

export interface ReviewRow {
  id: string;
  product_id: string;
  order_id: string | null;
  rating: number;
  comment: string;
  display_name: string;
  verified_purchase: boolean;
  hidden: boolean;
  created_at: string;
  products?: { name: string; slug: string } | null;
}

/**
 * `user_id` is not read. The moderation screen decides whether a comment is
 * abusive, and the customer's account id has no part in that judgement — the
 * storefront's own public review read leaves it out for the same reason
 * (see PUBLIC_REVIEW_COLUMNS in `supabaseSource.ts`).
 */
export const REVIEW_COLUMNS =
  "id, product_id, order_id, rating, comment, display_name, verified_purchase, hidden, " +
  "created_at, products(name, slug)";

/** A review plus the name of the product it is about, for the moderation list. */
export interface AdminReview extends Review {
  productName: string;
  productSlug: string;
}

export function toReview(row: ReviewRow): AdminReview {
  return {
    id: row.id,
    productId: row.product_id,
    orderId: row.order_id ?? "",
    rating: row.rating as Review["rating"],
    comment: row.comment,
    displayName: row.display_name,
    verifiedPurchase: row.verified_purchase,
    hidden: row.hidden,
    createdAt: epoch(row.created_at),
    productName: row.products?.name ?? "Unknown product",
    productSlug: row.products?.slug ?? "",
  };
}

/* ---------------------------------------------------------------------------
 * Settings
 * ------------------------------------------------------------------------ */

export interface SettingsRow {
  delivery_charge: number;
  free_delivery_threshold: number | null;
  low_stock_threshold: number;
  store_announcement: string | null;
}

export const SETTINGS_COLUMNS =
  "delivery_charge, free_delivery_threshold, low_stock_threshold, store_announcement";

export function toSettings(row: SettingsRow): Settings {
  return {
    deliveryCharge: row.delivery_charge,
    freeDeliveryThreshold: opt(row.free_delivery_threshold),
    lowStockThreshold: row.low_stock_threshold,
    storeAnnouncement: opt(row.store_announcement),
  };
}

/* ---------------------------------------------------------------------------
 * Site images
 * ------------------------------------------------------------------------ */

export interface SiteImageRow {
  id: string;
  slot: SiteImageSlot;
  thumb_url: string;
  full_url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  eyebrow: string | null;
  title: string | null;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  cta2_label: string | null;
  cta2_href: string | null;
  position: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const SITE_IMAGE_COLUMNS =
  "id, slot, thumb_url, full_url, alt, width, height, eyebrow, title, body, " +
  "cta_label, cta_href, cta2_label, cta2_href, position, active, created_at, updated_at";

export function toSiteImage(row: SiteImageRow): SiteImage {
  return {
    id: row.id,
    slot: row.slot,
    thumb: row.thumb_url,
    full: row.full_url,
    alt: opt(row.alt),
    width: opt(row.width),
    height: opt(row.height),
    eyebrow: opt(row.eyebrow),
    title: opt(row.title),
    body: opt(row.body),
    ctaLabel: opt(row.cta_label),
    ctaHref: opt(row.cta_href),
    cta2Label: opt(row.cta2_label),
    cta2Href: opt(row.cta2_href),
    position: row.position,
    active: row.active,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}
