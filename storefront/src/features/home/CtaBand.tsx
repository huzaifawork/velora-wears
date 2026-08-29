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
      <Container className="flex flex-col items-center gap-6 text-center">
        <p className="text-[0.625rem] tracking-eyebrow text-accent uppercase">
          Cash on delivery &middot; Nationwide
        </p>
        <h2 className="max-w-2xl text-3xl leading-tight text-balance sm:text-4xl">
          Find the piece you will actually wear this week.
        </h2>
        <p className="max-w-xl leading-relaxed text-pretty text-ink-soft">
          {threshold
            ? `Browse the full collection, pick your size, and pay in cash at your door. Delivery is free over ${formatPrice(threshold)}.`
            : "Browse the full collection, pick your size, and pay in cash at your door."}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
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
