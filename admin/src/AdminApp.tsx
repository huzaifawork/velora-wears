import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AdminLayout } from "@admin/components/layout/AdminLayout";
import { Spinner } from "@admin/components/ui/Button";
import { ToastProvider } from "@admin/components/ui/Toast";
import { NotAnAdminPage } from "@admin/features/auth/NotAnAdminPage";
import { clearCache } from "@admin/lib/cache";
import { useAuth } from "@/features/account/AuthContext";
import { SIGN_IN } from "@/lib/routes";

/**
 * The admin dashboard, mounted at `/admin` inside the storefront application
 * (requirements section 8).
 *
 * ---------------------------------------------------------------------------
 * IT HAS NO SIGN-IN OF ITS OWN — DELIBERATELY
 * ---------------------------------------------------------------------------
 * There is ONE sign-in form in this project, and it is the shop's
 * (`/account/sign-in`). An administrator is not a different kind of login; they
 * are a customer account whose id happens to appear in the `admins` table.
 * So this component never asks for credentials. It asks THREE questions of the
 * session that already exists, in order, and each has exactly one right answer:
 *
 *   1. Is anyone signed in? No → send them to the one sign-in form, carrying
 *      `?next=` so they come straight back here afterwards.
 *   2. Are they an administrator? The answer comes from `is_admin()` — the same
 *      SECURITY DEFINER function every row-level-security policy in the schema
 *      calls, so what this renders and what the database permits cannot
 *      disagree. No → `NotAnAdminPage`, which explains rather than 404s.
 *   3. Yes → the dashboard.
 *
 * ---------------------------------------------------------------------------
 * THIS GUARD IS NOT THE SECURITY. IT IS THE COURTESY.
 * ---------------------------------------------------------------------------
 * Anyone can edit their own JavaScript and render whatever they like. What they
 * cannot edit is a row level security policy: a person who defeated this
 * component would reach screens where every read returns zero rows and every
 * write is refused, because `is_admin()` is evaluated by Postgres and not by
 * this file (requirements section 25). The guard exists so that the people who
 * are meant to be here are told what is going on, and everyone else is turned
 * around politely.
 *
 * Every screen is lazily imported, so a customer who never visits `/admin`
 * downloads none of it.
 */

const DashboardPage = lazy(() =>
  import("@admin/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ProductsPage = lazy(() =>
  import("@admin/pages/ProductsPage").then((m) => ({ default: m.ProductsPage })),
);
const ProductEditorPage = lazy(() =>
  import("@admin/pages/ProductEditorPage").then((m) => ({ default: m.ProductEditorPage })),
);
const CategoriesPage = lazy(() =>
  import("@admin/pages/CategoriesPage").then((m) => ({ default: m.CategoriesPage })),
);
const OrdersPage = lazy(() =>
  import("@admin/pages/OrdersPage").then((m) => ({ default: m.OrdersPage })),
);
const OrderDetailPage = lazy(() =>
  import("@admin/pages/OrderDetailPage").then((m) => ({ default: m.OrderDetailPage })),
);
const CustomersPage = lazy(() =>
  import("@admin/pages/CustomersPage").then((m) => ({ default: m.CustomersPage })),
);
const InventoryPage = lazy(() =>
  import("@admin/pages/InventoryPage").then((m) => ({ default: m.InventoryPage })),
);
const FeaturedPage = lazy(() =>
  import("@admin/pages/FeaturedPage").then((m) => ({ default: m.FeaturedPage })),
);
const SiteImagesPage = lazy(() =>
  import("@admin/pages/SiteImagesPage").then((m) => ({ default: m.SiteImagesPage })),
);
const ReviewsPage = lazy(() =>
  import("@admin/pages/ReviewsPage").then((m) => ({ default: m.ReviewsPage })),
);
const DeliveryPage = lazy(() =>
  import("@admin/pages/DeliveryPage").then((m) => ({ default: m.DeliveryPage })),
);
const AccountPage = lazy(() =>
  import("@admin/pages/AccountPage").then((m) => ({ default: m.AccountPage })),
);
const NotFoundPage = lazy(() =>
  import("@admin/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

/** Shown only while a screen's chunk downloads — never a blank page. */
function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-ink-muted">
      <Spinner className="text-lg" />
    </div>
  );
}

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand text-white/60">
      <Spinner className="text-2xl" />
    </div>
  );
}

export function AdminApp() {
  const { status, isAdmin } = useAuth();
  const location = useLocation();

  /*
   * Nothing cached survives losing the session — including a sign-out that
   * happened on the SHOP side of the application, which this covers and a
   * handler on the dashboard's own button could not. The cache holds customer
   * names, phone numbers and addresses read from the orders screen.
   */
  const signedIn = status === "signed-in";
  useEffect(() => {
    if (!signedIn) clearCache();
  }, [signedIn]);

  // Two different "not yet known"s, and both have to wait. The session may
  // still be resolving, OR it may have resolved and the admin check may still
  // be in flight — rendering `NotAnAdminPage` during the second would flash an
  // accusation at a legitimate administrator every time they open the dashboard.
  if (status === "loading" || (status === "signed-in" && isAdmin === undefined)) {
    return <FullPageSpinner />;
  }

  if (status !== "signed-in") {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`${SIGN_IN}?next=${next}`} replace />;
  }

  if (!isAdmin) return <NotAnAdminPage />;

  return (
    /*
     * The dashboard's toasts are its own. They report the outcome of admin
     * actions — "Saved", "Order marked shipped" — and belong to this subtree
     * rather than to the shop, which has no use for them.
     */
    <ToastProvider>
      <Suspense fallback={<RouteFallback />}>
        {/* Paths are RELATIVE: this whole tree is mounted under `/admin/*`, and
            react-router resolves them against that. The absolute versions in
            `@admin/lib/routes` are what every `<Link>` uses. */}
        <Routes>
          <Route element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />

            <Route path="products" element={<ProductsPage />} />
            {/* `new` before `:id`, or "new" would be read as a product id. */}
            <Route path="products/new" element={<ProductEditorPage />} />
            <Route path="products/:id" element={<ProductEditorPage />} />

            <Route path="categories" element={<CategoriesPage />} />
            <Route path="inventory" element={<InventoryPage />} />

            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="customers" element={<CustomersPage />} />

            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="delivery" element={<DeliveryPage />} />

            <Route path="featured" element={<FeaturedPage />} />
            <Route path="site-images" element={<SiteImagesPage />} />

            <Route path="account" element={<AccountPage />} />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ToastProvider>
  );
}
