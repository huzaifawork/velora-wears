import { Link } from "react-router-dom";

import { Container } from "@/components/layout/Container";
import { Logo } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Catch-all page.
 *
 * It also covers the routes that are specified but not built yet — product
 * details, the cart and checkout arrive in requirements sections 4, 6 and 7 —
 * so a link from the landing page lands somewhere deliberate instead of on a
 * blank screen.
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
        Individual product pages and checkout are on their way. In the meantime the full
        collection is ready to browse.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link to="/products" className={buttonClasses({ size: "lg" })}>
          Shop the collection
        </Link>
        <Link to="/" className={buttonClasses({ variant: "secondary", size: "lg" })}>
          Back to home
        </Link>
      </div>
    </Container>
  );
}
