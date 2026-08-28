import { Link, NavLink } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";

/**
 * Site header. Carries the brand logo on every page (requirements section 1).
 *
 * Navigation is deliberately minimal for now - the full shop navigation, search,
 * and cart controls arrive with their own requirement sections.
 */

const links = [
  { to: "/products", label: "Shop" },
  { to: "/products?category=shirts", label: "Shirts" },
  { to: "/products?category=hoodies", label: "Hoodies" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <Container className="flex h-20 items-center justify-between gap-6">
        <Link to="/" className="shrink-0 text-ink transition hover:opacity-80" aria-label="Velora Wears — home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-9 sm:flex" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              key={link.label}
              to={link.to}
              className={({ isActive }) =>
                `text-xs font-medium tracking-eyebrow uppercase transition hover:text-accent ${
                  isActive ? "text-accent" : "text-ink-soft"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </Container>
    </header>
  );
}
