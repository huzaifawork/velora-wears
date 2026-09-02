import type { Category } from "./types";

/**
 * Velora Wears — the SUBCATEGORY rules, in one place.
 *
 * `Category.parentSlug` is one nullable column, but reading it correctly means
 * agreeing on four things across two applications: what a top-level category
 * is, what happens to a child whose parent is not in the list, how a parent's
 * product count is arrived at, and which categories a "browse this category"
 * filter actually covers. Each of those has an obvious wrong answer, so they
 * are written here once and imported by both sides rather than reimplemented
 * on each surface.
 *
 * This mirrors the discipline `shared/stock.ts` holds for the low-stock rule
 * after it had drifted into three different definitions.
 *
 * ---------------------------------------------------------------------------
 * DEPTH IS EXACTLY TWO
 * ---------------------------------------------------------------------------
 * The database refuses a subcategory of a subcategory
 * (`categories_enforce_one_level()`), so nothing here recurses. That is a
 * deliberate constraint rather than a simplification: every function below is
 * a single pass over a list of a few dozen rows, with no depth to bound and no
 * cycle to guard against.
 */

/** A parent with its children resolved, and the counts rolled up. */
export interface CategoryNode extends Category {
  /** Its subcategories, in display order. Empty for a category that has none. */
  children: Category[];
  /**
   * Products in this category PLUS everything in its subcategories.
   *
   * `productCount` on the record itself stays the direct count — it is what the
   * database returned and what the dashboard's "12 pieces" link means. This is
   * what a shopper sees on a tile, because tapping a parent shows the
   * subcategories' products too (see `categoryBranchSlugs`).
   */
  totalProductCount: number;
}

/**
 * Groups a flat list into parents and their children.
 *
 * A CHILD WHOSE PARENT IS ABSENT IS DROPPED, and that is the important
 * decision here. It happens for exactly one ordinary reason: the storefront is
 * only ever sent ACTIVE categories (row level security), so hiding "Shirts"
 * leaves "Oxford & Poplin" in the list with a parent that is not.
 *
 * Promoting it to the top level was the alternative, and it does the opposite
 * of what the admin asked for — hiding one heading would push its
 * sub-collections up INTO the navigation as headings of their own. Dropping it
 * hides the branch the admin hid, which is also exactly what hiding a category
 * has always meant: the heading leaves the navigation and its products stay
 * live, still reachable by search and by their own detail pages.
 *
 * Input order is preserved — both sources return categories already sorted by
 * `sortOrder` — and children are ordered the same way within their parent.
 */
export function buildCategoryTree(categories: readonly Category[]): CategoryNode[] {
  const parentOf = parentResolver(categories);

  const childrenBySlug = new Map<string, Category[]>();
  for (const category of categories) {
    const parent = parentOf(category);
    if (!parent) continue;
    const siblings = childrenBySlug.get(parent);
    if (siblings) siblings.push(category);
    else childrenBySlug.set(parent, [category]);
  }

  const byOrder = (a: Category, b: Category) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

  return categories
    .filter((category) => !category.parentSlug)
    .map((category) => {
      const children = [...(childrenBySlug.get(category.slug) ?? [])].sort(byOrder);
      return {
        ...category,
        children,
        totalProductCount:
          category.productCount + children.reduce((sum, child) => sum + child.productCount, 0),
      };
    });
}

/**
 * "Which category in THIS list is that one inside?"
 *
 * Returns undefined when the named parent is not present, which is how a child
 * of a hidden category ends up in no parent's child list and therefore in no
 * tree at all. The self-reference guard is belt and braces — the database
 * refuses one — and keeps an impossible row from parenting itself.
 */
function parentResolver(
  categories: readonly Category[],
): (category: Category) => string | undefined {
  const present = new Set(categories.map((category) => category.slug));

  return (category) =>
    category.parentSlug && category.parentSlug !== category.slug && present.has(category.parentSlug)
      ? category.parentSlug
      : undefined;
}

/**
 * Just the top-level rows, in order — the header bar, the footer column and the
 * landing page's category strip, none of which should list a subcategory beside
 * the heading it belongs to.
 */
export function topLevelCategories(categories: readonly Category[]): Category[] {
  return categories.filter((category) => !category.parentSlug);
}

/** The subcategories of one category, in display order. */
export function subcategoriesOf(
  categories: readonly Category[],
  slug: string | undefined,
): Category[] {
  if (!slug) return [];
  return buildCategoryTree(categories).find((node) => node.slug === slug)?.children ?? [];
}

/**
 * The parent of one category, if it has one AND that parent is in the list.
 *
 * Used for breadcrumbs and for the "which top-level chip is lit" question,
 * where the answer for a subcategory is its parent.
 */
export function parentOfCategory(
  categories: readonly Category[],
  slug: string | undefined,
): Category | undefined {
  if (!slug) return undefined;
  const category = categories.find((c) => c.slug === slug);
  if (!category?.parentSlug) return undefined;
  return categories.find((c) => c.slug === category.parentSlug);
}

/**
 * EVERY category a "browse `slug`" filter covers: the category itself, plus
 * its subcategories.
 *
 * This is what makes a parent category meaningful. A product lives in exactly
 * one category, so if "Oversized shirts" holds four products then "Shirts"
 * holds none of them — and a shopper tapping "Shirts" and finding it empty
 * would be right to think the shop was broken. Browsing a parent browses the
 * whole branch; browsing a child browses only the child.
 *
 * Returns `[slug]` for a leaf, for an unknown slug, and for a category with no
 * children — so a caller never has to special-case any of those. The order is
 * stable (self first) purely so cache keys built from it are stable.
 */
export function categoryBranchSlugs(
  categories: readonly Category[] | undefined,
  slug: string,
): string[] {
  if (!categories?.length) return [slug];
  return [slug, ...subcategoriesOf(categories, slug).map((child) => child.slug)];
}

/**
 * What a category's product count should SAY on a customer-facing surface:
 * its own products plus its subcategories'.
 *
 * The dashboard deliberately does not use this — an admin's "12 pieces" link
 * opens the products filtered to that exact category, so it has to be the
 * direct count or the number and the list would disagree.
 */
export function branchProductCount(
  categories: readonly Category[],
  category: Category,
): number {
  return (
    category.productCount +
    subcategoriesOf(categories, category.slug).reduce((sum, child) => sum + child.productCount, 0)
  );
}
