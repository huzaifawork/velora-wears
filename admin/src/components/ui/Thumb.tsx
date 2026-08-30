import { useState } from "react";

/**
 * The only `<img>` in the dashboard (requirements section 19 — image
 * optimisation), and it exists to make four rules impossible to forget:
 *
 *  1. **`width`/`height` are required**, so the browser reserves the space and
 *     a table does not jump as forty thumbnails arrive one by one.
 *  2. **Everything is lazy by default.** A product list is a page of images
 *     mostly below the fold; loading them eagerly is the single easiest way to
 *     make this dashboard feel slow.
 *  3. **A placeholder is shown while it loads**, not an empty box that snaps
 *     into an image.
 *  4. **A broken or missing image renders as a labelled placeholder**, never as
 *     the browser's torn-page icon. This matters more here than in the shop: a
 *     product with no image at all is a NORMAL state in an admin tool — it is
 *     what every product looks like for the thirty seconds between creating it
 *     and uploading a photograph — and it must not look like a bug.
 *
 * ALWAYS PASS THE `thumb` VARIANT HERE. `product_images` and `site_images` both
 * store a small and a large URL for exactly this reason; a grid that renders
 * `full_url` downloads a 1600px hero to draw a 44px cell.
 */
export function Thumb({
  src,
  alt,
  width,
  height,
  className = "",
  rounded = "rounded-lg",
}: {
  /** The THUMB url. Empty or undefined renders the placeholder. */
  src: string | undefined;
  alt: string;
  width: number;
  height: number;
  className?: string;
  rounded?: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">(
    src ? "loading" : "error",
  );

  // A changed `src` on the SAME element has to start over — otherwise a tile
  // that was showing the "no image" placeholder keeps showing it after an
  // upload gives it a URL, and one that failed once never retries. Adjusted
  // during render (React's documented pattern for state that follows a prop)
  // rather than in an effect, so there is no frame of the wrong image.
  const [lastSrc, setLastSrc] = useState(src);
  if (lastSrc !== src) {
    setLastSrc(src);
    setState(src ? "loading" : "error");
  }

  const frame = `relative overflow-hidden bg-surface-sunken ${rounded} ${className}`;

  if (!src || state === "error") {
    return (
      <div
        className={`${frame} flex items-center justify-center text-ink-muted`}
        role="img"
        aria-label={`${alt} — no image`}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-1/3 max-h-6 min-h-4 w-1/3 max-w-6 min-w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L16 17M15 14l1.6-1.6a2 2 0 0 1 2.8 0L21 14" />
        </svg>
      </div>
    );
  }

  return (
    <div className={frame}>
      {state === "loading" && (
        <div className="absolute inset-0 animate-pulse bg-line/70" aria-hidden="true" />
      )}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          state === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
