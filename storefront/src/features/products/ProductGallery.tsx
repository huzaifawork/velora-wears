import { useState } from "react";

import type { ProductImage } from "@shared/types";
import { Image } from "@/components/ui/Image";

/**
 * The product image gallery (requirements section 4 — multiple images, with a
 * thumbnail strip for viewing each one).
 *
 * Only the SELECTED image is ever in the DOM at full resolution. Stacking every
 * image and hiding all but one would download the whole set on load — they are
 * in the viewport, so `loading="lazy"` would not save anything — and section 19
 * asks for the first image eagerly and the rest only when they are needed. The
 * thumbnails are the small `thumb` variant, which the visitor has usually
 * already downloaded on the grid they arrived from.
 */

/**
 * Used when a record omits the intrinsic size. `Image` requires width and
 * height so space is reserved and the page cannot shift; the catalog writes
 * both, and this is the belt-and-braces default at the gallery's 3:4 crop.
 */
const FALLBACK_SIZE = { width: 1100, height: 1467 } as const;

export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
  const [selected, setSelected] = useState(0);

  if (images.length === 0) {
    return <div className="aspect-3/4 w-full rounded-sm bg-canvas-deep" aria-hidden="true" />;
  }

  // Clamped rather than trusted: the same component instance can be reused for
  // a different product with fewer images.
  const index = Math.min(selected, images.length - 1);
  const current = images[index];

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-sm bg-canvas-deep">
        <Image
          // Keyed on the file, so React swaps the element instead of mutating
          // src on the old one — which would otherwise keep the previous image
          // painted until the new one decodes.
          key={current.full}
          src={current.full}
          alt={current.alt ?? name}
          width={current.width ?? FALLBACK_SIZE.width}
          height={current.height ?? FALLBACK_SIZE.height}
          eager={index === 0}
          className="aspect-3/4 w-full object-cover"
        />
      </div>

      {images.length > 1 && (
        <ul className="grid grid-cols-4 gap-3 sm:gap-4">
          {images.map((image, i) => {
            const active = i === index;
            return (
              <li key={image.thumb}>
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  aria-current={active ? "true" : undefined}
                  className={`block w-full overflow-hidden rounded-sm bg-canvas-deep ring-offset-2 transition duration-300 ease-brand ${
                    active ? "ring-1 ring-ink" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <span className="sr-only">
                    View image {i + 1} of {images.length}
                  </span>
                  <Image
                    src={image.thumb}
                    alt=""
                    width={600}
                    height={800}
                    className="aspect-3/4 w-full object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
