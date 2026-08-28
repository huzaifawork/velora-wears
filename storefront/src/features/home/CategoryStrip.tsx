import { Link } from "react-router-dom";

import type { Category } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { Image } from "@/components/ui/Image";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The categories section (requirements sections 2 and 5).
 *
 * Laid out as an editorial bento: the first category takes a tall feature tile
 * and the rest stack beside it, so the grid reads as a considered lookbook
 * rather than three identical boxes. Each tile links into the products page
 * filtered by that category — the same URL the header navigation and the
 * filters in section 14 use.
 */

const CATEGORY_IMAGE = { width: 800, height: 1000 } as const;

function CategoryTile({
  category,
  index,
  feature,
}: {
  category: Category;
  index: number;
  feature: boolean;
}) {
  return (
    <Link
      to={`/products?category=${category.slug}`}
      className={`group relative isolate overflow-hidden rounded-sm bg-canvas-deep ${
        feature ? "sm:row-span-2" : ""
      }`}
    >
      {category.thumb && (
        <Image
          src={category.thumb}
          alt={`${category.name} at Velora Wears`}
          width={CATEGORY_IMAGE.width}
          height={CATEGORY_IMAGE.height}
          className={`w-full object-cover transition duration-700 ease-brand group-hover:scale-[1.06] ${
            feature ? "aspect-4/5 sm:h-full" : "aspect-16/10 sm:aspect-3/2"
          }`}
        />
      )}

      {/* Ink scrim, so the label stays readable over any image. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-ink/80 via-ink/20 to-transparent transition duration-500 group-hover:from-ink/90"
      />

      <span className="absolute top-5 left-5 font-display text-xs text-canvas/60">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5 sm:p-6">
        <div>
          <h3 className={`text-canvas ${feature ? "text-3xl sm:text-4xl" : "text-2xl"}`}>
            {category.name}
          </h3>
          <p className="mt-1.5 text-[0.625rem] tracking-eyebrow text-canvas/70 uppercase">
            {category.productCount} {category.productCount === 1 ? "piece" : "pieces"}
          </p>
        </div>
        <span className="flex items-center gap-2 text-[0.625rem] tracking-eyebrow text-accent-soft uppercase">
          Shop
          <span
            aria-hidden="true"
            className="inline-block transition duration-300 ease-brand group-hover:translate-x-1"
          >
            &rarr;
          </span>
        </span>
      </div>
    </Link>
  );
}

export function CategoryStrip({
  categories,
  loading,
}: {
  categories: Category[] | undefined;
  loading: boolean;
}) {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Shop by category"
          title="Three things you wear constantly"
          description="Shirts you can wear to work, hoodies for the cold months, and the plain essentials that quietly do the most work in a wardrobe."
        />

        <div className="mt-12 grid gap-4 sm:auto-rows-fr sm:grid-cols-2">
          {loading
            ? Array.from({ length: 3 }, (_, i) => (
                <Skeleton
                  key={i}
                  className={i === 0 ? "aspect-4/5 w-full sm:row-span-2" : "aspect-3/2 w-full"}
                />
              ))
            : categories?.map((category, i) => (
                <CategoryTile
                  key={category.slug}
                  category={category}
                  index={i}
                  feature={i === 0}
                />
              ))}
        </div>
      </Container>
    </section>
  );
}
