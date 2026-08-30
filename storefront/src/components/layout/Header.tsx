import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { AccountMenu, AccountMobileLink } from "@/features/account/AccountMenu";
import { CartButton } from "@/features/cart/CartButton";
import { SearchBar } from "@/features/products/SearchBar";
import { useAsync } from "@/hooks/useAsync";
import { getCategories, getSettings } from "@/lib/queries";
import { CATEGORIES, PRODUCTS, categoryPath, searchPath } from "@/lib/routes";

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
 * Search (requirements section 13) is a toggled row rather than a field in the
 * bar itself: the bar already carries the logo, five links and the bag, and a
 * permanently open input would squeeze the navigation on a laptop. The row is
 * the same `SearchBar` the products page uses, and submitting it navigates to
 * the products page with `?q=` — search results are a STATE of that page, not a
 * page of their own, which is what lets them be filtered and sorted.
 *
 * `AccountMenu` (optional customer accounts, the note added to section 12) is
 * the last icon before the bag — sign in when signed out, the account page
 * when signed in. `AccountMobileLink` is the same state as a row in the phone
 * menu, since the icon carries no label there.
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

const linkClasses =
  "group relative shrink-0 py-2 text-xs font-medium tracking-eyebrow whitespace-nowrap uppercase transition hover:text-accent";

/** The same accent-underline-grows-on-hover motif `ProductCard` uses on its
 *  price, so the header's interaction language matches the rest of the site
 *  instead of introducing a new one. Always full-width when active. */
function NavUnderline({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute -bottom-0.5 left-0 h-px bg-accent transition-all duration-300 ease-brand ${
        active ? "w-full" : "w-0 group-hover:w-full"
      }`}
    />
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
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

  /** Submitting from the header always lands on a fresh search, never inside
   *  whatever category the visitor happened to be looking at. */
  const runSearch = (term: string) => {
    setSearchOpen(false);
    setOpen(false);
    navigate(term ? searchPath(term) : PRODUCTS);
  };

  const currentSearch = isProducts ? (params.get("q")?.trim() ?? "") : "";

  // The mobile drawer covers the page, so background scroll is locked while
  // it's open — same reasoning, same pattern, as the admin dashboard's own
  // drawer (`AdminLayout`).
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    // Solid, not translucent (client feedback, 2026-08-29): a blurred
    // semi-opaque header let whatever was scrolled underneath — the hero's
    // colour washes especially — tint it unevenly, which read as the header
    // not properly covering the page. A flat `bg-canvas` cannot do that.
    <header className="sticky top-0 z-40 border-b border-line bg-canvas shadow-card">
      {settings?.storeAnnouncement && (
        <p className="bg-brand px-4 py-2 text-center text-[0.625rem] tracking-eyebrow text-canvas/85 uppercase">
          {settings.storeAnnouncement}
        </p>
      )}

      {/*
        Logo and primary nav are clustered together on the left with a
        deliberate — not equal — gap between them, and the icon cluster sits
        alone on the far right (`ml-auto` below). An evenly-split 3-zone bar
        (logo | nav | icons) reads as symmetric/generic even though nothing
        in it is literally centered; this left-heavy weighting is what most
        premium boutique headers actually do, and it is what makes the bar
        read as a considered layout rather than a template default.
      */}
      <Container wide className="flex h-24 items-center gap-10">
        <Link
          to="/"
          onClick={() => setOpen(false)}
          className="shrink-0 text-ink transition hover:opacity-80"
          aria-label="Velora Wears — home"
        >
          {/* Below 375px the full wordmark plus the four header icons no longer
              fit on one row (requirements section 15) — the monogram alone
              carries the brand at that width instead of forcing a horizontal
              scroll or pushing the menu button off-screen. */}
          <span className="min-[375px]:hidden">
            <Logo variant="mark" size="lg" />
          </span>
          <span className="hidden min-[375px]:inline-flex">
            <Logo size="lg" />
          </span>
        </Link>

        {/* `xl`, not `lg`: six labels — two of them two words — need more room
            than 1024px gives even after the width and gap fixes above
            (client feedback, 2026-08-29). Below 1280px the hamburger menu
            covers it instead, same as it always has below `lg`. */}
        <nav className="hidden items-center gap-8 xl:flex" aria-label="Primary">
          {links.map((link) => {
            const active = isActive(link);
            return (
              <Link
                key={link.label}
                to={link.to}
                aria-current={active ? "page" : undefined}
                className={`${linkClasses} ${active ? "text-ink" : "text-ink-soft"}`}
              >
                {link.label}
                <NavUnderline active={active} />
              </Link>
            );
          })}
          {/* Holds the bar's width while the categories land, so the links that
              are already rendered do not slide sideways underneath the cursor. */}
          {categoriesLoading &&
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-3 w-16" />)}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-expanded={searchOpen}
            aria-controls="header-search"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-canvas-alt"
          >
            <span className="sr-only">{searchOpen ? "Close search" : "Search products"}</span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              {searchOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <>
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M16 16l4 4" />
                </>
              )}
            </svg>
          </button>

          <AccountMenu />
          <CartButton />

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-canvas-alt xl:hidden"
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

      {searchOpen && (
        <div id="header-search" className="border-t border-line bg-canvas-alt">
          <Container className="py-4">
            <SearchBar value={currentSearch} onSearch={runSearch} />
          </Container>
        </div>
      )}

      {/*
        A slide-over drawer, not a block that pushes the page down (what this
        was before) — presented as an overlay so it reads as intentionally
        designed for a phone rather than a shrunk desktop menu. Same links,
        same data, same destinations; only how it's presented changed. Always
        mounted so both the open and close transitions animate; `inert` when
        closed keeps it out of the tab order and out of the way of clicks.
      */}
      <div
        className={`fixed inset-0 z-50 xl:hidden ${open ? "" : "pointer-events-none"}`}
        inert={!open}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-ink/45 transition-opacity duration-300 ease-brand ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className={`absolute inset-y-0 right-0 flex w-full max-w-xs flex-col bg-canvas shadow-lift transition-transform duration-300 ease-brand ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-5">
            <Logo variant="mark" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-canvas-alt"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col overflow-y-auto px-5 py-2">
            {links.map((link) => {
              const active = isActive(link);
              return (
                <Link
                  key={link.label}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`border-b border-line py-4 text-xs font-medium tracking-eyebrow uppercase transition last:border-0 hover:text-accent ${
                    active ? "text-accent" : "text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <AccountMobileLink onNavigate={() => setOpen(false)} />
          </div>
        </nav>
      </div>
    </header>
  );
}
