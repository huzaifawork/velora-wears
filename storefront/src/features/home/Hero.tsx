import { Link } from "react-router-dom";

import type { Settings } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { PRODUCTS, categoryPath } from "@/lib/routes";
import { Image } from "@/components/ui/Image";
import { Marquee } from "@/components/ui/Marquee";
import { formatPrice } from "@/lib/format";

/**
 * Landing hero (requirements section 2): the brand statement, a short
 * introduction to what Velora Wears sells, and the two calls to action that
 * matter — shop everything, or jump straight into the winter collection.
 *
 * The composition is the editorial split used by most premium fashion labels:
 * type on the left, one large product image on the right with the social proof
 * floated over it, then a running ticker of the delivery and payment terms —
 * the pattern an Instagram-led brand's customers already recognise.
 *
 * The hero image is the page's largest paint, so it is the ONE image on the
 * landing page loaded eagerly at high priority (section 19). Its intrinsic
 * dimensions are declared, so the layout does not move while it arrives.
 */
export function Hero({ settings }: { settings: Settings | null | undefined }) {
  const threshold = settings?.freeDeliveryThreshold;

  const promises = [
    "Cash on delivery",
    threshold ? `Free delivery over ${formatPrice(threshold)}` : "Nationwide delivery",
    "Delivered in 2-4 days",
    "7-day size exchange",
    "Made in Pakistan",
  ];

  return (
    <section className="relative overflow-hidden bg-canvas-alt">
      {/* Decorative brand wash - never interactive. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 -left-40 h-[36rem] w-[36rem] rounded-full bg-accent-soft/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-0 h-[28rem] w-[28rem] rounded-full bg-brand/5 blur-3xl"
      />

      <Container className="relative grid items-center gap-14 pt-14 pb-20 lg:grid-cols-[1.08fr_1fr] lg:gap-16 lg:pt-20 lg:pb-28">
        <div className="animate-rise">
          <p className="flex items-center gap-3 text-[0.625rem] tracking-eyebrow text-accent uppercase">
            <span aria-hidden="true" className="h-px w-10 bg-accent" />
            Autumn collection 2026
          </p>

          <h1 className="mt-7 text-[2.75rem] leading-[1.04] tracking-tight text-balance sm:text-6xl lg:text-[4.25rem]">
            Considered pieces for the way you{" "}
            <em className="text-accent">actually</em> dress.
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-pretty text-ink-soft sm:text-lg">
            Velora Wears is a Pakistani label making oversized shirts, winter layers, trousers,
            essentials — honest fabrics, a fit cut properly rather than copied, and prices meant
            for clothes you wear every week. Ordered today, delivered to your door, paid in cash
            when it arrives.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to={PRODUCTS} className={buttonClasses()}>
              Shop the collection
            </Link>
            <Link
              to={categoryPath("winter-collection")}
              className={buttonClasses({ variant: "secondary" })}
            >
              Winter collection
            </Link>
          </div>

          <dl className="mt-14 grid max-w-lg grid-cols-3 gap-6 border-t border-line-strong/60 pt-8">
            {[
              { value: "12+", label: "Pieces in stock" },
              { value: "4.7", label: "Average rating" },
              { value: "2-4 days", label: "Nationwide delivery" },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="font-display text-2xl text-ink sm:text-3xl">{stat.value}</dt>
                <dd className="mt-2 text-[0.625rem] leading-relaxed tracking-eyebrow text-ink-muted uppercase">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative animate-rise">
          {/* Gold rule offset behind the image - the couture-label detail from section 1. */}
          <div
            aria-hidden="true"
            className="absolute -top-5 -right-5 bottom-10 left-10 rounded-sm border border-accent/45"
          />

          <Image
            src="/banners/hero.webp"
            alt="Velora Wears heavyweight hoodie in deep plum"
            width={1100}
            height={1375}
            eager
            className="relative aspect-4/5 w-full rounded-sm object-cover shadow-lift"
          />

          {/* The floating review card that used to sit here was cut on client
              feedback, 2026-08-29 — one testimonial pinned to the hero read as
              a canned pop-up rather than real social proof, and the same
              reviews already have a dedicated section further down the page
              (`Testimonials`), pulled from the actual review data rather than
              one hardcoded quote. */}
          <span className="absolute top-5 right-5 rounded-full bg-brand/90 px-4 py-2 text-[0.625rem] tracking-eyebrow text-canvas uppercase backdrop-blur-sm">
            Cash on delivery
          </span>
        </div>
      </Container>

      <Marquee items={promises} className="border-t border-line bg-brand py-4 text-canvas/85" />
    </section>
  );
}
