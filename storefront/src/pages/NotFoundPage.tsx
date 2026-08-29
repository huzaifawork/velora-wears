import { Link } from "react-router-dom";

import { Container } from "@/components/layout/Container";
import { Logo } from "@/components/brand/Logo";
import { buttonClasses } from "@/components/ui/Button";
import { CART, HOME, PRODUCTS } from "@/lib/routes";

/**
 * Catch-all page.
 *
 * Every route the storefront links to now exists, so this is once again what it
 * says it is: an address that does not match anything. It still carries the
 * "being built" framing because the store is not finished — reviews and the
 * order animation are still to come — and a mistyped URL is a better place to
 * offer the collection than to apologise at length.
 *
 * A product URL that does not match anything is NOT this page: the detail page
 * owns that state, because only it knows the difference between a mistyped slug
 * and a piece that has been retired.
 */
export function NotFoundPage() {
  return (
    <Container className="flex flex-col items-center py-28 text-center sm:py-36">
      <Logo variant="mark" className="text-ink" />
      <p className="mt-8 text-[0.625rem] tracking-eyebrow text-accent uppercase">Not found</p>
      <h1 className="mt-5 max-w-xl text-3xl leading-tight text-balance sm:text-4xl">
        We could not find that page.
      </h1>
      <p className="mt-5 max-w-prose leading-relaxed text-ink-soft">
        The link may be out of date, or the piece may have been retired. Your bag is saved on this
        device either way, so nothing you have added has been lost.
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
