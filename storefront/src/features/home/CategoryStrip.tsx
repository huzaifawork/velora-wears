import { Link } from "react-router-dom";

import type { Category } from "@shared/types";
import { buildCategoryTree } from "@shared/categories";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryTile, CategoryTileSkeleton } from "@/features/categories/CategoryTile";
import { CATEGORIES } from "@/lib/routes";

/**
 * The categories section on the landing page (requirements sections 2 and 5).
 *
 * Laid out as an editorial bento: the first category takes a tall feature tile
 * and the rest stack beside it, so the grid reads as a considered lookbook
 * rather than three identical boxes. The tile itself lives in
 * `features/categories/CategoryTile` and is shared with the /categories index —
 * this component owns the LAYOUT, not the tile (section 18).
 *
 * The bento only has room for the first three categories, which is why it links
 * on to the full index rather than growing a fourth row when the admin adds a
 * category.
 *
 * TOP-LEVEL CATEGORIES ONLY, and each tile counts its whole branch. Three tiles
 * is the landing page saying what kind of shop this is; a subcategory in that
 * position would be a detail standing where a heading belongs. The index this
 * links on to is where the sub-collections are listed.
 */

const SHOWN = 3;

export function CategoryStrip({
  categories,
  loading,
}: {
  categories: Category[] | undefined;
  loading: boolean;
}) {
  const shown = categories && buildCategoryTree(categories).slice(0, SHOWN);

  // Nothing to show — omit the section rather than leaving an empty heading.
  if (!loading && (!shown || shown.length === 0)) return null;

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Shop by category"
          title="Everything you actually wear"
          description="Oversized shirts for the working week, a winter collection for the cold months, and the trousers, shoes and plain essentials that go under and around them."
          action={
            <Link
              to={CATEGORIES}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              All categories
            </Link>
          }
        />

        <div className="mt-12 grid gap-4 sm:auto-rows-fr sm:grid-cols-2">
          {loading
            ? Array.from({ length: SHOWN }, (_, i) => (
                <CategoryTileSkeleton
                  key={i}
                  variant={i === 0 ? "feature" : "compact"}
                  className={i === 0 ? "sm:row-span-2" : ""}
                />
              ))
            : shown?.map((category, i) => (
                <CategoryTile
                  key={category.slug}
                  category={category}
                  count={category.totalProductCount}
                  variant={i === 0 ? "feature" : "compact"}
                  index={i}
                  className={i === 0 ? "sm:row-span-2" : ""}
                />
              ))}
        </div>
      </Container>
    </section>
  );
}
