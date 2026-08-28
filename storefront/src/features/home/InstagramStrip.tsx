import type { ProductSummary } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { Image } from "@/components/ui/Image";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The "as seen on Instagram" strip (requirements section 2 — the brand is an
 * Instagram-led label, and this is the section its customers expect).
 *
 * It reuses the catalog thumbs already loaded for the featured grid rather than
 * pulling a second set of images, so the section costs nothing extra to render
 * (section 19). When the brand's real feed is available this becomes the only
 * component that changes.
 *
 * NOTE FOR HUZAIFA: the handle below is a placeholder — swap it for the brand's
 * real Instagram before the client sees the finished site.
 */

const HANDLE = "velorawears";
const PROFILE_URL = `https://instagram.com/${HANDLE}`;
const TILE_IMAGE = { width: 600, height: 800 } as const;

function InstagramIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zM16.9 7.1h.01M4.5 8A3.5 3.5 0 0 1 8 4.5h8A3.5 3.5 0 0 1 19.5 8v8a3.5 3.5 0 0 1-3.5 3.5H8A3.5 3.5 0 0 1 4.5 16z" />
    </svg>
  );
}

export function InstagramStrip({
  products,
  loading,
}: {
  products: ProductSummary[] | undefined;
  loading: boolean;
}) {
  const tiles = (products ?? []).slice(0, 6);

  if (!loading && tiles.length === 0) return null;

  return (
    <section className="bg-canvas-alt py-20 sm:py-28">
      <Container>
        <SectionHeading
          align="center"
          eyebrow="On the feed"
          title={
            <a
              href={PROFILE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="transition hover:text-accent"
            >
              @{HANDLE}
            </a>
          }
          description="Fits, drops and restock announcements — the collection as our customers wear it."
        />

        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="aspect-square w-full" />
              ))
            : tiles.map((product) => (
                <a
                  key={product.id}
                  href={PROFILE_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group relative isolate overflow-hidden rounded-sm bg-canvas-deep"
                >
                  <Image
                    src={product.thumb}
                    alt={`${product.name} on the Velora Wears Instagram feed`}
                    width={TILE_IMAGE.width}
                    height={TILE_IMAGE.height}
                    className="aspect-square w-full object-cover transition duration-700 ease-brand group-hover:scale-[1.08]"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center bg-ink/55 opacity-0 transition duration-300 group-hover:opacity-100"
                  >
                    <InstagramIcon className="h-6 w-6 text-canvas" />
                  </div>
                </a>
              ))}
        </div>
      </Container>
    </section>
  );
}
