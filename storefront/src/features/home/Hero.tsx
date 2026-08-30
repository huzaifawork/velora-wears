import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { Settings, SiteImage } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { buttonClasses, type ButtonVariant } from "@/components/ui/Button";
import { PRODUCTS, categoryPath } from "@/lib/routes";
import { Image } from "@/components/ui/Image";
import { Marquee } from "@/components/ui/Marquee";
import { formatPrice } from "@/lib/format";

/** One slide of the hero, whether it came from an upload or from the defaults. */
interface Slide {
  key: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  eyebrow?: ReactNode;
  title?: ReactNode;
  body?: ReactNode;
  ctaLabel?: string;
  ctaHref?: string;
  cta2Label?: string;
  cta2Href?: string;
}

/**
 * The hero the shop ships with.
 *
 * Used whenever the admin has uploaded nothing — the state this shop was in
 * before its first upload, and the state it falls back to if every uploaded
 * hero is deleted or hidden. See `Hero` below.
 */
const DEFAULT_SLIDE: Slide = {
  key: "default",
  src: "/banners/hero.webp",
  alt: "Velora Wears heavyweight hoodie in deep plum",
  width: 1100,
  height: 1375,
  eyebrow: "Autumn collection 2026",
  title: (
    <>
      Considered pieces for the way you <em className="text-accent-soft">actually</em> dress.
    </>
  ),
  body: "A Pakistani label making oversized shirts, winter layers, trousers, essentials — honest fabrics, a fit cut properly rather than copied. Ordered today, delivered to your door, paid in cash when it arrives.",
};

/** How long each slide holds before advancing. */
const SLIDE_MS = 6000;

/** A swipe shorter than this is a tap that wandered, not a gesture. */
const SWIPE_PX = 50;

/**
 * Landing hero (requirements section 2) — a full-bleed banner carousel.
 *
 * ---------------------------------------------------------------------------
 * THE BANNER FILLS THE SCREEN. THE PHOTOGRAPH DECIDES HOW TALL IT IS.
 * ---------------------------------------------------------------------------
 * This is the shape every clothing storefront uses: one edge-to-edge picture
 * holding most of the first screen, the words over it, the next slide fading
 * in behind them. Getting there took a few wrong turns worth recording:
 *
 *   - a FIXED tall box with `object-cover` fills the screen but crops a
 *     portrait upload down to a strip of itself ("zoomed in");
 *   - `object-contain` in that box, or a blurred copy of the photo behind it,
 *     stops the cropping and leaves bars — decoration covering for a box that
 *     is the wrong shape;
 *   - no box at all (`w-full`, `height:auto`) shows the whole file but makes a
 *     4:5 portrait TALLER THAN THE VIEWPORT on a desktop, so the visitor again
 *     sees only a magnified slice.
 *
 * So the height is answered differently on the two shapes of screen.
 *
 * ON A PHONE the banner is simply THE SCREEN: `100svh` minus the header, so
 * the picture is the whole of the first view and the page begins under it.
 * `svh` (not `vh`) because a phone's toolbars make `100vh` taller than the
 * screen actually is, which would push the buttons under the address bar. The
 * `max(26rem, …)` floor is for a phone held sideways, where the screen is too
 * short to hold the copy at all. A picture in this box is cropped by
 * `object-cover` to the extent its shape differs from the phone's — a portrait
 * photograph loses roughly a third of its width, a wide banner much more, so
 * a banner meant for phones should be exported tall.
 *
 * FROM `lg` the height is neither fixed nor free — it is the height the
 * CURRENT photograph wants at full width, clamped to what the screen holds:
 *
 *     height: clamp(32rem, 100vw / ratio, 100svh - 6rem)
 *
 * A wide banner (the shape this slot is designed for, and what the reference
 * storefronts upload) lands INSIDE that range, so on a desktop it is shown
 * complete, edge to edge, uncropped, filling the screen — no bars, no crop,
 * nothing hidden. A portrait photograph overshoots, clamps to the fold and is
 * cropped from the centre rather than being allowed to push the whole page
 * down. The admin's own upload decides which of the two applies.
 *
 * ---------------------------------------------------------------------------
 * THE COPY SITS OVER THE PICTURE, LEFT, JUST ABOVE THE MIDDLE
 * ---------------------------------------------------------------------------
 * Left-aligned and vertically centred with a little padding underneath, which
 * lifts it above the centre line — copy centred exactly between two edges
 * reads as sitting slightly low. Same position on a phone as on a desktop; a
 * scrim under it carries the contrast (bottom-up on a phone, left-weighted
 * from `lg`), so the words stay legible over a photograph nobody vetted.
 *
 * ---------------------------------------------------------------------------
 * THE CAROUSEL
 * ---------------------------------------------------------------------------
 * Every uploaded hero image is a full slide — its own photograph, eyebrow,
 * title, body and secondary call to action. With two or more, slides
 * cross-fade every `SLIDE_MS`; dots, arrows (from `lg`) and a horizontal
 * swipe all jump straight to one, and any of them restarts the clock so the
 * banner does not advance out from under someone who just chose a slide.
 * Auto-advance is suspended under `prefers-reduced-motion`, the same as every
 * other animation here; the controls still work by hand.
 *
 * Every slide is in the DOM so the fade has something to fade to, but only the
 * first is `eager` — the rest arrive at normal priority behind the one that
 * is actually on screen.
 *
 * ---------------------------------------------------------------------------
 * A BLANK FIELD ON A REAL UPLOAD MEANS "NOTHING", NOT THE BOOTSTRAP COPY
 * ---------------------------------------------------------------------------
 * `DEFAULT_SLIDE` applies only when NOTHING has ever been uploaded. Once a
 * real photograph is up, a field left blank on that slide is omitted rather
 * than back-filled with the shop's own marketing line — otherwise a real
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
  const slides: Slide[] = uploaded.length
    ? uploaded.map((image) => ({
        key: image.id,
        src: image.full,
        alt: image.alt ?? "",
        width: image.width ?? DEFAULT_SLIDE.width,
        height: image.height ?? DEFAULT_SLIDE.height,
        eyebrow: image.eyebrow,
        title: image.title,
        body: image.body,
        ctaLabel: image.ctaLabel,
        ctaHref: image.ctaHref,
        cta2Label: image.cta2Label,
        cta2Href: image.cta2Href,
      }))
    : [DEFAULT_SLIDE];

  const [index, setIndex] = useState(0);
  // Clamped rather than reset in an effect: the list can shrink underneath
  // this when Realtime delivers a deletion, and an out-of-range index would
  // blank the slide for a frame.
  const current = Math.min(index, slides.length - 1);
  const slide = slides[current];

  // `current` is a dependency so that choosing a slide by hand restarts the
  // full interval rather than inheriting whatever was left of the last one.
  useEffect(() => {
    if (slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [slides.length, current]);

  const go = (delta: number) =>
    setIndex((i) => (i + delta + slides.length) % slides.length);

  // Horizontal swipe, without a gesture library: a banner that does not answer
  // a thumb-drag reads as broken on a phone, and this is the whole of it.
  const swipeFrom = useRef<number | null>(null);

  // See the height explanation in the block comment above. Guarded because a
  // record written before the uploader stored dimensions would otherwise put
  // `Infinity` or `NaN` into the calc and collapse the banner.
  const ratio =
    slide.width > 0 && slide.height > 0 ? slide.width / slide.height : 16 / 9;

  /*
    BOTH BUTTONS BELONG TO THE ADMIN.

    A slide that carries its own call to action gets the GOLD one — the button
    a visitor's eye lands on. Whoever typed "Shop the winter drop" on that
    slide meant it to be the thing pressed, and a hard-coded link out-ranking
    it would make the dashboard field decorative. The second field fills the
    outlined button beside it.

    What each one falls back to when the slide leaves it blank is chosen so the
    banner is never a dead end: "Shop the collection" is the one link this page
    cannot be published without, so it takes whichever slot the admin has not
    claimed, and only when the admin has claimed neither does the winter
    category fill the second.
  */
  const shopAll = { label: "Shop the collection", href: PRODUCTS };
  const ownPrimary = Boolean(slide.ctaLabel && slide.ctaHref);

  const primary = ownPrimary
    ? { label: slide.ctaLabel!, href: slide.ctaHref! }
    : shopAll;

  const secondary =
    slide.cta2Label && slide.cta2Href
      ? { label: slide.cta2Label, href: slide.cta2Href }
      : ownPrimary
        ? shopAll
        : { label: "Winter collection", href: categoryPath("winter-collection") };

  const promises = [
    "Cash on delivery",
    threshold ? `Free delivery over ${formatPrice(threshold)}` : "Nationwide delivery",
    "Delivered in 2-4 days",
    "7-day size exchange",
    "Made in Pakistan",
  ];

  return (
    <section className="relative isolate bg-ink text-canvas">
      <div
        style={{ "--hero-ratio": ratio } as React.CSSProperties}
        onTouchStart={(event) => {
          swipeFrom.current = event.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const from = swipeFrom.current;
          swipeFrom.current = null;
          if (from === null || slides.length < 2) return;
          const dx = (event.changedTouches[0]?.clientX ?? from) - from;
          if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? 1 : -1);
        }}
        className="relative isolate h-[max(26rem,calc(100svh_-_6rem))] w-full overflow-hidden transition-[height] duration-500 ease-brand lg:h-[clamp(32rem,calc(100vw/var(--hero-ratio)),calc(100svh_-_6rem))]"
      >
        {slides.map((option, i) => (
          <Image
            key={option.key}
            src={option.src}
            alt={i === current ? option.alt : ""}
            width={option.width}
            height={option.height}
            eager={i === 0}
            aria-hidden={i === current ? undefined : "true"}
            className={`absolute inset-0 h-full w-full object-cover object-[50%_35%] transition-opacity duration-700 ease-brand ${
              i === current ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}

        {/* The contrast under the words. Bottom-up on a phone, where the copy
            sits over the lower half of a portrait crop; left-weighted from
            `lg`, where it sits in the left third and the picture should stay
            visible on the right. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-t from-ink via-ink/60 to-ink/15 lg:hidden"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 hidden bg-linear-to-r from-ink/90 via-ink/45 to-transparent lg:block"
        />

        {/* THE COPY — left, and lifted just above the centre line by the
            padding underneath it. */}
        <Container
          wide
          className="pointer-events-none absolute inset-0 flex flex-col justify-center pb-16 lg:pb-20"
        >
          {/* `key` restarts the rise-in on every slide change, so the words
              read as changing WITH the photograph. */}
          <div key={current} className="pointer-events-auto max-w-xl animate-rise">
            {slide.eyebrow && (
              <p className="flex items-center gap-3 text-[0.625rem] tracking-eyebrow text-accent-soft uppercase">
                <span aria-hidden="true" className="h-px w-10 bg-accent-soft" />
                {slide.eyebrow}
              </p>
            )}

            {/* The page's one real `h1` still exists even when the current
                slide has no title — visually hidden rather than dropped, so
                the homepage keeps its heading landmark without printing text
                nobody asked for. */}
            {slide.title ? (
              <h1
                className={`text-[2.125rem] leading-[1.06] tracking-tight text-balance text-canvas drop-shadow-[0_2px_18px_rgb(20_18_26_/_0.55)] sm:text-5xl lg:text-[3.25rem] xl:text-6xl ${
                  slide.eyebrow ? "mt-4 sm:mt-5" : ""
                }`}
              >
                {slide.title}
              </h1>
            ) : (
              <h1 className="sr-only">Velora Wears</h1>
            )}

            {slide.body && (
              <p className="mt-4 max-w-lg text-[0.9375rem] leading-relaxed text-pretty text-canvas/80 sm:mt-5 sm:text-base">
                {slide.body}
              </p>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3 sm:mt-8">
              <HeroCta {...primary} variant="accent" />
              <HeroCta {...secondary} variant="onDark" />
            </div>
          </div>
        </Container>

        {slides.length > 1 && (
          <>
            {/* Dots, on the same gutter as the copy above them. */}
            <Container wide className="absolute inset-x-0 bottom-7 lg:bottom-9">
              <div className="flex items-center gap-2">
                {slides.map((option, i) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={option.alt || `Slide ${i + 1}`}
                    aria-current={i === current}
                    className={`h-1.5 rounded-full transition-all duration-300 ease-brand ${
                      i === current ? "w-10 bg-accent" : "w-4 bg-canvas/40 hover:bg-canvas/70"
                    }`}
                  />
                ))}
              </div>
            </Container>

            {/* Arrows only where there is a cursor to hover them with. On a
                phone the swipe and the dots do this job. */}
            <HeroArrow direction="previous" onClick={() => go(-1)} />
            <HeroArrow direction="next" onClick={() => go(1)} />
          </>
        )}
      </div>

      <Marquee
        items={promises}
        className="relative border-t border-canvas/10 bg-brand py-4 text-canvas/85"
      />
    </section>
  );
}

/** One of the carousel's two side arrows. */
function HeroArrow({
  direction,
  onClick,
}: {
  direction: "previous" | "next";
  onClick: () => void;
}) {
  const next = direction === "next";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={next ? "Next slide" : "Previous slide"}
      className={`absolute top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-canvas/30 bg-ink/25 text-canvas backdrop-blur-sm transition duration-200 ease-brand hover:border-canvas/60 hover:bg-ink/45 lg:flex ${
        next ? "right-6" : "left-6"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={next ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} />
      </svg>
    </button>
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
function HeroCta({
  label,
  href,
  variant,
}: {
  label: string;
  href: string;
  variant: ButtonVariant;
}) {
  const internal = href.startsWith("/");
  const className = buttonClasses({ variant, size: "lg" });

  return internal ? (
    <Link to={href} className={className}>
      {label}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {label}
    </a>
  );
}
