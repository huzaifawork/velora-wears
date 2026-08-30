import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { Settings, SiteImage } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { PRODUCTS, categoryPath } from "@/lib/routes";
import { Image } from "@/components/ui/Image";
import { Marquee } from "@/components/ui/Marquee";
import { formatPrice } from "@/lib/format";

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
  width: 1200,
  height: 1500,
} as const;

const DEFAULT_EYEBROW = "Autumn collection 2026";
const DEFAULT_TITLE = (
  <>
    Considered pieces for the way you <em className="text-accent-soft">actually</em> dress.
  </>
);
const DEFAULT_BODY =
  "A Pakistani label making oversized shirts, winter layers, trousers, essentials — honest fabrics, a fit cut properly rather than copied. Ordered today, delivered to your door, paid in cash when it arrives.";

/** How long each slide holds before advancing. */
const SLIDE_MS = 6000;

/**
 * Landing hero (requirements section 2): a full-bleed photograph with the
 * brand statement and calls to action set directly over it — a banner, not a
 * boxed picture beside a column of text.
 *
 * ---------------------------------------------------------------------------
 * A CAROUSEL WHEN THE ADMIN HAS UPLOADED MORE THAN ONE SLIDE
 * ---------------------------------------------------------------------------
 * Every uploaded hero image is a full slide — its own photograph, eyebrow,
 * title, body and secondary call to action, not just an alternate picture
 * behind the same words. With two or more, the hero auto-advances every
 * `SLIDE_MS`, crossfading rather than cutting, and a row of dots underneath
 * lets a visitor jump to one directly or just shows where they are with one
 * slide. Auto-advance is suspended for `prefers-reduced-motion`, same as
 * every other animation in this project (see `storefront/src/index.css`) —
 * the dots still work by hand.
 *
 * The hero image is the page's largest paint, so the FIRST slide's image is
 * the one loaded eagerly at high priority (section 19); the rest load only
 * once the visitor actually reaches them (they're already cached by the same
 * request that drew this page, so "loading" here means the browser decoding
 * an image it already has — the `Image` component's default lazy behaviour
 * is exactly right for that).
 *
 * ---------------------------------------------------------------------------
 * THE IMAGE AND THE COPY CAN NOW COME FROM THE ADMIN DASHBOARD (section 8)
 * ---------------------------------------------------------------------------
 * `images` is whatever the admin has uploaded into the `hero` slot, and every
 * part of it is OPTIONAL. Nothing uploaded, or nothing active, and this
 * section renders exactly as it always has — the committed photograph and
 * the copy written below. Upload a photograph with no words and only the
 * photograph changes.
 *
 * ---------------------------------------------------------------------------
 * A BLANK FIELD ON A REAL UPLOAD MEANS "NOTHING", NOT "SHOW THE BOOTSTRAP COPY"
 * ---------------------------------------------------------------------------
 * `DEFAULT_EYEBROW`/`DEFAULT_TITLE`/`DEFAULT_BODY` only apply when NOTHING
 * has ever been uploaded (`uploaded.length === 0`) — the shop's own
 * bootstrap content. Once an admin uploads a real photograph, a field left
 * blank on THAT slide is omitted, never silently replaced with the
 * bootstrap copy — otherwise a real photograph would ship with someone
 * else's invented marketing line stitched over it.
 */
export function Hero({
  settings,
  images,
}: {
  settings: Settings | null | undefined;
  /** Admin-uploaded hero images, in display order. Empty is normal. */
  images?: SiteImage[];
}) {
  const threshold = settings?.freeDeliveryThreshold;

  const uploaded = images ?? [];
  const hasUpload = uploaded.length > 0;
  const [index, setIndex] = useState(0);
  // Clamped rather than reset in an effect: the list can shrink underneath
  // this when Realtime delivers a deletion, and an out-of-range index would
  // blank the slide for a frame. With nothing uploaded there is exactly one
  // synthetic slide (the bootstrap image below), always at index 0.
  const current = hasUpload ? Math.min(index, uploaded.length - 1) : 0;
  const slide = uploaded[current];

  useEffect(() => {
    if (uploaded.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % uploaded.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [uploaded.length]);

  // See "A blank field..." above: the bootstrap copy is a fallback for NO
  // upload, not a per-slide default for an upload that left a field blank.
  const eyebrow = hasUpload ? slide?.eyebrow : DEFAULT_EYEBROW;
  const title = hasUpload ? slide?.title : DEFAULT_TITLE;
  const body = hasUpload ? slide?.body : DEFAULT_BODY;

  const promises = [
    "Cash on delivery",
    threshold ? `Free delivery over ${formatPrice(threshold)}` : "Nationwide delivery",
    "Delivered in 2-4 days",
    "7-day size exchange",
    "Made in Pakistan",
  ];

  return (
    <section className="relative isolate overflow-hidden bg-ink">
      {/* Every slide's photograph is stacked and crossfaded by opacity —
          simpler and smoother than mounting/unmounting, and it means the
          NEXT slide's image is already decoded before it needs to be seen. */}
      {(hasUpload ? uploaded : [null]).map((option, i) => {
        const src = option?.full ?? DEFAULT_IMAGE.src;
        const alt = option?.alt ?? DEFAULT_IMAGE.alt;
        const w = option?.width ?? DEFAULT_IMAGE.width;
        const h = option?.height ?? DEFAULT_IMAGE.height;

        return (
          <Image
            key={option?.id ?? "default"}
            src={src}
            alt={alt}
            width={w}
            height={h}
            eager={i === 0}
            // `object-contain`, not `object-cover`: this banner's shape
            // changes a lot between a tall phone screen and a wide desktop
            // window, and no single crop of a fixed photograph can fill
            // both without cutting a very different part of it away each
            // time -- which is exactly what read as "zoomed in." Containing
            // shows the WHOLE uploaded photograph on every screen, full
            // stop; the dark ground (`bg-ink` on the section, the scrim
            // below) is what's behind it on wider or narrower screens where
            // the photo's own aspect ratio doesn't fill every edge.
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-1000 ease-brand ${
              i === current ? "opacity-100" : "opacity-0"
            }`}
          />
        );
      })}

      {/* Bottom-up scrim so the overlaid copy stays legible over ANY
          uploaded photograph, not just the ones dark enough at the bottom
          on their own. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-ink via-ink/35 to-ink/5"
      />

      <Container className="relative flex min-h-[86vh] flex-col justify-end pt-32 pb-16 sm:min-h-[90vh] sm:pb-20 lg:pb-24">
        {/* `key` restarts the rise-in animation on every slide change, which
            reads as the copy changing WITH the photograph rather than a
            static caption sitting over a background that happens to move. */}
        <div key={current} className="max-w-2xl animate-rise">
          {eyebrow && (
            <p className="flex items-center gap-3 text-[0.625rem] tracking-eyebrow text-accent-soft uppercase">
              <span aria-hidden="true" className="h-px w-10 bg-accent-soft" />
              {eyebrow}
            </p>
          )}

          {/* The page's one real `h1` still exists even when the current
              slide has no title — visually hidden rather than removed, so
              the homepage keeps a heading landmark, without printing text
              nobody asked for. */}
          {title ? (
            <h1
              className={`text-5xl leading-[1.02] tracking-tight text-balance text-canvas sm:text-7xl lg:text-[5.5rem] ${eyebrow ? "mt-6" : ""}`}
            >
              {title}
            </h1>
          ) : (
            <h1 className="sr-only">Velora Wears</h1>
          )}

          {body && (
            <p className="mt-6 max-w-lg text-base leading-relaxed text-pretty text-canvas/75 sm:text-lg">
              {body}
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-3">
            {/* The primary call to action is never taken away from the
                admin's control: "Shop the collection" is the one link this
                page must always offer, so an uploaded button becomes the
                SECOND one. Gold fill, not the plum default — against a
                photograph, the accent is what reads instantly as "press
                this". */}
            <Link to={PRODUCTS} className={buttonClasses({ variant: "accent", size: "lg" })}>
              Shop the collection
            </Link>

            {slide?.ctaLabel && slide.ctaHref ? (
              <HeroCta label={slide.ctaLabel} href={slide.ctaHref} />
            ) : (
              <Link
                to={categoryPath("winter-collection")}
                className={buttonClasses({ variant: "secondary", size: "lg" })}
              >
                Winter collection
              </Link>
            )}
          </div>
        </div>

        {/* Slide dots — only when there is more than one to choose between.
            A click both jumps the slide and restarts the auto-advance timer
            (the effect above re-runs from `SLIDE_MS` because `index` isn't
            one of its dependencies — it always counts from the last change,
            manual or automatic). */}
        {uploaded.length > 1 && (
          <div className="mt-10 flex items-center gap-2 sm:absolute sm:right-8 sm:bottom-8 sm:mt-0 lg:right-12 lg:bottom-12">
            {uploaded.map((option, i) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={option.alt ?? `Slide ${i + 1}`}
                aria-current={i === current}
                className={`h-1.5 rounded-full transition-all duration-300 ease-brand ${
                  i === current ? "w-8 bg-accent" : "w-4 bg-canvas/40 hover:bg-canvas/70"
                }`}
              />
            ))}
          </div>
        )}
      </Container>

      <Marquee
        items={promises}
        className="relative border-t border-canvas/10 bg-brand py-4 text-canvas/85"
      />
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
    <Link to={href} className={buttonClasses({ variant: "secondary", size: "lg" })}>
      {label}
    </Link>
  ) : (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={buttonClasses({ variant: "secondary", size: "lg" })}
    >
      {label}
    </a>
  );
}
