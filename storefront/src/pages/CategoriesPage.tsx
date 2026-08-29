import { Link } from "react-router-dom";

import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { ValueProps } from "@/components/layout/ValueProps";
import { buttonClasses } from "@/components/ui/Button";
import { CategoryTile, CategoryTileSkeleton } from "@/features/categories/CategoryTile";
import { useAsync } from "@/hooks/useAsync";
import { getCategories, getSettings } from "@/lib/queries";
import { HOME, PRODUCTS } from "@/lib/routes";

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
 */
export function CategoriesPage() {
  const state = useAsync(() => getCategories(), "categories");
  const settings = useAsync(() => getSettings(), "settings");

  const categories = state.data;
  const empty = !state.loading && !state.error && (categories?.length ?? 0) === 0;

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", to: HOME }, { label: "Categories" }]} />

      <PageHeader
        eyebrow="Browse"
        title="Shop by category"
        description="The collection is built around three things people actually wear: shirts for the working week, hoodies for the cold months, and the plain essentials underneath both. Pick one and browse it on its own."
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {state.loading
              ? Array.from({ length: 3 }, (_, i) => (
                  <CategoryTileSkeleton key={i} variant="portrait" />
                ))
              : categories?.map((category, i) => (
                  <CategoryTile
                    key={category.slug}
                    category={category}
                    variant="portrait"
                    index={i}
                    showDescription
                    /* The first row is above the fold on every screen size. */
                    eager={i < 3}
                  />
                ))}
          </div>
        )}
      </Container>

      <ValueProps settings={settings.data} />
    </>
  );
}
