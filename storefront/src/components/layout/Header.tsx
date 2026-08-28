import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { useAsync } from "@/hooks/useAsync";
import { getSettings } from "@/lib/queries";

/**
 * Site header. Carries the brand logo on every page (requirements section 1)
 * and the primary navigation, including a mobile menu (section 15 — mobile
 * navigation must work properly, not disappear on small screens).
 *
 * Search and the cart control arrive with requirements sections 13 and 6.
 */

/**
 * Every nav item points at the SAME path and differs only by `?category=`, so
 * the active one has to be decided on the query string. `NavLink` matches on
 * the path alone and would light all four at once on /products?category=shirts.
 */
const links: { to: string; label: string; category?: string }[] = [
  { to: "/products", label: "Shop all" },
  { to: "/products?category=shirts", label: "Shirts", category: "shirts" },
  { to: "/products?category=hoodies", label: "Hoodies", category: "hoodies" },
  { to: "/products?category=essentials", label: "Essentials", category: "essentials" },
];

const linkClasses = "text-xs font-medium tracking-eyebrow uppercase transition hover:text-accent";

export function Header() {
  const [open, setOpen] = useState(false);
  const [params] = useSearchParams();
  const isProducts = useLocation().pathname === "/products";

  // Undefined on every page that is not a category listing, which is exactly
  // what "Shop all" carries — so it is active on a bare /products and nowhere
  // else. `useSearchParams` also re-renders the header when the query changes.
  const currentCategory = params.get("category")?.trim() || undefined;

  // The announcement is admin-configurable (settings/public), cached by the
  // query layer, so this costs one read for the whole session.
  const { data: settings } = useAsync(() => getSettings(), "settings");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      {settings?.storeAnnouncement && (
        <p className="bg-brand px-4 py-2 text-center text-[0.625rem] tracking-eyebrow text-canvas/85 uppercase">
          {settings.storeAnnouncement}
        </p>
      )}

      <Container className="flex h-20 items-center justify-between gap-6">
        <Link
          to="/"
          onClick={() => setOpen(false)}
          className="shrink-0 text-ink transition hover:opacity-80"
          aria-label="Velora Wears — home"
        >
          <Logo />
        </Link>

        <nav className="hidden items-center gap-9 lg:flex" aria-label="Primary">
          {links.map((link) => {
            const active = isProducts && link.category === currentCategory;
            return (
              <Link
                key={link.label}
                to={link.to}
                aria-current={active ? "page" : undefined}
                className={`${linkClasses} ${active ? "text-accent" : "text-ink-soft"}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-canvas-alt lg:hidden"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </Container>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="border-t border-line bg-canvas lg:hidden"
        >
          <Container className="flex flex-col py-2">
            {links.map((link) => {
              const active = isProducts && link.category === currentCategory;
              return (
                <Link
                  key={link.label}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`${linkClasses} border-b border-line py-4 last:border-0 ${
                    active ? "text-accent" : "text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </Container>
        </nav>
      )}
    </header>
  );
}
