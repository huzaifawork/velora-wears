import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import { Sidebar, SidebarFooter, Wordmark } from "@admin/components/layout/Sidebar";
import { MenuIcon } from "@admin/components/ui/Icons";
import { useAuth } from "@/features/account/AuthContext";
import { useQuery } from "@admin/hooks/useQuery";
import { DASHBOARD_STATS_KEY, getDashboardStats } from "@admin/services/dashboard";
import { useOrderAlerts } from "@admin/hooks/useOrderAlerts";
import { clearCache } from "@admin/lib/cache";
import { HOME } from "@/lib/routes";

/**
 * The shell every screen renders inside.
 *
 * Two layouts from one sidebar, which is the whole point of it being a
 * component: a permanent column from `lg` up, and a slide-over drawer below
 * that (requirements section 21). There is no second mobile navigation to keep
 * in step with the first.
 *
 * The drawer closes on navigation through the `onNavigate` handler the drawer
 * passes into `Sidebar` — every link in it calls that, including the account
 * block's, so there is one way out and nothing to forget.
 */
export function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  /**
   * Signing out of the dashboard is signing out of the shop — there is one
   * session — so it lands on the shop's home page rather than on a sign-in
   * form. Landing on the form would be technically correct and would read as
   * "you have been thrown out", which is not what pressing Sign out means.
   *
   * The dashboard's read cache is dropped first. It holds customer names,
   * phone numbers and addresses from the orders screen, and a shared machine
   * is exactly where a shop's dashboard gets used.
   */
  const onSignOut = async () => {
    clearCache();
    await signOut();
    navigate(HOME, { replace: true });
  };

  // The one shared read in the shell: the orders badge. It is the same cached
  // call the dashboard home makes, so opening the home screen costs nothing
  // extra and every other screen gets the badge for free.
  const stats = useQuery(DASHBOARD_STATS_KEY, ["orders", "products", "reviews"], getDashboardStats);
  const openOrders = stats.data?.orders.open;

  // New orders arriving while the dashboard is open (Supabase Realtime).
  useOrderAlerts();

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const footer = (
    <SidebarFooter email={user?.email ?? ""} onSignOut={() => void onSignOut()} />
  );

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* --- Permanent rail, lg and up ----------------------------------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar openOrders={openOrders} footer={footer} />
      </aside>

      {/* --- Drawer, below lg -------------------------------------------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 animate-fade bg-brand-deep/50 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-sheet shadow-raised">
            <Sidebar
              openOrders={openOrders}
              onNavigate={() => setDrawerOpen(false)}
              footer={
                <SidebarFooter
                  email={user?.email ?? ""}
                  onSignOut={() => void onSignOut()}
                  onNavigate={() => setDrawerOpen(false)}
                />
              }
            />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        {/* --- Mobile top bar. Sticky, because it is the only way back to
                navigation on a phone and a long table would strand it. --- */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-brand px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <MenuIcon />
          </button>
          <Wordmark />
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
