import { Link } from "react-router-dom";

import { Container } from "@/components/layout/Container";
import { Logo } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui/Button";
import { CART, HOME, PRODUCTS } from "@/lib/routes";

/**
 * Catch-all page.
 *
 * It also covers the routes that are specified but not built yet — the cart and
 * checkout arrive in requirements sections 6 and 7 — so a link from the landing
 * page lands somewhere deliberate instead of on a blank screen.
 *
 * A product URL that does not match anything is NOT this page: the detail page
 * owns that state, because only it knows the difference between a mistyped slug
 * and a piece that has been retired.
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
        Checkout is the next piece of work. Your bag is saved on this device in the meantime,
        so nothing you have added will be lost.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link to={PRODUCTS} className={buttonClasses({ size: "lg" })}>
          Shop the collection
        </Link>
        <Link to={CART} className={buttonClasses({ variant: "secondary", size: "lg" })}>
          View your bag
        </Link>
        <Link to={HOME} className={buttonClasses({ variant: "ghost", size: "lg" })}>
          Back to home
        </Link>
      </div>
    </Container>
  );
}
