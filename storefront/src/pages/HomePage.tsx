import type { Category, ProductSummary } from "@shared/types";
import { ValueProps } from "@/components/layout/ValueProps";
import { useAsync } from "@/hooks/useAsync";
import {
  getCategories,
  getSettings,
  listFeatured,
  listSiteImages,
  listTestimonials,
} from "@/lib/queries";
import { BrandIntro } from "@/features/home/BrandIntro";
import { CategoryStrip } from "@/features/home/CategoryStrip";
import { CtaBand } from "@/features/home/CtaBand";
import { FeaturedProducts } from "@/features/home/FeaturedProducts";
import { Hero, type HeroStats } from "@/features/home/Hero";
import { InstagramStrip } from "@/features/home/InstagramStrip";
import { PromoBanners } from "@/features/home/PromoBanners";
import { Testimonials } from "@/features/home/Testimonials";

/**
 * The landing page (requirements section 2).
 *
 * It only composes sections and hands them data — every piece of markup lives
 * in a reusable component (section 18). Data comes exclusively from
 * `lib/queries.ts`, so this page is identical whether the catalog is served
 * from demo data or the Realtime Database.
 *
 * The four reads run in parallel and independently, so a slow one does not
 * hold up the rest of the page; each section renders its own skeleton until its
 * data lands (section 19).
 *
 * `listSiteImages` is ONE request covering both the hero and the promo banners
 * — they live in one table and this page needs both, so splitting it would be
 * two round trips to draw one screen. Every section it feeds keeps its own
 * default art, so an empty result changes nothing about how this page renders
 * (requirements section 8).
 */
/**
 * The hero's figures, measured from the catalog rather than written down.
 *
 * Both come from reads this page ALREADY makes, so the numbers cost nothing:
 * the size of the collection is the categories' own live product counts (a
 * related-row count Postgres computes in the same query — see the note on
 * `Category.productCount`), and the rating is a weighted mean over the loaded
 * products that actually have reviews.
 *
 * `undefined` means "not known", and `Hero` omits the stat entirely rather than
 * printing a zero or inventing a placeholder. That matters most on the day the
 * shop goes live with real data and no reviews yet.
 */
function heroStats(
  categories: Category[] | undefined,
  products: ProductSummary[] | undefined,
): HeroStats {
  const pieces = categories?.reduce((sum, category) => sum + category.productCount, 0);

  // Weighted by review count, so a piece with forty reviews counts for more
  // than one with a single five-star. Products with no reviews are excluded
  // rather than treated as zero — an unrated piece is not a nought-star piece.
  const rated = (products ?? []).filter((product) => product.ratingCount > 0);
  const reviews = rated.reduce((sum, product) => sum + product.ratingCount, 0);
  const rating =
    reviews > 0
      ? rated.reduce((sum, product) => sum + product.ratingAvg * product.ratingCount, 0) / reviews
      : undefined;

  return { pieces, rating };
}

export function HomePage() {
  const featured = useAsync(
    () => Promise.all([listFeatured(8), getCategories()]),
    "home:featured:8",
  );
  const settings = useAsync(() => getSettings(), "settings");
  const testimonials = useAsync(() => listTestimonials(6), "testimonials:6");
  const siteImages = useAsync(() => listSiteImages(), "site-images");

  const [products, categories] = featured.data ?? [undefined, undefined];

  // Split by slot here rather than in two queries. Both arrays are empty until
  // the read lands, which is the same thing as "nothing uploaded" — so the
  // sections below render their defaults during loading and never flash.
  const heroImages = siteImages.data?.filter((image) => image.slot === "hero");
  const promoBanners = siteImages.data?.filter((image) => image.slot === "promo");

  return (
    <>
      <Hero
        settings={settings.data}
        images={heroImages}
        stats={heroStats(categories, products)}
      />
      <ValueProps settings={settings.data} />
      <CategoryStrip categories={categories} loading={featured.loading} />
      <FeaturedProducts
        products={products}
        categories={categories}
        loading={featured.loading}
      />
      <PromoBanners banners={promoBanners} />
      <BrandIntro />
      <Testimonials reviews={testimonials.data} loading={testimonials.loading} />
      <InstagramStrip products={products} loading={featured.loading} />
      <CtaBand settings={settings.data} />
    </>
  );
}
