import type { ReactNode } from "react";

import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

/**
 * The band at the top of an inner page: the same eyebrow / serif title / copy
 * block the landing page uses, on the warm surface, with the page's `h1`.
 *
 * Built here rather than inside the products page because product details,
 * category pages, the cart and search results all open the same way
 * (requirements sections 4, 5, 6, 13) and must not each invent their own
 * header (section 18).
 *
 * `media` is how a category listing shows the category's own picture at the top
 * of the page (section 5) without a second, nearly identical header component
 * existing. With no media the markup is exactly what it was before.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  align = "left",
  media,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  /** An image for the page — a category's own art. Drops below the copy on a phone. */
  media?: ReactNode;
  /** Optional row under the heading — the category chips, counts, later the filters. */
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-line bg-canvas-alt">
      <Container className="py-14 sm:py-20">
        <div
          className={
            media ? "grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16" : ""
          }
        >
          <div className="min-w-0">
            <SectionHeading
              as="h1"
              eyebrow={eyebrow}
              title={title}
              description={description}
              align={align}
            />
            {children}
          </div>
          {media && <div className="order-first lg:order-last">{media}</div>}
        </div>
      </Container>
    </header>
  );
}
