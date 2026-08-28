import { Link } from "react-router-dom";

import { Container } from "@/components/layout/Container";
import { Logo } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Catch-all page.
 *
 * It also covers the routes that are specified but not built yet — the products
 * grid, product details, cart and checkout arrive in requirements sections 3, 4,
 * 6 and 7 — so a link from the landing page lands somewhere deliberate instead
 * of on a blank screen.
 */
export function NotFoundPage() {
  return (
    <Container className="flex flex-col items-center py-28 text-center sm:py-36">
      <Logo variant="mark" className="text-ink" />
      <p className="mt-8 text-[0.625rem] tracking-eyebrow text-accent uppercase">Coming soon</p>
      <h1 className="mt-5 max-w-xl text-3xl leading-tight text-balance sm:text-4xl">
        This part of the store is still being built.
      </h1>
      <p className="mt-5 max-w-prose leading-relaxed text-ink-soft">
        The collection, product pages and checkout are on their way. In the meantime, everything
        that is ready lives on the home page.
      </p>
      <Link to="/" className={`${buttonClasses({ size: "lg" })} mt-9`}>
        Back to home
      </Link>
    </Container>
  );
}
