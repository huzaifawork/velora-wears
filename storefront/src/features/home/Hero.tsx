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
 * Used whenever the admin has uploaded nothing — the state this shop was in
 * before its first upload, and the state it falls back to if every uploaded
 * hero is deleted or hidden. See `Hero` below.
 */
const DEFAULT_IMAGE = {
  src: "/banners/hero.webp",
  alt: "Velora Wears heavyweight hoodie in deep plum",
  width: 1100,
  height: 1375,
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
 * Landing hero (requirements section 2) — a full-width banner.
 *
 * ---------------------------------------------------------------------------
 * THE IMAGE IS NEVER CROPPED. IT SETS THE HEIGHT.
 * ---------------------------------------------------------------------------
 * The photograph is rendered plainly: `width: 100%`, `height: auto`, in
 * normal flow. That is the whole trick, and it is worth stating because
 * several more elaborate attempts came before it and all of them were
 * wrong:
 *
 *   - a fixed `90vh` box with `object-cover` blew the photo up to fill a
 *     shape it did not share, cropping most of it away ("zoomed in");
 *   - `object-contain` in that same box stopped the cropping but left flat
 *     bars around the picture;
 *   - a blurred copy of the photo behind it filled those bars, but that is
 *     decoration covering for a box that was still the wrong shape;
 *   - giving the box the image's aspect ratio was the right idea but did
 *     it the hard way — absolutely-positioned layers inside a container
 *     sized by an inline ratio, which is a lot of machinery to reproduce
 *     what `height: auto` does on its own.
 *
 * So: no `object-fit` at all, no forced height, no aspect-ratio arithmetic.
 * The banner is exactly as tall as a full-width copy of the photograph,
 * every pixel of it visible, at every screen size. Whatever the admin
 * uploads — wide, square, tall — fits by construction.
 *
 * ---------------------------------------------------------------------------
 * THE COPY SITS UNDER THE PICTURE ON A PHONE AND ON IT FROM `lg`
 * ---------------------------------------------------------------------------
 * A full-width photograph on a narrow screen is only a few hundred pixels
 * tall — not enough to hold a headline and two buttons legibly over it. So
 * below `lg` the words are their own block underneath; from `lg` up, where
 * there is room, they lift onto the image as an overlay and it reads as a
 * banner. One element, positioned two ways, not two copies of the markup.
 *
 * ---------------------------------------------------------------------------
 * A CAROUSEL WHEN THE ADMIN HAS UPLOADED MORE THAN ONE SLIDE
 * ---------------------------------------------------------------------------
 * Every uploaded hero image is a full slide — its own photograph, eyebrow,
 * title, body and secondary call to action. With two or more the hero
 * advances every `SLIDE_MS`, and a row of dots lets a visitor jump to one
 * directly. Auto-advance is suspended under `prefers-reduced-motion`, the
 * same as every other animation here; the dots still work by hand.
 *
 * ---------------------------------------------------------------------------
 * A BLANK FIELD ON A REAL UPLOAD MEANS "NOTHING", NOT THE BOOTSTRAP COPY
 * ---------------------------------------------------------------------------
 * `DEFAULT_*` applies only when NOTHING has ever been uploaded. Once a real
 * photograph is up, a field left blank on that slide is omitted rather than
 * back-filled with the shop's own marketing line — otherwise a real
 * photograph ships with words nobody wrote for it.
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
  // synthetic slide — the bootstrap image — always at index 0.
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

  const image = {
    src: slide?.full ?? DEFAULT_IMAGE.src,
    alt: slide?.alt ?? DEFAULT_IMAGE.alt,
    width: slide?.width ?? DEFAULT_IMAGE.width,
    height: slide?.height ?? DEFAULT_IMAGE.height,
  };

  // See "A blank field..." above.
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
    <section className="relative isolate bg-ink">
      {/* `key` on the src so React swaps the element rather than mutating
          `src` in place — that's what lets each slide fade in as it
          arrives instead of the picture changing under a static frame. */}
      <Image
        key={image.src}
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        eager
        className="block h-auto w-full animate-fade"
      />

      {/* Only where the copy actually sits ON the photograph. Below `lg`
          the copy is its own block underneath, so darkening the picture
          there would dim it for nothing. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-linear-to-t from-ink via-ink/40 to-transparent lg:block"
      />

      <Container className="relative pt-10 pb-14 lg:absolute lg:inset-x-0 lg:bottom-0 lg:pt-0 lg:pb-16">
        {/* `key` restarts the rise-in on every slide change, so the words
            read as changing WITH the photograph. */}
        <div key={current} className="max-w-2xl animate-rise">
          {eyebrow && (
            <p className="flex items-center gap-3 text-[0.625rem] tracking-eyebrow text-accent-soft uppercase">
              <span aria-hidden="true" className="h-px w-10 bg-accent-soft" />
              {eyebrow}
            </p>
          )}

          {/* The page's one real `h1` still exists even when the current
              slide has no title — visually hidden rather than dropped, so
              the homepage keeps its heading landmark without printing text
              nobody asked for. */}
          {title ? (
            <h1
              className={`text-4xl leading-[1.05] tracking-tight text-balance text-canvas sm:text-5xl lg:text-6xl xl:text-7xl ${
                eyebrow ? "mt-5" : ""
              }`}
            >
              {title}
            </h1>
          ) : (
            <h1 className="sr-only">Velora Wears</h1>
          )}

          {body && (
            <p className="mt-5 max-w-lg text-base leading-relaxed text-pretty text-canvas/75">
              {body}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* The primary call to action is never taken away from the
                admin's control: "Shop the collection" is the one link this
                page must always offer, so an uploaded button becomes the
                SECOND one. Gold fill — against a photograph the accent is
                what reads instantly as "press this". */}
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
            In the flow under the copy on a phone; at the right-hand end of
            the overlay from `lg`. */}
        {uploaded.length > 1 && (
          <div className="mt-8 flex items-center gap-2 lg:absolute lg:right-8 lg:bottom-16 lg:mt-0">
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
