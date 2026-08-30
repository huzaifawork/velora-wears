import { Link } from "react-router-dom";

import type { SiteImage } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { Image } from "@/components/ui/Image";

/**
 * Promotional banners (requirements section 2, now also section 8).
 *
 * Editorial panels pushing into whatever categories the brand wants to sell
 * this season. Entirely admin-driven — `banners` is whatever has been
 * uploaded into the `promo` slot. Nothing uploaded means nothing here: this
 * used to fall back to two illustrated example panels ("The shirting edit" /
 * "Winter drop", the throwaway demo artwork), which meant a real store that
 * hadn't set up promos yet still showed fictional marketing copy as if it
 * were real. Now it renders nothing until the admin actually uploads
 * something, the same as `Testimonials` renders nothing with no reviews yet.
 *
 * Each field on an uploaded banner is independently optional and, if left
 * blank, is simply omitted — never replaced with invented copy over a real
 * photograph.
 */

const BANNER_IMAGE = { width: 1200, height: 800 } as const;

interface Banner {
  image: string;
  alt?: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  to?: string;
  cta?: string;
  /** True for a link that may point outside the shop. */
  external?: boolean;
}

export function PromoBanners({ banners }: { banners?: SiteImage[] }) {
  const uploaded = banners ?? [];

  if (uploaded.length === 0) return null;

  const shown: Banner[] = uploaded.map((image) => {
    const href = image.ctaHref;

    return {
      image: image.full,
      alt: image.alt,
      eyebrow: image.eyebrow,
      title: image.title,
      body: image.body,
      to: href,
      cta: image.ctaLabel,
      external: Boolean(href) && !href!.startsWith("/"),
    };
  });

  return (
    <section className="py-20 sm:py-24">
      <Container
        className={`grid gap-6 ${shown.length === 1 ? "" : "lg:grid-cols-2"}`}
      >
        {shown.map((banner) => (
          <article
            key={banner.image}
            className="group relative overflow-hidden rounded-sm bg-canvas-deep"
          >
            <Image
              src={banner.image}
              alt={banner.alt ?? ""}
              width={BANNER_IMAGE.width}
              height={BANNER_IMAGE.height}
              className="aspect-4/5 w-full object-cover transition duration-700 ease-brand group-hover:scale-[1.04] sm:aspect-16/11"
            />

            {/* The scrim, and everything overlaid on it, only earns its
                place when there is copy to protect — a banner that is just a
                photograph doesn't need a dark wash cut across it. */}
            {(banner.eyebrow || banner.title || banner.body || (banner.to && banner.cta)) && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-linear-to-r from-ink/85 via-ink/45 via-40% to-transparent"
                />

                <div className="absolute inset-y-0 left-0 flex max-w-md flex-col justify-center gap-4 p-7 sm:p-12">
                  {banner.eyebrow && (
                    <p className="flex items-center gap-3 text-[0.625rem] tracking-eyebrow text-accent-soft uppercase">
                      <span aria-hidden="true" className="h-px w-8 bg-accent-soft" />
                      {banner.eyebrow}
                    </p>
                  )}
                  {banner.title && (
                    <h3 className="text-3xl leading-[1.1] text-balance text-canvas sm:text-4xl">
                      {banner.title}
                    </h3>
                  )}
                  {banner.body && (
                    <p className="text-sm leading-relaxed text-canvas/80">{banner.body}</p>
                  )}
                  {/* An uploaded banner may link anywhere; a path stays inside
                      react-router, a full URL is a real anchor that leaves the
                      shop. The admin only ever types where they want it to go.
                      No link and no label set at all means no button — never a
                      button that goes nowhere. */}
                  {banner.to && banner.cta && (
                    <div>
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
                  )}
                </div>
              </>
            )}
          </article>
        ))}
      </Container>
    </section>
  );
}
