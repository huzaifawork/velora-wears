import { Link } from "react-router-dom";

import { Container } from "@/components/layout/Container";

export interface Crumb {
  label: string;
  /** Omitted on the last crumb — the page you are already on. */
  to?: string;
}

/**
 * The trail above an inner page. Built here rather than inside the product
 * detail page because the category pages and the cart open the same way
 * (requirements sections 5 and 6), and because it is how a visitor who landed
 * on a product from a search engine gets back into the category (section 5).
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <div className="border-b border-line bg-canvas-alt">
      <Container>
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 py-4 text-[0.625rem] tracking-eyebrow uppercase">
            {items.map((item, i) => {
              const last = i === items.length - 1;
              return (
                <li key={`${item.label}-${i}`} className="flex items-center gap-2">
                  {item.to && !last ? (
                    <Link to={item.to} className="text-ink-muted transition hover:text-accent">
                      {item.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined} className="text-ink">
                      {item.label}
                    </span>
                  )}
                  {!last && (
                    <span aria-hidden="true" className="text-line-strong">
                      /
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </Container>
    </div>
  );
}
