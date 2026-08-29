import { NavLink } from "react-router-dom";
import type { ComponentType, ReactNode } from "react";

import * as routes from "@admin/lib/routes";
import {
  AccountIcon,
  CategoriesIcon,
  DashboardIcon,
  DeliveryIcon,
  ExternalIcon,
  FeaturedIcon,
  ImagesIcon,
  InventoryIcon,
  OrdersIcon,
  ProductsIcon,
  ReviewsIcon,
  SignOutIcon,
} from "@admin/components/ui/Icons";

/**
 * The navigation rail.
 *
 * ---------------------------------------------------------------------------
 * GROUPED, BECAUSE ELEVEN FLAT LINKS IS A LIST AND NOT A STRUCTURE
 * ---------------------------------------------------------------------------
 * The sections divide cleanly into three jobs an admin actually does:
 * everything about the CATALOG, everything about SELLING, and everything about
 * the SHOP WINDOW. Grouped that way, finding "featured products" is a question
 * of which job it belongs to rather than a scan down eleven labels — and the
 * groups are quiet (a small uppercase caption, no boxes), so they organise
 * without adding furniture.
 *
 * The badge slot on Orders is the one piece of live data in here: the number of
 * orders that still need something done to them. It comes from the same
 * dashboard statistics call the home screen makes, so it costs nothing extra.
 */

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Exact matching, for `/` — otherwise every route would mark it active. */
  end?: boolean;
  badge?: number;
}

export interface NavGroup {
  caption: string;
  items: NavItem[];
}

export function navGroups(openOrders?: number): NavGroup[] {
  return [
    {
      caption: "Overview",
      items: [{ to: routes.DASHBOARD, label: "Dashboard", icon: DashboardIcon, end: true }],
    },
    {
      caption: "Catalog",
      items: [
        { to: routes.PRODUCTS, label: "Products", icon: ProductsIcon },
        { to: routes.CATEGORIES, label: "Categories", icon: CategoriesIcon },
        { to: routes.INVENTORY, label: "Inventory", icon: InventoryIcon },
      ],
    },
    {
      caption: "Selling",
      items: [
        { to: routes.ORDERS, label: "Orders", icon: OrdersIcon, badge: openOrders },
        { to: routes.CUSTOMERS, label: "Customers", icon: AccountIcon },
        { to: routes.REVIEWS, label: "Reviews", icon: ReviewsIcon },
        { to: routes.DELIVERY, label: "Delivery & store", icon: DeliveryIcon },
      ],
    },
    {
      caption: "Shop window",
      items: [
        { to: routes.FEATURED, label: "Featured products", icon: FeaturedIcon },
        { to: routes.SITE_IMAGES, label: "Hero & banners", icon: ImagesIcon },
      ],
    },
  ];
}

export function Sidebar({
  openOrders,
  onNavigate,
  footer,
}: {
  openOrders?: number;
  /** Closes the drawer on a phone. Never passed on desktop. */
  onNavigate?: () => void;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-brand text-white/70">
      <div className="px-5 py-6">
        <Wordmark />
      </div>

      <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {navGroups(openOrders).map((group) => (
          <div key={group.caption}>
            <p className="px-3 pb-2 text-[0.625rem] font-medium tracking-[0.18em] text-white/35 uppercase">
              {group.caption}
            </p>

            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition duration-200 ease-brand ${
                        isActive
                          ? "bg-white/10 text-white"
                          : "text-white/65 hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* The gold marker is the one decorative flourish in the
                            rail, and it is doing real work: it is what makes the
                            active item findable at a glance on a dark column. */}
                        <span
                          aria-hidden="true"
                          className={`absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-opacity duration-200 ${
                            isActive ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        <item.icon className="h-[1.15rem] w-[1.15rem] shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[0.6875rem] leading-none font-medium text-brand tabular-nums">
                            {item.badge > 99 ? "99+" : item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">{footer}</div>
    </div>
  );
}

/**
 * The account block at the bottom of the rail — who is signed in, a link to the
 * account screen, the shop, and the way out.
 */
export function SidebarFooter({
  email,
  onSignOut,
  onNavigate,
}: {
  email: string;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  const row =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/65 transition hover:bg-white/5 hover:text-white";

  return (
    <div className="space-y-0.5">
      <NavLink
        to={routes.ACCOUNT}
        onClick={onNavigate}
        className={({ isActive }) => `${row} ${isActive ? "bg-white/10 text-white" : ""}`}
      >
        <AccountIcon className="h-[1.15rem] w-[1.15rem] shrink-0" />
        <span className="min-w-0 flex-1 truncate" title={email}>
          {email}
        </span>
      </NavLink>

      {/*
        An ordinary in-app link now, not a new tab to another deployment: the
        shop and the dashboard are one application, and the session goes with
        you. Sign out is below, and it signs you out of BOTH — because there
        was only ever one sign-in.
      */}
      <NavLink to={routes.shopHomeUrl()} onClick={onNavigate} className={row}>
        <ExternalIcon className="h-[1.15rem] w-[1.15rem] shrink-0" />
        <span>Back to the shop</span>
      </NavLink>

      <button type="button" onClick={onSignOut} className={row}>
        <SignOutIcon className="h-[1.15rem] w-[1.15rem] shrink-0" />
        <span>Sign out</span>
      </button>
    </div>
  );
}

/**
 * The wordmark. The storefront sets its own in wide-tracked Playfair; this is
 * the same treatment at dashboard scale, with "Store Manager" underneath so
 * a tab left open is identifiable as the admin tool and not the shop.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent font-display text-lg text-brand"
      >
        V
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block font-display text-base leading-tight tracking-[0.16em] text-white uppercase">
            Velora
          </span>
          <span className="block text-[0.625rem] tracking-[0.2em] text-white/45 uppercase">
            Store Manager
          </span>
        </span>
      )}
    </div>
  );
}
