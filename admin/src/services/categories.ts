import type { Category } from "@shared/types";
import { PRODUCT_IMAGE } from "@shared/media";
import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { invalidate } from "@admin/lib/cache";
import { deleteImageFiles, uploadSingleImage } from "@admin/lib/storage";
import { CATEGORY_COLUMNS, toCategory, type CategoryRow } from "@admin/services/rows";

/**
 * Categories (requirements section 8, §5).
 *
 * The whole table is a handful of rows, read in one query with a live product
 * count — `products(count)` is a related-row aggregate PostgREST computes in
 * the same statement, which is why `Category.productCount` is not a stored
 * column anybody has to keep in sync (see `developerb.md` §3).
 *
 * That count respects row level security, and here that is a feature: signed in
 * as an admin it counts every product including the retired ones, which is what
 * the dashboard should show. The storefront's identical query counts only the
 * active ones, which is what a customer should see.
 */

export const CATEGORY_LIST_KEY = "categories:all";

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await getSupabase()
    .from("categories")
    .select(`${CATEGORY_COLUMNS}, products(count)`)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(describeError(error));
  return (data ?? []).map((row) => toCategory(row as unknown as CategoryRow));
}

export interface CategoryInput {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  active: boolean;
  thumb?: string | null;
  /**
   * The category this one sits inside, or null for a top-level one
   * (requirements section 5 — subcategories).
   *
   * Unlike the slug, this CAN be changed after creation: moving a
   * sub-collection under a different heading rewrites no public URL, because
   * `/products?category=oxford-shirts` is addressed by the slug alone. Only
   * where it appears in the navigation changes.
   *
   * The database refuses a parent that is itself a subcategory, and refuses to
   * give a parent to a category that already has children
   * (`categories_enforce_one_level()`), so the form below cannot create a third
   * level however it is driven.
   */
  parentSlug?: string | null;
}

function toRow(input: CategoryInput) {
  return {
    slug: input.slug.trim(),
    name: input.name.trim(),
    description: input.description.trim() || null,
    sort_order: Math.round(input.sortOrder),
    active: input.active,
    thumb: input.thumb ?? null,
    parent_slug: input.parentSlug?.trim() || null,
  };
}

export async function createCategory(input: CategoryInput): Promise<void> {
  const { error } = await getSupabase().from("categories").insert(toRow(input));
  if (error) throw new Error(describeError(error));
  invalidate("categories", "products");
}

/**
 * Update a category — everything EXCEPT its slug.
 *
 * The slug is the primary key and `products.category_slug` references it `on
 * update cascade`, so Postgres would happily rename it and carry the products
 * along. The storefront would not: `/products?category=shirts` is a public,
 * linkable address (`storefront/src/lib/routes.ts`), and every link to it from
 * outside the site would break silently. Retiring a category and creating a new
 * one is the honest version of that change, and the dashboard says so.
 */
export async function updateCategory(slug: string, input: CategoryInput): Promise<void> {
  const { slug: _ignored, ...rest } = toRow(input);
  void _ignored;

  const { error } = await getSupabase().from("categories").update(rest).eq("slug", slug);
  if (error) throw new Error(describeError(error));
  invalidate("categories", "products");
}

export async function setCategoryActive(slug: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from("categories").update({ active }).eq("slug", slug);
  if (error) throw new Error(describeError(error));
  invalidate("categories");
}

/**
 * Delete a category.
 *
 * `products.category_slug` is `on delete restrict`, so this FAILS while any
 * product still points at it — including retired ones, which is correct: a
 * deactivated product still has to be able to say what it was. `describeError`
 * turns that constraint into "move or delete them first".
 *
 * `categories.parent_slug` is `on delete restrict` for the same reason, so a
 * category with subcategories cannot be deleted out from under them either.
 * The dialog says which of the two is in the way before the click.
 */
export async function deleteCategory(slug: string, thumb?: string): Promise<void> {
  const { error } = await getSupabase().from("categories").delete().eq("slug", slug);
  if (error) throw new Error(describeError(error));

  invalidate("categories", "products");
  if (thumb) void deleteImageFiles([thumb]).catch(() => undefined);
}

/**
 * Persist the display order after a move. Same shape as the featured strip's.
 *
 * ONE GROUP AT A TIME. `sort_order` is scoped to a category's siblings — the
 * top-level categories order among themselves, and each set of subcategories
 * orders within its parent — so the page passes the slugs of the row being
 * reordered and nothing else. Passing every category would renumber the
 * children against their parents and shuffle both.
 */
export async function reorderCategories(orderedSlugs: readonly string[]): Promise<void> {
  const supabase = getSupabase();

  const results = await Promise.all(
    orderedSlugs.map((slug, index) =>
      supabase.from("categories").update({ sort_order: index }).eq("slug", slug),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(describeError(failed.error));

  invalidate("categories");
}

/**
 * The tile image shown on the storefront's category strip.
 *
 * ONE variant, not a pair: `categories.thumb` is a single column and the shop
 * renders a category tile at card size only — there is no detail view that
 * would ever request a full-resolution version, so producing one would be a
 * file nothing requests. Products and banners, which do have detail views, get
 * both variants (§19).
 */
export async function uploadCategoryThumb(
  slug: string,
  file: File,
  onProgress?: (stage: "encoding" | "uploading") => void,
): Promise<string> {
  const { url } = await uploadSingleImage({
    file,
    folder: `categories/${slug}`,
    spec: PRODUCT_IMAGE.thumb,
    onProgress,
  });

  return url;
}
