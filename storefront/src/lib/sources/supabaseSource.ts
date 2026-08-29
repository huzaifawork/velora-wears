import type {
  Category,
  Product,
  ProductImage,
  ProductSummary,
  Review,
  Settings,
  Size,
  SizeStock,
} from "@shared/types";
import { getSupabase } from "@/lib/supabase";
import {
  normaliseSearch,
  sortSummaries,
  type CatalogSource,
  type ResolvedListOptions,
} from "@/lib/sources/CatalogSource";
import { SIZES } from "@/lib/sizes";

/**
 * The REAL read layer — Supabase (Postgres) via the JS client.
 *
 * This replaces `firebaseSource`. Most of what that file had to work around is
 * simply gone, and the differences are worth knowing:
 *
 *  1. **Filters compose on the server.** The Realtime Database could order by
 *     only ONE field per query, so "search + category + sort by price" had to
 *     be split between the server and the browser, with an over-fetch window to
 *     survive the leftovers. Postgres takes all of it in one statement, so the
 *     database returns exactly the page that is wanted.
 *  2. **Search is substring, not prefix.** `startAt`/`endAt` could only match
 *     the beginning of a name, so "shirt" never found "Oxford Shirt". `ilike`
 *     over a trigram index does, which is what a customer expects.
 *  3. **`product_summaries` is a VIEW**, computed from the products, their
 *     stock and their reviews. Nothing keeps it in sync because nothing has to
 *     — the whole class of stale-summary bug is gone.
 *
 * What has NOT changed: list views read summaries, never full products; every
 * read is bounded; and the response cache still lives one level up in
 * `queries.ts`, shared with the demo source.
 *
 * Postgres columns are snake_case and the app contract in `shared/types.ts` is
 * camelCase. The mapping happens HERE, at the boundary, so nothing above this
 * file knows or cares.
 */

/* ---------------------------------------------------------------------------
 * Row shapes as Postgres returns them.
 * ------------------------------------------------------------------------ */

interface SummaryRow {
  id: string;
  slug: string;
  name: string;
  price: number;
  category_slug: string;
  thumb: string;
  in_stock: boolean;
  low_stock: boolean;
  rating_avg: number | string;
  rating_count: number;
  active: boolean;
  created_at: string;
  search_text: string;
}

interface ImageRow {
  thumb_url: string;
  full_url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  position: number;
}

interface SizeRow {
  size: Size;
  stock: number;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  category_slug: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  product_images: ImageRow[] | null;
  product_sizes: SizeRow[] | null;
}

interface CategoryRow {
  slug: string;
  name: string;
  sort_order: number;
  thumb: string | null;
  description: string | null;
}

interface ReviewRow {
  id: string;
  product_id: string;
  order_id: string | null;
  rating: number;
  comment: string;
  display_name: string;
  verified_purchase: boolean;
  hidden: boolean;
  user_id: string | null;
  created_at: string;
}

interface SettingsRow {
  delivery_charge: number;
  free_delivery_threshold: number | null;
  low_stock_threshold: number;
  store_announcement: string | null;
}

/* ---------------------------------------------------------------------------
 * Mapping. The app contract stores timestamps as epoch milliseconds; Postgres
 * returns ISO strings, so the conversion happens once, here.
 * ------------------------------------------------------------------------ */

const epoch = (iso: string): number => new Date(iso).getTime();

function toSummary(row: SummaryRow): ProductSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    price: row.price,
    categorySlug: row.category_slug,
    thumb: row.thumb,
    inStock: row.in_stock,
    lowStock: row.low_stock,
    // Postgres returns numeric as a string to avoid precision loss in JSON.
    ratingAvg: Number(row.rating_avg),
    ratingCount: Number(row.rating_count),
    active: row.active,
    createdAt: epoch(row.created_at),
    searchText: row.search_text,
  };
}

function toProduct(row: ProductRow): Product {
  const images: ProductImage[] = [...(row.product_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((image) => ({
      thumb: image.thumb_url,
      full: image.full_url,
      alt: image.alt ?? undefined,
      width: image.width ?? undefined,
      height: image.height ?? undefined,
    }));

  // The contract is a full S/M/L record. A size with no row is genuinely zero
  // stock, not a missing key — the size selector must be able to strike it out.
  const sizes = Object.fromEntries(
    SIZES.map((size) => [
      size,
      { stock: row.product_sizes?.find((s) => s.size === size)?.stock ?? 0 },
    ]),
  ) as Record<Size, SizeStock>;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: row.price,
    categorySlug: row.category_slug,
    images,
    sizes,
    active: row.active,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}

function toCategory(row: CategoryRow, productCount: number): Category {
  return {
    slug: row.slug,
    name: row.name,
    sortOrder: row.sort_order,
    thumb: row.thumb ?? undefined,
    description: row.description ?? undefined,
    productCount,
  };
}

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    productId: row.product_id,
    orderId: row.order_id ?? "",
    rating: row.rating as Review["rating"],
    comment: row.comment,
    displayName: row.display_name,
    verifiedPurchase: row.verified_purchase,
    hidden: row.hidden,
    userId: row.user_id ?? undefined,
    createdAt: epoch(row.created_at),
  };
}

const SUMMARY_COLUMNS =
  "id, slug, name, price, category_slug, thumb, in_stock, low_stock, rating_avg, rating_count, active, created_at, search_text";

/** Postgres treats `%` and `_` as wildcards inside `like`; a search term must not. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/* ---------------------------------------------------------------------------
 * Reads
 * ------------------------------------------------------------------------ */

/**
 * The one list read — browsing, category filtering, search, the in-stock
 * filter and sorting (requirements sections 3, 5, 11, 13 and 14).
 *
 * Every filter is applied by the database, so what comes back IS the page.
 */
async function listProducts({
  categorySlug,
  search,
  inStockOnly,
  sort,
  limit,
}: ResolvedListOptions): Promise<ProductSummary[]> {
  let q = getSupabase()
    .from("product_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("active", true);

  if (categorySlug) q = q.eq("category_slug", categorySlug);
  if (inStockOnly) q = q.eq("in_stock", true);

  const term = normaliseSearch(search);
  if (term) q = q.ilike("search_text", `%${escapeLike(term)}%`);

  switch (sort) {
    case "price-asc":
      q = q.order("price", { ascending: true });
      break;
    case "price-desc":
      q = q.order("price", { ascending: false });
      break;
    case "rating":
      q = q
        .order("rating_avg", { ascending: false })
        .order("rating_count", { ascending: false });
      break;
    default:
      q = q.order("created_at", { ascending: false });
  }

  // Ties break on newest, matching `sortSummaries`, so a page is stable
  // between reads instead of shuffling.
  q = q.order("created_at", { ascending: false }).limit(limit);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // The database has already ordered this. Running the shared comparator over
  // the (small, bounded) page as well is what guarantees the two sources cannot
  // disagree about what a sort means.
  return sortSummaries((data ?? []).map(toSummary), sort);
}

/** Detail view — one full product with its images and per-size stock. */
async function getProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await getSupabase()
    .from("products")
    .select(
      "id, slug, name, description, price, category_slug, active, created_at, updated_at, " +
        "product_images(thumb_url, full_url, alt, width, height, position), " +
        "product_sizes(size, stock)",
    )
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toProduct(data as unknown as ProductRow) : null;
}

/**
 * The summary for one product, read alongside the full record on the detail
 * page. It carries the computed rating and stock flags the `products` row does
 * not (requirements sections 16 and 19).
 */
async function getProductSummaryBySlug(slug: string): Promise<ProductSummary | null> {
  const { data, error } = await getSupabase()
    .from("product_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toSummary(data as SummaryRow) : null;
}

/**
 * Categories, with a live product count.
 *
 * Firebase needed `productCount` denormalised onto the record and rewritten by
 * the admin on every product change. Postgres counts the related rows in the
 * same query, so the number cannot be wrong.
 */
async function getCategories(): Promise<Category[]> {
  const { data, error } = await getSupabase()
    .from("categories")
    .select("slug, name, sort_order, thumb, description, products(count)")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const counted = row as unknown as CategoryRow & { products: { count: number }[] };
    return toCategory(counted, counted.products?.[0]?.count ?? 0);
  });
}

async function getSettings(): Promise<Settings | null> {
  const { data, error } = await getSupabase()
    .from("settings")
    .select("delivery_charge, free_delivery_threshold, low_stock_threshold, store_announcement")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as SettingsRow;
  return {
    deliveryCharge: row.delivery_charge,
    freeDeliveryThreshold: row.free_delivery_threshold ?? undefined,
    lowStockThreshold: row.low_stock_threshold,
    storeAnnouncement: row.store_announcement ?? undefined,
  };
}

/**
 * Visible reviews for one product, newest first.
 *
 * Hidden reviews are excluded by row level security, not by a client filter —
 * an admin hiding spam removes it from the API entirely rather than trusting
 * the browser to skip it (requirements section 16).
 */
async function listReviews(productId: string, limit: number): Promise<Review[]> {
  const { data, error } = await getSupabase()
    .from("reviews")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toReview(row as ReviewRow));
}

/**
 * Landing-page testimonials (requirements sections 2 and 16).
 *
 * Under Firebase this was impossible without a denormalised featured-reviews
 * node, because reviews were stored per product and there was no flat node to
 * read the newest few from. Here it is one indexed query across the table.
 */
async function listTestimonials(limit: number): Promise<Review[]> {
  const { data, error } = await getSupabase()
    .from("reviews")
    .select("*")
    .eq("verified_purchase", true)
    .gte("rating", 4)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toReview(row as ReviewRow));
}

export const supabaseSource: CatalogSource = {
  listProducts,
  getProductBySlug,
  getProductSummaryBySlug,
  getCategories,
  getSettings,
  listReviews,
  listTestimonials,
};
