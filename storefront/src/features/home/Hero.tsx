import { useState } from "react";
import { Link } from "react-router-dom";

import type { Settings, SiteImage } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { PRODUCTS, categoryPath } from "@/lib/routes";
import { Image } from "@/components/ui/Image";
import { Marquee } from "@/components/ui/Marquee";
import { formatPrice, formatRating } from "@/lib/format";

/**
 * The hero the shop ships with.
 *
 * Used whenever the admin has uploaded nothing — which is the state this shop
 * has been in since it launched, and the state it falls back to if every
 * uploaded hero is deleted or hidden. See `Hero` below.
 */
const DEFAULT_IMAGE = {
  src: "/banners/hero.webp",
  alt: "Velora Wears heavyweight hoodie in deep plum",
  width: 1100,
  height: 1375,
} as const;

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
 *
 * ---------------------------------------------------------------------------
 * THE IMAGE AND THE COPY CAN NOW COME FROM THE ADMIN DASHBOARD (section 8)
 * ---------------------------------------------------------------------------
 * `images` is whatever the admin has uploaded into the `hero` slot, and every
 * part of it is OPTIONAL. Nothing uploaded, or nothing active, and this section
 * renders exactly as it always has — the committed photograph and the copy
 * written below. Upload a photograph with no words and only the photograph
 * changes.
 *
 * That fallback is the whole design of this feature, not a defensive extra: the
 * hero is the first thing anyone sees, and a mistake in the dashboard has to
 * degrade to the shop's own art rather than to an empty rectangle.
 *
 * More than one active hero image gets a small thumbnail strip, so a brand can
 * put up a seasonal set. The images all arrive in the ONE request the landing
 * page already makes, so switching between them costs nothing and needs no
 * carousel library.
 *
 * ---------------------------------------------------------------------------
 * THE STATS ARE MEASURED, NOT WRITTEN
 * ---------------------------------------------------------------------------
 * This row used to read "12+ pieces in stock" and "4.7 average rating" as
 * literal strings. Both were invented, both were rendered to customers as
 * facts about the shop, and neither would have become true when the catalog
 * moved to the database — the numbers were in the markup, not in the data.
 *
 * They are now computed from the catalog the page has already loaded (`stats`),
 * which costs no extra request. **A figure with nothing real behind it is not
 * shown at all**: a shop with no reviews yet renders two stats rather than
 * claiming a rating it has not earned. That is the whole rule here — an empty
 * shop should look new, not dishonest.
 */

export interface HeroStats {
  /** Products in the catalog. Undefined while loading, 0 for an empty shop. */
  pieces?: number;
  /** Mean rating across rated products. Undefined when nothing is rated yet. */
  rating?: number;
}
export function Hero({
  settings,
  images,
  stats,
}: {
  settings: Settings | null | undefined;
  /** Admin-uploaded hero images, in display order. Empty is normal. */
  images?: SiteImage[];
  /** Measured from the catalog. Anything absent is simply not claimed. */
  stats?: HeroStats;
}) {
  const threshold = settings?.freeDeliveryThreshold;

  const uploaded = images ?? [];
  const [shownIndex, setShownIndex] = useState(0);
  // Clamped rather than reset in an effect: the list can shrink underneath this
  // when Realtime delivers a deletion, and an out-of-range index would blank the
  // image for a frame.
  const shown = uploaded[Math.min(shownIndex, uploaded.length - 1)];

  const image = {
    src: shown?.full ?? DEFAULT_IMAGE.src,
    alt: shown?.alt ?? DEFAULT_IMAGE.alt,
    width: shown?.width ?? DEFAULT_IMAGE.width,
    height: shown?.height ?? DEFAULT_IMAGE.height,
  };

  // Built from what is actually true. The delivery promise is a service
  // commitment rather than a measurement, so it is the one entry that is still
  // written here — and it is a promise the shop makes, not a number it reports.
  const facts: Array<{ value: string; label: string }> = [];

  if (stats?.pieces) {
    facts.push({
      value: String(stats.pieces),
      label: stats.pieces === 1 ? "Piece in the collection" : "Pieces in the collection",
    });
  }

  if (stats?.rating) {
    facts.push({ value: formatRating(stats.rating), label: "Average rating" });
  }

  facts.push({ value: "2-4 days", label: "Nationwide delivery" });

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
            {shown?.eyebrow ?? "Autumn collection 2026"}
          </p>

          <h1 className="mt-7 text-[2.75rem] leading-[1.04] tracking-tight text-balance sm:text-6xl lg:text-[4.25rem]">
            {shown?.title ?? (
              <>
                Considered pieces for the way you{" "}
                <em className="text-accent">actually</em> dress.
              </>
            )}
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-pretty text-ink-soft sm:text-lg">
            {shown?.body ??
              "Velora Wears is a Pakistani label making oversized shirts, winter layers, trousers, essentials — honest fabrics, a fit cut properly rather than copied, and prices meant for clothes you wear every week. Ordered today, delivered to your door, paid in cash when it arrives."}
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            {/* The primary call to action is never taken away from the admin's
                control: "Shop the collection" is the one link this page must
                always offer, so an uploaded button becomes the SECOND one. */}
            <Link to={PRODUCTS} className={buttonClasses()}>
              Shop the collection
            </Link>

            {shown?.ctaLabel && shown.ctaHref ? (
              <HeroCta label={shown.ctaLabel} href={shown.ctaHref} />
            ) : (
              <Link
                to={categoryPath("winter-collection")}
                className={buttonClasses({ variant: "secondary" })}
              >
                Winter collection
              </Link>
            )}
          </div>

          {/* The column count follows how many facts there are, so two stats sit
              as two columns rather than leaving a gap where a third claim used
              to be. */}
          <dl
            className={`mt-14 grid max-w-lg gap-6 border-t border-line-strong/60 pt-8 ${
              facts.length === 3 ? "grid-cols-3" : facts.length === 2 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {facts.map((stat) => (
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
            key={image.src}
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            eager
            className="relative aspect-4/5 w-full rounded-sm object-cover shadow-lift"
          />

          {/* A second and further hero image, if the shop has uploaded any.
              Every one of these URLs came back in the request that drew this
              page, so switching is instant and costs no round trip. The small
              `thumb` variant is what loads here — never the full-size file. */}
          {uploaded.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {uploaded.map((option, index) => {
                const current = index === Math.min(shownIndex, uploaded.length - 1);

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setShownIndex(index)}
                    aria-label={option.alt ?? `Hero image ${index + 1}`}
                    aria-current={current}
                    className={`h-16 w-14 overflow-hidden rounded-sm border transition duration-200 ease-brand ${
                      current
                        ? "border-accent opacity-100"
                        : "border-line-strong opacity-60 hover:opacity-100"
                    }`}
                  >
                    <Image
                      src={option.thumb}
                      alt=""
                      width={640}
                      height={800}
                      className="h-full w-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}

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

/**
 * The admin's own call to action.
 *
 * An in-app path goes through react-router so it does not reload the page; a
 * full URL is a real anchor, opened in a new tab and marked `noreferrer`,
 * because it leaves the shop. Deciding that here rather than storing a "type"
 * on the record means an admin only ever has to type where they want it to go.
 */
function HeroCta({ label, href }: { label: string; href: string }) {
  const internal = href.startsWith("/");

  return internal ? (
    <Link to={href} className={buttonClasses({ variant: "secondary" })}>
      {label}
    </Link>
  ) : (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={buttonClasses({ variant: "secondary" })}
    >
      {label}
    </a>
  );
}
