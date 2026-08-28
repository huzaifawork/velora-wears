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
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  align = "left",
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  /** Optional row under the heading — breadcrumbs, counts, later the filters. */
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-line bg-canvas-alt">
      <Container className="py-14 sm:py-20">
        <SectionHeading
          as="h1"
          eyebrow={eyebrow}
          title={title}
          description={description}
          align={align}
        />
        {children}
      </Container>
    </header>
  );
}
