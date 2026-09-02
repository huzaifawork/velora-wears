import { Link } from "react-router-dom";

import type { Category } from "@shared/types";
import { buildCategoryTree } from "@shared/categories";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { ValueProps } from "@/components/layout/ValueProps";
import { buttonClasses } from "@/components/ui/Button";
import { CategoryTile, CategoryTileSkeleton } from "@/features/categories/CategoryTile";
import { useAsync } from "@/hooks/useAsync";
import { getCategories, getSettings } from "@/lib/queries";
import { HOME, PRODUCTS, categoryPath } from "@/lib/routes";

/**
 * The categories index (requirements section 5 — "products should be organized
 * into appropriate categories").
 *
 * One page that shows the whole shape of the catalog at a glance, and the
 * canonical place a visitor lands when they want to browse rather than search.
 * Every tile opens the same category URL the header, the footer, the landing
 * bento and a product's breadcrumbs use — `lib/routes.ts` owns that decision.
 *
 * It reads ONLY the categories node, which is small, flat and already cached by
 * the query layer from wherever the visitor came from. It deliberately does not
 * preview products per category: that would be one catalog read per category on
 * a page whose entire job is to hand the visitor on to the category listing
 * (requirements section 19).
 *
 * ---------------------------------------------------------------------------
 * SUBCATEGORIES ARE LINKS UNDER A TILE, NOT TILES OF THEIR OWN
 * ---------------------------------------------------------------------------
 * This is the page that shows the shop's SHAPE, so the two levels have to look
 * like two levels. A grid of equal tiles would say "Shirts" and "Oxford &
 * Poplin" are peers, which is the one thing this page exists to contradict —
 * and it would need tile art for every subcategory before it looked like
 * anything. A tile per category, with its sub-collections listed beneath it as
 * small links, keeps one picture per heading and still puts every subcategory
 * one tap away.
 */
export function CategoriesPage() {
  const state = useAsync(() => getCategories(), "categories");
  const settings = useAsync(() => getSettings(), "settings");

  // Grouped into parents and their children. A flat catalog produces a list of
  // parents with no children, which renders exactly as this page always has.
  const tree = state.data ? buildCategoryTree(state.data) : undefined;
  const empty = !state.loading && !state.error && (tree?.length ?? 0) === 0;

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", to: HOME }, { label: "Categories" }]} />

      <PageHeader
        eyebrow="Browse"
        title="Shop by category"
        description="The collection is built around what people actually wear: oversized shirts for the working week, a winter collection for the cold months, and the trousers, shoes and essentials that go with them. Pick one and browse it on its own."
      >
        <p className="mt-8">
          <Link to={PRODUCTS} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            Or view the whole collection
          </Link>
        </p>
      </PageHeader>

      <Container className="py-14 sm:py-20">
        {state.error ? (
          <p className="py-10 text-center text-sm text-ink-soft">
            The categories could not be loaded just now. Please refresh the page.
          </p>
        ) : empty ? (
          <p className="py-10 text-center text-sm text-ink-soft">
            The collection is not organised into categories yet. Everything is in one place
            for now.
          </p>
        ) : (
          <div className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {state.loading
              ? Array.from({ length: 3 }, (_, i) => (
                  <CategoryTileSkeleton key={i} variant="portrait" />
                ))
              : tree?.map((node, i) => (
                  <div key={node.slug}>
                    <CategoryTile
                      category={node}
                      /* The branch total — tapping the tile opens the
                         subcategories' products too. */
                      count={node.totalProductCount}
                      variant="portrait"
                      index={i}
                      showDescription
                      /* The first row is above the fold on every screen size. */
                      eager={i < 3}
                    />
                    <SubcategoryLinks parent={node.name} categories={node.children} />
                  </div>
                ))}
          </div>
        )}
      </Container>

      <ValueProps settings={settings.data} />
    </>
  );
}

/**
 * The sub-collections under one category tile.
 *
 * An EMPTY subcategory is still listed, greyed and unlinked, for the same
 * reason `CategoryTile` refuses to link an empty category: a link that promises
 * pieces and opens an empty grid is worse than a label that says the edit is on
 * its way. Renders nothing at all when a category has no children, which is
 * every category in a shop that has not used subcategories.
 */
function SubcategoryLinks({
  parent,
  categories,
}: {
  parent: string;
  categories: Category[];
}) {
  if (categories.length === 0) return null;

  return (
    <ul aria-label={`Inside ${parent}`} className="mt-3 flex flex-wrap gap-2">
      {categories.map((category) => {
        const empty = category.productCount === 0;

        return (
          <li key={category.slug}>
            {empty ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-line border-dashed px-3 py-1.5 text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
                {category.name}
                <span className="text-ink-muted/70">Soon</span>
              </span>
            ) : (
              <Link
                to={categoryPath(category.slug)}
                className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[0.625rem] tracking-eyebrow text-ink-soft uppercase transition duration-200 ease-brand hover:border-accent hover:text-accent"
              >
                {category.name}
                <span className="text-ink-muted">{category.productCount}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
