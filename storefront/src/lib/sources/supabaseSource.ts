import type {
  Category,
  Product,
  ProductImage,
  ProductSummary,
  Review,
  Settings,
  SiteImage,
  Size,
  SizeScaleId,
  SizeStock,
} from "@shared/types";
import { isSizeScaleId } from "@shared/sizes";
import { getSupabase } from "@/lib/supabase";
import {
  normaliseSearch,
  sortSummaries,
  type CatalogSource,
  type ResolvedListOptions,
} from "@/lib/sources/CatalogSource";

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
  total_stock: number;
  rating_avg: number | string;
  rating_count: number;
  active: boolean;
  created_at: string;
  search_text: string;
  size_scale: string | null;
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
  size_scale: string | null;
  product_images: ImageRow[] | null;
  product_sizes: SizeRow[] | null;
}

interface CategoryRow {
  slug: string;
  name: string;
  sort_order: number;
  thumb: string | null;
  description: string | null;
  parent_slug: string | null;
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

/**
 * A size scale id from the database, or `undefined` for a value this build does
 * not know. Not an error: the column is constrained, so an unknown value means
 * the database is one deploy ahead — and `sizeScale()` resolves `undefined` to
 * the default rather than throwing at render time.
 */
const scaleIdOf = (value: string | null): SizeScaleId | undefined =>
  isSizeScaleId(value) ? value : undefined;

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
    sizeScale: scaleIdOf(row.size_scale),
    // The view has always computed this; it was simply never selected, so no
    // list surface could answer section 11's "available product quantity".
    totalStock: Number(row.total_stock),
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

  // THE ROWS ARE THE CONTRACT. This used to materialise a fixed S/M/L record
  // and fill the gaps with zeroes, which was the only thing it could do while
  // sizes were a global enum. With size scales, a stock row existing IS the
  // statement that this piece comes in that size — so the map carries exactly
  // the sizes it is sold in, and the selector renders those and no others. A
  // row with `stock: 0` is a size that has sold out; no row at all is a size
  // this piece was never made in, and the two must not be confused.
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
    sizeScale: scaleIdOf(row.size_scale),
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
    // Null is "top level", which is what every category was before
    // `20260902000001_subcategories.sql` — see shared/types.ts.
    parentSlug: row.parent_slug ?? undefined,
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
  "id, slug, name, price, category_slug, thumb, in_stock, low_stock, total_stock, rating_avg, rating_count, active, created_at, search_text, size_scale";

/**
 * What a PUBLIC review listing needs, and nothing more (requirements section
 * 17 — customer personal data must never be publicly readable). `user_id` and
 * `order_id` are neither shown anywhere nor used by any public-facing
 * component, but `select("*")` would still hand them to anyone reading the
 * API directly: `order_id` lets a stranger tell that two reviews came from
 * the same order, and `user_id` is a stable identifier a stranger could use
 * to correlate a customer's reviews across products. Neither is "personal
 * data" the way an email or phone number is, but neither has any business
 * being public either. `getExistingReview` in `lib/reviewLookup.ts` is not
 * this — it is the REVIEWER checking their own review for one order they
 * already know, not a public listing, so it keeps `select("*")`.
 */
const PUBLIC_REVIEW_COLUMNS =
  "id, product_id, rating, comment, display_name, verified_purchase, hidden, created_at";

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
  categorySlugs,
  search,
  inStockOnly,
  sort,
  limit,
}: ResolvedListOptions): Promise<ProductSummary[]> {
  let q = getSupabase()
    .from("product_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("active", true);

  // A category filter covers the category AND its subcategories (section 5).
  // `queries.ts` expands it; the singular field is the fallback for a caller
  // that has not, and for the ordinary case of a category with no children.
  const branch = categorySlugs?.length
    ? categorySlugs
    : categorySlug
      ? [categorySlug]
      : undefined;

  if (branch) {
    q = branch.length === 1 ? q.eq("category_slug", branch[0]) : q.in("category_slug", branch);
  }
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
      "id, slug, name, description, price, category_slug, active, created_at, updated_at, size_scale, " +
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
const CATEGORY_COLUMNS = "slug, name, sort_order, thumb, description, parent_slug";

async function getCategories(): Promise<Category[]> {
  const read = (columns: string) =>
    getSupabase()
      .from("categories")
      .select(`${columns}, products(count)`)
      .order("sort_order", { ascending: true });

  let { data, error } = await read(CATEGORY_COLUMNS);

  /*
   * A database that predates `20260902000001_subcategories.sql` has no
   * `parent_slug`, and PostgREST rejects the whole select rather than ignoring
   * the unknown column — so every category would vanish from the shop's
   * navigation until the migration is applied. Reading again without it keeps
   * the navigation the shop has always had, which is the same call
   * `listSiteImages` makes below for the same reason.
   *
   * Narrowed to Postgres's "undefined column" (42703), so a network failure or
   * a permissions problem still surfaces on the first attempt instead of being
   * retried and then reported against the wrong query.
   */
  if (error?.code === "42703") {
    ({ data, error } = await read("slug, name, sort_order, thumb, description"));
  }

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
    .select(PUBLIC_REVIEW_COLUMNS)
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
    .select(PUBLIC_REVIEW_COLUMNS)
    .eq("verified_purchase", true)
    .gte("rating", 4)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toReview(row as ReviewRow));
}

/* ---------------------------------------------------------------------------
 * The landing page's admin-managed content (requirements section 8).
 *
 * Both reads below FALL BACK RATHER THAN THROW, and that is a deliberate
 * decision about what a landing page should do when something is wrong.
 *
 * These two features are newer than the deployed schema — they need
 * `20260830000001_admin_dashboard.sql`, which adds `products.featured` and the
 * `site_images` table. A shop running the storefront against a database where
 * that migration has not been applied yet would, without these fallbacks, show
 * a hard error where its shop window ought to be. With them it shows the
 * landing page it has always shown. The same catch covers the ordinary case of
 * an admin who simply has not used the feature.
 * ------------------------------------------------------------------------ */

interface SiteImageRow {
  id: string;
  slot: SiteImage["slot"];
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

function toSiteImage(row: SiteImageRow): SiteImage {
  return {
    id: row.id,
    slot: row.slot,
    thumb: row.thumb_url,
    full: row.full_url,
    alt: row.alt ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    eyebrow: row.eyebrow ?? undefined,
    title: row.title ?? undefined,
    body: row.body ?? undefined,
    ctaLabel: row.cta_label ?? undefined,
    ctaHref: row.cta_href ?? undefined,
    cta2Label: row.cta2_label ?? undefined,
    cta2Href: row.cta2_href ?? undefined,
    position: row.position,
    active: row.active,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}

/**
 * The featured strip, in the order the admin arranged it.
 *
 * One query over the `products_featured` partial index. When nothing is
 * featured this falls through to the newest N — which is exactly what the strip
 * showed before an admin could choose, so the section is never empty.
 */
async function listFeatured(limit: number): Promise<ProductSummary[]> {
  const newest = () =>
    listProducts({ inStockOnly: false, sort: "newest", limit });

  try {
    const { data, error } = await getSupabase()
      .from("product_summaries")
      .select(SUMMARY_COLUMNS)
      .eq("active", true)
      .eq("featured", true)
      .order("featured_position", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    const rows = (data ?? []).map(toSummary);
    return rows.length > 0 ? rows : await newest();
  } catch {
    // Nothing featured, or a database that predates the column. Either way the
    // landing page gets the strip it has always had.
    return newest();
  }
}

/**
 * The hero images and the promo banners, active only, in display order.
 *
 * One request for both slots: the landing page needs them together and they
 * live in one table, so splitting the read would be two round trips to draw one
 * screen. Row level security already limits this to the active rows.
 */
async function listSiteImages(): Promise<SiteImage[]> {
  try {
    const { data, error } = await getSupabase()
      .from("site_images")
      .select(
        "id, slot, thumb_url, full_url, alt, width, height, eyebrow, title, body, " +
          "cta_label, cta_href, cta2_label, cta2_href, position, active, " +
          "created_at, updated_at",
      )
      .eq("active", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toSiteImage(row as unknown as SiteImageRow));
  } catch {
    // No table yet, or nothing uploaded. The landing page keeps its own art.
    return [];
  }
}

export const supabaseSource: CatalogSource = {
  listProducts,
  getProductBySlug,
  getProductSummaryBySlug,
  getCategories,
  getSettings,
  listReviews,
  listTestimonials,
  listFeatured,
  listSiteImages,
};
