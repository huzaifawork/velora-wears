import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { CartButton } from "@/features/cart/CartButton";
import { useAsync } from "@/hooks/useAsync";
import { getCategories, getSettings } from "@/lib/queries";
import { CATEGORIES, PRODUCTS, categoryPath } from "@/lib/routes";

/**
 * Site header. Carries the brand logo on every page (requirements section 1)
 * and the primary navigation, including a mobile menu (section 15 — mobile
 * navigation must work properly, not disappear on small screens).
 *
 * The category links are BUILT FROM THE DATA, not hardcoded (requirements
 * section 5). They used to be three literal slugs, which meant a category the
 * admin creates in the dashboard would never appear in the navigation, and one
 * they retire would go on linking to a page with nothing on it. The categories
 * node is small and cached by the query layer, so this costs one read for the
 * whole session — the same read the page below is already making.
 *
 * Search and the cart control arrive with requirements sections 13 and 6.
 */

/**
 * How many categories fit across the desktop bar before it looks crowded.
 * Anything beyond this is reachable through the "Categories" link, which is
 * always present — that is what the /categories index is for.
 */
const NAV_CATEGORIES = 4;

interface NavItem {
  to: string;
  label: string;
  /** The category this link browses; undefined on the collection-wide links. */
  category?: string;
  /** Matched on the path alone, ignoring the query string — used by "Categories". */
  exactPath?: string;
}

const linkClasses = "text-xs font-medium tracking-eyebrow uppercase transition hover:text-accent";

export function Header() {
  const [open, setOpen] = useState(false);
  const [params] = useSearchParams();
  const pathname = useLocation().pathname;
  const isProducts = pathname === PRODUCTS;

  // Undefined on every page that is not a category listing, which is exactly
  // what "Shop all" carries — so it is active on a bare /products and nowhere
  // else. `useSearchParams` also re-renders the header when the query changes.
  const currentCategory = params.get("category")?.trim() || undefined;

  // Both of these are admin-configurable and cached by the query layer, so they
  // cost one read each for the whole session.
  const { data: settings } = useAsync(() => getSettings(), "settings");
  const { data: categories, loading: categoriesLoading } = useAsync(
    () => getCategories(),
    "categories",
  );

  const links: NavItem[] = [
    { to: PRODUCTS, label: "Shop all" },
    ...(categories ?? []).slice(0, NAV_CATEGORIES).map((category) => ({
      to: categoryPath(category.slug),
      label: category.name,
      category: category.slug,
    })),
    { to: CATEGORIES, label: "Categories", exactPath: CATEGORIES },
  ];

  /**
   * Every category link points at the SAME path and differs only by
   * `?category=`, so the active one has to be decided on the query string —
   * `NavLink` matches on the path alone and would light all of them at once on
   * /products?category=shirts. "Categories" is the one link with a path of its
   * own, so it opts out with `exactPath`.
   */
  const isActive = (link: NavItem) =>
    link.exactPath
      ? pathname === link.exactPath
      : isProducts && link.category === currentCategory;

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
            const active = isActive(link);
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
          {/* Holds the bar's width while the categories land, so the links that
              are already rendered do not slide sideways underneath the cursor. */}
          {categoriesLoading &&
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-3 w-16" />)}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <CartButton />

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
        </div>
      </Container>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="border-t border-line bg-canvas lg:hidden"
        >
          <Container className="flex flex-col py-2">
            {links.map((link) => {
              const active = isActive(link);
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
