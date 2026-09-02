import type { Category } from "@shared/types";
import { buildCategoryTree } from "@shared/categories";
import type { SelectOption } from "@admin/components/ui/Select";

/**
 * The category dropdown, built once for every screen that has one.
 *
 * Two screens pick a category — the product editor (which category a product is
 * IN) and the products list (which category to FILTER to) — and they have to
 * offer the same list in the same order, or the same catalog reads as two
 * different shapes depending on which screen you are on.
 *
 * A subcategory is nested under its parent as a native `<optgroup>` rather than
 * indented with spaces, so the relationship survives a screen reader and a
 * phone's picker wheel (see `SelectOption.group`). The parent itself stays a
 * selectable option ABOVE its group: a product can belong to "Shirts" directly,
 * and the filter has to be able to ask for exactly that.
 *
 * Hidden categories are still listed, marked. The dashboard has to be able to
 * put a product into a category that is not live yet — that is how a collection
 * gets built before it is announced — and has to be able to find the products
 * already in one.
 */
export function categorySelectOptions(
  categories: readonly Category[],
): SelectOption<string>[] {
  const label = (category: Category) =>
    category.active === false ? `${category.name} (hidden)` : category.name;

  return buildCategoryTree(categories).flatMap((node) => [
    { value: node.slug, label: label(node) },
    ...node.children.map((child) => ({
      value: child.slug,
      label: label(child),
      group: `Inside ${node.name}`,
    })),
  ]);
}
