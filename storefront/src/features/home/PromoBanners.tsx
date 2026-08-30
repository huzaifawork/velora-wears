import { Link } from "react-router-dom";

import type { SiteImage } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { categoryPath } from "@/lib/routes";
import { Image } from "@/components/ui/Image";

/**
 * Promotional banners (requirements section 2, now also section 8).
 *
 * Two editorial panels that push into the categories the brand wants to sell
 * this season. They are marketing slots rather than product records — which is
 * why the copy was written here rather than read from the catalog.
 *
 * ---------------------------------------------------------------------------
 * THE ADMIN CAN NOW REPLACE THEM (section 8)
 * ---------------------------------------------------------------------------
 * `banners` is whatever the admin has uploaded into the `promo` slot. Upload
 * nothing and this section renders the two panels below exactly as it always
 * has; upload one and it replaces them; upload four and there are four. Each
 * uploaded record's copy is optional and falls back to the DEFAULTS below
 * position by position, so a photograph swap does not mean retyping a headline.
 */

const BANNER_IMAGE = { width: 1200, height: 800 } as const;

interface Banner {
  image: string;
  alt: string;
  eyebrow: string;
  title: string;
  body: string;
  to: string;
  cta: string;
  /** True for an uploaded banner whose link may point outside the shop. */
  external?: boolean;
}

const DEFAULT_BANNERS: Banner[] = [
  {
    image: "/banners/promo-shirts.webp",
    alt: "Velora Wears linen shirt in warm sand",
    eyebrow: "The shirting edit",
    title: "Linen and oxford, cut for real weather",
    body: "Breathable shirts that survive a Karachi afternoon and still look right at dinner.",
    to: categoryPath("shirts"),
    cta: "Shop shirts",
  },
  {
    image: "/banners/promo-hoodies.webp",
    alt: "Velora Wears heavyweight hoodie in deep plum",
    eyebrow: "Winter drop",
    title: "400 GSM fleece, in from the cold",
    body: "Heavyweight hoodies with a hood that stands up and a fit that layers.",
    to: categoryPath("winter-collection"),
    cta: "Shop winter",
  },
];

export function PromoBanners({ banners }: { banners?: SiteImage[] }) {
  const uploaded = banners ?? [];

  const shown: Banner[] =
    uploaded.length > 0
      ? uploaded.map((image, index) => {
          // The default at the same position supplies anything the admin left
          // empty, so an uploaded photograph with no words still reads as a
          // finished panel rather than an untitled picture.
          const fallback = DEFAULT_BANNERS[index % DEFAULT_BANNERS.length];
          const href = image.ctaHref ?? fallback.to;

          return {
            image: image.full,
            alt: image.alt ?? fallback.alt,
            eyebrow: image.eyebrow ?? fallback.eyebrow,
            title: image.title ?? fallback.title,
            body: image.body ?? fallback.body,
            to: href,
            cta: image.ctaLabel ?? fallback.cta,
            external: !href.startsWith("/"),
          };
        })
      : DEFAULT_BANNERS;

  return (
    <section className="py-20 sm:py-24">
      <Container
        className={`grid gap-6 ${shown.length === 1 ? "" : "lg:grid-cols-2"}`}
      >
        {shown.map((banner) => (
          <article
            key={`${banner.title}-${banner.image}`}
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
                {/* An uploaded banner may link anywhere; a path stays inside
                    react-router, a full URL is a real anchor that leaves the
                    shop. The admin only ever types where they want it to go. */}
                {banner.external ? (
                  <a
                    href={banner.to}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClasses({ variant: "accent", size: "sm" })}
                  >
                    {banner.cta}
                  </a>
                ) : (
                  <Link
                    to={banner.to}
                    className={buttonClasses({ variant: "accent", size: "sm" })}
                  >
                    {banner.cta}
                  </Link>
                )}
              </div>
            </div>
          </article>
        ))}
      </Container>
    </section>
  );
}
