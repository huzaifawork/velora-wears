import type { ImgHTMLAttributes } from "react";

/**
 * The only `<img>` in the app (requirements section 19 — image optimisation).
 *
 * It exists to make the three rules that matter impossible to forget:
 *
 *  - `width`/`height` are REQUIRED, so the browser reserves the space and the
 *    page never shifts while an image loads;
 *  - everything is lazy-loaded and decoded off the main thread by default;
 *  - `eager` marks the few above-the-fold images (the hero) that should load
 *    immediately and at high priority instead.
 *
 * The catalog stores a `thumb` and a `full` variant of every image. Pass the
 * `thumb` in grids and cards; the `full` one belongs to the detail gallery.
 */
interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "loading" | "decoding"> {
  src: string;
  alt: string;
  /** Intrinsic pixel dimensions of the file being loaded. */
  width: number;
  height: number;
  /** Above the fold? Loads eagerly at high priority. Use sparingly. */
  eager?: boolean;
}

export function Image({ src, alt, width, height, eager = false, className = "", ...rest }: ImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding={eager ? "sync" : "async"}
      fetchPriority={eager ? "high" : "auto"}
      className={className}
      {...rest}
    />
  );
}
