import type { ProductSummary, Size, SizeScaleId } from "@shared/types";
import { PRODUCT_IMAGE } from "@shared/media";
import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { deleteImageFiles, uploadImagePair } from "@admin/lib/storage";
import { invalidate } from "@admin/lib/cache";
import {
  PRODUCT_COLUMNS,
  SUMMARY_COLUMNS,
  toProduct,
  toSummary,
  type AdminProduct,
  type ProductRow,
  type SummaryRow,
} from "@admin/services/rows";

/**
 * Product reads and writes (requirements section 8, §11, §19).
 *
 * ---------------------------------------------------------------------------
 * EVERY LIST READ IS PAGINATED AND FILTERED BY THE DATABASE.
 * ---------------------------------------------------------------------------
 * The brief is explicit: "Do NOT simply fetch entire tables and filter
 * everything on the client." So the list below applies its search, its category
 * filter, its stock filter and its sort inside the query and returns exactly
 * one page, with the total count coming back in the same round trip
 * (`count: "exact"` is a header on the response, not a second request).
 *
 * It reads `product_summaries` — the VIEW — rather than `products`, because the
 * list shows stock and a thumbnail, and the view computes both in Postgres. The
 * alternative is a query per row for stock and another for images, which is the
 * N+1 pattern the brief names. See `developerb.md` §3.
 *
 * ---------------------------------------------------------------------------
 * WRITES ARE NARROW ON PURPOSE.
 * ---------------------------------------------------------------------------
 * `setActive` and `setFeatured` update ONE column. The alternative — reading a
 * product, changing a field, writing the whole row back — is how two admins
 * with the same list open overwrite each other's edits, and how a stale price
 * from a cached read gets written back over a correct one.
 */

/* ---------------------------------------------------------------------------
 * Listing
 * ------------------------------------------------------------------------ */

export type ProductSort = "newest" | "oldest" | "price-asc" | "price-desc" | "name";
export type StockFilter = "all" | "in" | "low" | "out";
export type ActiveFilter = "all" | "active" | "inactive";

export interface ProductListOptions {
  search?: string;
  categorySlug?: string;
  stock?: StockFilter;
  status?: ActiveFilter;
  featuredOnly?: boolean;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  rows: T[];
  /** Total matching rows in the database, not on this page. Drives the pager. */
  total: number;
  page: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 20;

/** Postgres treats `%` and `_` as wildcards inside `like`; a search term must not. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function normaliseSearch(term: string | undefined): string {
  return (term ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** A stable cache key naming every option, so two filters never share an entry. */
export function productListKey(options: ProductListOptions): string {
  const {
    search,
    categorySlug,
    stock = "all",
    status = "all",
    featuredOnly = false,
    sort = "newest",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  return [
    "products",
    normaliseSearch(search) || "-",
    categorySlug ?? "-",
    stock,
    status,
    featuredOnly ? "featured" : "-",
    sort,
    page,
    pageSize,
  ].join(":");
}

export async function listProducts(options: ProductListOptions): Promise<Page<ProductSummary>> {
  const {
    search,
    categorySlug,
    stock = "all",
    status = "all",
    featuredOnly = false,
    sort = "newest",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  let q = getSupabase()
    .from("product_summaries")
    .select(SUMMARY_COLUMNS, { count: "exact" });

  if (categorySlug) q = q.eq("category_slug", categorySlug);
  if (status !== "all") q = q.eq("active", status === "active");
  if (featuredOnly) q = q.eq("featured", true);

  // The three stock states are the view's own precomputed booleans, so this
  // filters on indexed, already-aggregated values rather than summing
  // `product_sizes` per row.
  if (stock === "out") q = q.eq("in_stock", false);
  if (stock === "low") q = q.eq("low_stock", true);
  if (stock === "in") q = q.eq("in_stock", true);

  const term = normaliseSearch(search);
  if (term) q = q.ilike("search_text", `%${escapeLike(term)}%`);

  switch (sort) {
    case "oldest":
      q = q.order("created_at", { ascending: true });
      break;
    case "price-asc":
      q = q.order("price", { ascending: true });
      break;
    case "price-desc":
      q = q.order("price", { ascending: false });
      break;
    case "name":
      q = q.order("name", { ascending: true });
      break;
    default:
      q = q.order("created_at", { ascending: false });
  }

  // Ties break on a unique-ish column, or two reads of the same page can come
  // back in different orders and a row appears twice while another is skipped.
  q = q.order("id", { ascending: true });

  const from = (page - 1) * pageSize;
  const { data, error, count } = await q.range(from, from + pageSize - 1);
  if (error) throw new Error(describeError(error));

  return {
    rows: (data ?? []).map((row) => toSummary(row as unknown as SummaryRow)),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** The featured strip, in its display order — what the landing page renders. */
export async function listFeatured(): Promise<ProductSummary[]> {
  const { data, error } = await getSupabase()
    .from("product_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("featured", true)
    .order("featured_position", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(describeError(error));
  return (data ?? []).map((row) => toSummary(row as unknown as SummaryRow));
}

/** One product with its images and per-size stock — the editor's read. */
export async function getProduct(id: string): Promise<AdminProduct | null> {
  const { data, error } = await getSupabase()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(describeError(error));
  return data ? toProduct(data as unknown as ProductRow) : null;
}

/* ---------------------------------------------------------------------------
 * Writing
 * ------------------------------------------------------------------------ */

export interface ProductInput {
  name: string;
  slug: string;
  description: string;
  price: number;
  categorySlug: string;
  active: boolean;
  featured: boolean;
  /** Which set of sizes this piece is sold in — see `shared/sizes.ts`. */
  sizeScale: SizeScaleId;
  /**
   * The sizes this piece is SOLD IN, and how many of each (§11).
   *
   * The KEYS are the meaningful part and they are chosen by the admin: a shirt
   * that only comes in S, M and L has three, a sneaker has however many of EU
   * 38–46 the shop actually stocks. A zero is a size that is sold out and still
   * offered; a size that is simply absent is one the piece was never made in.
   * `writeSizes` below deletes rows for keys that are gone, which is how a size
   * stops being offered at all.
   */
  stock: Record<Size, number>;
}

function toRow(input: ProductInput) {
  return {
    name: input.name.trim(),
    slug: input.slug.trim(),
    description: input.description.trim(),
    price: Math.max(0, Math.round(input.price)),
    category_slug: input.categorySlug,
    active: input.active,
    featured: input.featured,
    size_scale: input.sizeScale,
  };
}

/**
 * Make the product's stock rows match the sizes it is sold in.
 *
 * ---------------------------------------------------------------------------
 * UPSERT THE ONES THAT STAY, DELETE ONLY THE ONES THAT LEAVE
 * ---------------------------------------------------------------------------
 * The upsert is on the composite primary key rather than delete-then-insert,
 * and that has always been deliberate: a product's stock is live data that
 * `place_order()` decrements under a row lock, and deleting a row — even for a
 * millisecond — is a window in which a customer's order finds no stock row and
 * fails with "out of stock" for a size that is fully stocked.
 *
 * What is new is the DELETE, which size scales made necessary: the set of sizes
 * is now editable, so a size the admin has removed has to actually go. It is
 * scoped to exactly the codes that are no longer offered (`not.in`), never a
 * blanket clear — so the rows that survive the edit are never absent for even
 * an instant, and the race above stays closed for them.
 *
 * The delete runs AFTER the upsert for the same reason: at no point between the
 * two statements is a size that should exist missing.
 */
async function writeSizes(
  productId: string,
  stock: Record<Size, number>,
): Promise<void> {
  const codes = Object.keys(stock);

  const rows = codes.map((size) => ({
    product_id: productId,
    size,
    stock: Math.max(0, Math.round(stock[size] ?? 0)),
  }));

  if (rows.length > 0) {
    const { error } = await getSupabase()
      .from("product_sizes")
      .upsert(rows, { onConflict: "product_id,size" });

    if (error) throw new Error(describeError(error));
  }

  // Retire the sizes this product is no longer sold in. PostgREST needs the
  // list as a parenthesised set; the codes are constrained to
  // `[A-Za-z0-9. /-]` by the database, so none of them can contain the comma
  // that would break out of it.
  const remove = getSupabase().from("product_sizes").delete().eq("product_id", productId);

  const { error } = codes.length > 0
    ? await remove.not("size", "in", `(${codes.join(",")})`)
    : await remove;

  if (error) throw new Error(describeError(error));
}

export async function createProduct(input: ProductInput): Promise<string> {
  const { data, error } = await getSupabase()
    .from("products")
    .insert(toRow(input))
    .select("id")
    .single();

  if (error) throw new Error(describeError(error));

  const id = (data as { id: string }).id;
  await writeSizes(id, input.stock);

  invalidate("products", "categories");
  return id;
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const { error } = await getSupabase().from("products").update(toRow(input)).eq("id", id);
  if (error) throw new Error(describeError(error));

  await writeSizes(id, input.stock);
  invalidate("products", "categories");
}

/**
 * Delete a product outright.
 *
 * `product_images` and `product_sizes` cascade; `order_items.product_id` is
 * `on delete restrict`, so a product that has ever been BOUGHT cannot be
 * deleted — deliberately, because a past order must always be able to show what
 * was actually in it. `describeError` turns that constraint into the sentence
 * that says so, and points at deactivating instead.
 *
 * The image files are removed AFTER the row, and a failure there is swallowed:
 * the product is gone from the shop either way, and reporting a storage
 * housekeeping error as a failed delete would be telling the admin something
 * untrue about their own catalog.
 */
export async function deleteProduct(id: string): Promise<void> {
  const { data: images } = await getSupabase()
    .from("product_images")
    .select("thumb_url, full_url")
    .eq("product_id", id);

  const { error } = await getSupabase().from("products").delete().eq("id", id);
  if (error) throw new Error(describeError(error));

  invalidate("products", "categories");

  const urls = (images ?? []).flatMap((row) => {
    const image = row as { thumb_url: string; full_url: string };
    return [image.thumb_url, image.full_url];
  });
  void deleteImageFiles(urls).catch(() => undefined);
}

/**
 * One column, one statement. Used by the row toggles in the product list, which
 * update optimistically — flipping `active` cannot corrupt anything, and the
 * list re-reads if the write fails.
 */
export async function setProductActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from("products").update({ active }).eq("id", id);
  if (error) throw new Error(describeError(error));
  invalidate("products");
}

/**
 * Feature or unfeature a product.
 *
 * A newly featured product goes to the END of the strip rather than the front:
 * an admin who has arranged an order should not have it rearranged by an
 * unrelated click, and moving it to the front afterwards is one drag.
 */
export async function setProductFeatured(id: string, featured: boolean): Promise<void> {
  const supabase = getSupabase();

  let position = 0;
  if (featured) {
    const { data } = await supabase
      .from("products")
      .select("featured_position")
      .eq("featured", true)
      .order("featured_position", { ascending: false })
      .limit(1)
      .maybeSingle();

    position = ((data as { featured_position: number } | null)?.featured_position ?? 0) + 1;
  }

  const { error } = await supabase
    .from("products")
    .update({ featured, featured_position: featured ? position : 0 })
    .eq("id", id);

  if (error) throw new Error(describeError(error));
  invalidate("products");
}

/**
 * Persist the featured strip's order.
 *
 * Takes the WHOLE ordered list and writes each row's index, rather than
 * swapping two positions: after a drag the admin is looking at a specific
 * arrangement, and writing that arrangement is the only thing guaranteed to
 * produce it. The writes run in parallel — they touch different rows and cannot
 * conflict with each other.
 */
export async function reorderFeatured(orderedIds: readonly string[]): Promise<void> {
  const supabase = getSupabase();

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("products").update({ featured_position: index }).eq("id", id),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(describeError(failed.error));

  invalidate("products");
}

/* ---------------------------------------------------------------------------
 * Stock — the inventory screen's write path (§11)
 * ------------------------------------------------------------------------ */

/**
 * Set one size's stock.
 *
 * NEVER OPTIMISTIC, anywhere it is called from. The dashboard brief allows
 * optimistic updates "where safe" and names inventory as one of the places they
 * are not: a number that appears to have saved and did not is how a shop sells
 * something it does not have.
 */
export async function setSizeStock(
  productId: string,
  size: Size,
  stock: number,
): Promise<void> {
  const { error } = await getSupabase()
    .from("product_sizes")
    .upsert(
      { product_id: productId, size, stock: Math.max(0, Math.round(stock)) },
      { onConflict: "product_id,size" },
    );

  if (error) throw new Error(describeError(error));
  invalidate("products");
}

/** The per-size stock of several products at once — the inventory table's read. */
export async function listStockFor(productIds: readonly string[]): Promise<
  Map<string, Record<Size, number>>
> {
  const byProduct = new Map<string, Record<Size, number>>();
  if (productIds.length === 0) return byProduct;

  // ONE query with `in`, not one per product. This is the exact N+1 the brief
  // warns about: an inventory page of 20 products would otherwise make 21 round
  // trips before it could draw a single row.
  const { data, error } = await getSupabase()
    .from("product_sizes")
    .select("product_id, size, stock")
    .in("product_id", productIds as string[]);

  if (error) throw new Error(describeError(error));

  // An empty map per product, not a pre-seeded S/M/L one. Which sizes a product
  // has is now answered by its rows — seeding three fixed keys would put three
  // phantom columns on the inventory screen for every sneaker in the shop.
  for (const id of productIds) {
    byProduct.set(id, {});
  }

  for (const row of data ?? []) {
    const { product_id, size, stock } = row as {
      product_id: string;
      size: Size;
      stock: number;
    };
    const sizes = byProduct.get(product_id);
    if (sizes) sizes[size] = stock;
  }

  return byProduct;
}

/* ---------------------------------------------------------------------------
 * Images (§19 — BOTH variants, always)
 * ------------------------------------------------------------------------ */

/**
 * Upload one image and attach it to a product.
 *
 * The upload happens first and the row second, so a failed upload never leaves
 * a `product_images` row pointing at a file that does not exist — a broken
 * image on a live product page is worse than a missing one.
 */
export async function addProductImage({
  productId,
  file,
  alt,
  position,
  onProgress,
}: {
  productId: string;
  file: File;
  alt?: string;
  position: number;
  onProgress?: (stage: "encoding" | "uploading") => void;
}): Promise<void> {
  const uploaded = await uploadImagePair({
    file,
    folder: `products/${productId}`,
    specs: PRODUCT_IMAGE,
    onProgress,
  });

  const { error } = await getSupabase().from("product_images").insert({
    product_id: productId,
    position,
    thumb_url: uploaded.thumbUrl,
    full_url: uploaded.fullUrl,
    alt: alt?.trim() || null,
    width: uploaded.width,
    height: uploaded.height,
  });

  if (error) {
    // The row failed, so nothing references these files. Remove them rather
    // than leaving two orphans in the bucket.
    void deleteImageFiles([uploaded.thumbUrl, uploaded.fullUrl]).catch(() => undefined);
    throw new Error(describeError(error));
  }

  invalidate("products");
}

export async function updateImageAlt(imageId: string, alt: string): Promise<void> {
  const { error } = await getSupabase()
    .from("product_images")
    .update({ alt: alt.trim() || null })
    .eq("id", imageId);

  if (error) throw new Error(describeError(error));
  invalidate("products");
}

export async function deleteProductImage(
  imageId: string,
  urls: readonly string[],
): Promise<void> {
  const { error } = await getSupabase().from("product_images").delete().eq("id", imageId);
  if (error) throw new Error(describeError(error));

  invalidate("products");
  void deleteImageFiles(urls).catch(() => undefined);
}

/**
 * Persist a gallery's order after a drag.
 *
 * Position 0 is the COVER: `product_summaries.thumb` is "the first
 * `product_images` row by position", so reordering here changes the image on
 * every card in the shop. That is why the editor labels the first tile rather
 * than hiding the rule.
 */
export async function reorderProductImages(orderedIds: readonly string[]): Promise<void> {
  const supabase = getSupabase();

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("product_images").update({ position: index }).eq("id", id),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(describeError(failed.error));

  invalidate("products");
}
