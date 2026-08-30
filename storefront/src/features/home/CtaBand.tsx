import { Link } from "react-router-dom";

import type { Settings } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";
import { PRODUCTS, categoryPath } from "@/lib/routes";
import { formatPrice } from "@/lib/format";

/**
 * The closing call to action (requirements section 2). The delivery line comes
 * from the admin-configured settings, so it never contradicts what checkout
 * charges (requirements section 10).
 */
export function CtaBand({ settings }: { settings: Settings | null | undefined }) {
  const threshold = settings?.freeDeliveryThreshold;

  return (
    <section className="border-y border-line bg-canvas-deep py-16 sm:py-20">
      {/* A split row on wide screens — copy left, actions in their own column
          on the right — rather than everything stacked and centered.
          Collapses to stacked-centered only on mobile, where a split reads
          cramped at this width. */}
      <Container className="flex flex-col items-center gap-8 text-center lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:text-left">
        <div className="max-w-xl">
          <p className="text-[0.625rem] tracking-eyebrow text-accent uppercase">
            Cash on delivery &middot; Nationwide
          </p>
          <h2 className="mt-4 text-3xl leading-tight text-balance sm:text-4xl">
            Find the piece you will actually wear this week.
          </h2>
          <p className="mt-4 leading-relaxed text-pretty text-ink-soft">
            {threshold
              ? `Browse the full collection, pick your size, and pay in cash at your door. Delivery is free over ${formatPrice(threshold)}.`
              : "Browse the full collection, pick your size, and pay in cash at your door."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-center gap-3 lg:flex-col lg:items-stretch">
          <Link to={PRODUCTS} className={buttonClasses({ size: "lg" })}>
            Start shopping
          </Link>
          <Link
            to={categoryPath("essentials")}
            className={buttonClasses({ variant: "secondary", size: "lg" })}
          >
            Browse essentials
          </Link>
        </div>
      </Container>
    </section>
  );
}
