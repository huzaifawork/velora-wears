import { Link } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Brand holding page (requirements section 1).
 *
 * This establishes the brand voice - the logo, the display serif, the plum and
 * gold palette. The full landing page (hero, featured products, categories,
 * testimonials, CTAs) is built in requirements section 2 and replaces this.
 */
export function HomePage() {
  return (
    <Container className="flex flex-col items-center py-28 text-center sm:py-36">
      <Logo variant="stacked" className="text-ink" />

      <p className="mt-10 text-xs tracking-eyebrow text-accent uppercase">
        Premium fashion &middot; Made in Pakistan
      </p>

      <h1 className="mt-5 max-w-2xl text-4xl leading-[1.15] text-balance sm:text-6xl">
        Considered pieces for the way you actually dress.
      </h1>

      <p className="mt-6 max-w-prose leading-relaxed text-ink-soft">
        Velora Wears makes modern shirts, hoodies and everyday essentials — cut clean,
        finished properly, and priced to be worn rather than saved for later.
      </p>

      <div className="mt-10">
        <Link to="/products" className={buttonClasses({ size: "lg" })}>
          Shop the collection
        </Link>
      </div>
    </Container>
  );
}
