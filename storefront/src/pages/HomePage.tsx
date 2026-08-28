import { useAsync } from "@/hooks/useAsync";
import { getCategories, getSettings, listProducts, listTestimonials } from "@/lib/queries";
import { BrandIntro } from "@/features/home/BrandIntro";
import { CategoryStrip } from "@/features/home/CategoryStrip";
import { CtaBand } from "@/features/home/CtaBand";
import { FeaturedProducts } from "@/features/home/FeaturedProducts";
import { Hero } from "@/features/home/Hero";
import { InstagramStrip } from "@/features/home/InstagramStrip";
import { PromoBanners } from "@/features/home/PromoBanners";
import { Testimonials } from "@/features/home/Testimonials";
import { ValueProps } from "@/features/home/ValueProps";

/**
 * The landing page (requirements section 2).
 *
 * It only composes sections and hands them data — every piece of markup lives
 * in a reusable component (section 18). Data comes exclusively from
 * `lib/queries.ts`, so this page is identical whether the catalog is served
 * from demo data or the Realtime Database.
 *
 * The three reads run in parallel and independently, so a slow one does not
 * hold up the rest of the page; each section renders its own skeleton until its
 * data lands (section 19).
 */
export function HomePage() {
  const featured = useAsync(
    () => Promise.all([listProducts({ limit: 8 }), getCategories()]),
    "home:featured:8",
  );
  const settings = useAsync(() => getSettings(), "settings");
  const testimonials = useAsync(() => listTestimonials(3), "testimonials:3");

  const [products, categories] = featured.data ?? [undefined, undefined];

  return (
    <>
      <Hero settings={settings.data} />
      <ValueProps settings={settings.data} />
      <CategoryStrip categories={categories} loading={featured.loading} />
      <FeaturedProducts
        products={products}
        categories={categories}
        loading={featured.loading}
      />
      <PromoBanners />
      <BrandIntro />
      <Testimonials reviews={testimonials.data} loading={testimonials.loading} />
      <InstagramStrip products={products} loading={featured.loading} />
      <CtaBand settings={settings.data} />
    </>
  );
}
