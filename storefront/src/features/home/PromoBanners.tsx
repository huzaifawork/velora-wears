import { Link } from "react-router-dom";

import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { Image } from "@/components/ui/Image";

/**
 * Promotional banners (requirements section 2). Two editorial panels that push
 * into the two categories the brand actually wants to sell this season.
 *
 * The copy lives here rather than in the catalog: these are marketing slots the
 * brand edits, not product records the admin dashboard writes.
 */

const BANNER_IMAGE = { width: 1200, height: 800 } as const;

const banners = [
  {
    image: "/banners/promo-shirts.webp",
    alt: "Velora Wears linen shirt in warm sand",
    eyebrow: "The shirting edit",
    title: "Linen and oxford, cut for real weather",
    body: "Breathable shirts that survive a Karachi afternoon and still look right at dinner.",
    to: "/products?category=shirts",
    cta: "Shop shirts",
  },
  {
    image: "/banners/promo-hoodies.webp",
    alt: "Velora Wears heavyweight hoodie in deep plum",
    eyebrow: "Winter drop",
    title: "400 GSM fleece, in from the cold",
    body: "Heavyweight hoodies with a hood that stands up and a fit that layers.",
    to: "/products?category=hoodies",
    cta: "Shop hoodies",
  },
];

export function PromoBanners() {
  return (
    <section className="py-20 sm:py-24">
      <Container className="grid gap-6 lg:grid-cols-2">
        {banners.map((banner) => (
          <article
            key={banner.title}
            className="group relative overflow-hidden rounded-sm bg-canvas-deep"
          >
            <Image
              src={banner.image}
              alt={banner.alt}
              width={BANNER_IMAGE.width}
              height={BANNER_IMAGE.height}
              className="aspect-4/5 w-full object-cover transition duration-700 ease-brand group-hover:scale-[1.04] sm:aspect-16/11"
            />

            <div
              aria-hidden="true"
              className="absolute inset-0 bg-linear-to-r from-ink/85 via-ink/45 via-40% to-transparent"
            />

            <div className="absolute inset-y-0 left-0 flex max-w-md flex-col justify-center gap-4 p-7 sm:p-12">
              <p className="flex items-center gap-3 text-[0.625rem] tracking-eyebrow text-accent-soft uppercase">
                <span aria-hidden="true" className="h-px w-8 bg-accent-soft" />
                {banner.eyebrow}
              </p>
              <h3 className="text-3xl leading-[1.1] text-balance text-canvas sm:text-4xl">
                {banner.title}
              </h3>
              <p className="text-sm leading-relaxed text-canvas/80">{banner.body}</p>
              <div>
                <Link to={banner.to} className={buttonClasses({ variant: "accent", size: "sm" })}>
                  {banner.cta}
                </Link>
              </div>
            </div>
          </article>
        ))}
      </Container>
    </section>
  );
}
