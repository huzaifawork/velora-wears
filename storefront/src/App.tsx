import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";

import { Container } from "@/components/layout/Container";
import { AuthProvider } from "@/features/account/AuthProvider";
import { CartDrawer } from "@/features/cart/CartDrawer";
import { CartProvider } from "@/features/cart/CartProvider";
import { useCatalogRealtime } from "@/hooks/useCatalogRealtime";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Routes are code-split, so the first load ships only the page being viewed
 * (requirements section 19 — route-level code splitting). Vendor code is split
 * separately in vite.config.ts.
 */
const HomePage = lazy(() =>
  import("@/pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const ProductsPage = lazy(() =>
  import("@/pages/ProductsPage").then((m) => ({ default: m.ProductsPage })),
);
const CategoriesPage = lazy(() =>
  import("@/pages/CategoriesPage").then((m) => ({ default: m.CategoriesPage })),
);
const CartPage = lazy(() =>
  import("@/pages/CartPage").then((m) => ({ default: m.CartPage })),
);
const ProductDetailPage = lazy(() =>
  import("@/pages/ProductDetailPage").then((m) => ({ default: m.ProductDetailPage })),
);
const CheckoutPage = lazy(() =>
  import("@/pages/CheckoutPage").then((m) => ({ default: m.CheckoutPage })),
);
const OrderConfirmedPage = lazy(() =>
  import("@/pages/OrderConfirmedPage").then((m) => ({ default: m.OrderConfirmedPage })),
);
const AccountPage = lazy(() =>
  import("@/pages/AccountPage").then((m) => ({ default: m.AccountPage })),
);
const SignInPage = lazy(() =>
  import("@/pages/SignInPage").then((m) => ({ default: m.SignInPage })),
);
const SignUpPage = lazy(() =>
  import("@/pages/SignUpPage").then((m) => ({ default: m.SignUpPage })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

/** Shown only while a route chunk downloads — never a blank screen. */
function RouteFallback() {
  return (
    <Container className="flex flex-col gap-6 py-20">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-72 w-full" />
    </Container>
  );
}

export default function App() {
  /**
   * One Supabase Realtime subscription for the whole tab. When the catalog
   * changes in the database — an admin edits a price, someone buys the last
   * Medium — the read cache is dropped and the mounted pages re-read, so stock
   * badges, prices and the bag's total correct themselves without a refresh.
   * In demo mode it does nothing and the SDK is never downloaded.
   */
  useCatalogRealtime();

  return (
    /* The bag is the one piece of global client state in the app, and it
       wraps everything because the header badge, the drawer and the cart
       page all read the same one (requirements section 6). */
    <AuthProvider>
      <CartProvider>
        <div className="flex min-h-screen flex-col">
          <ScrollToTop />
          <Header />
          <main className="flex-1">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                {/* The category LISTING is /products?category=<slug> — the catalog
                    and a single category are the same page in two states, so there
                    is one canonical URL per category. See lib/routes.ts. */}
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/products/:slug" element={<ProductDetailPage />} />
                <Route path="/cart" element={<CartPage />} />
                {/* Checkout and its confirmation (requirements section 7). No
                    authentication guards either of them — guest checkout is
                    mandatory, so there is nothing here to be signed in for. */}
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/order/confirmed" element={<OrderConfirmedPage />} />
                {/* Optional customer accounts — the note added to section 12.
                    Nothing above this line requires being signed in. */}
                <Route path="/account" element={<AccountPage />} />
                <Route path="/account/sign-in" element={<SignInPage />} />
                <Route path="/account/sign-up" element={<SignUpPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </main>
          <Footer />

          {/* Outside <main> and rendered once: it is a sheet over the whole app,
              not part of any one page. */}
          <CartDrawer />
        </div>
      </CartProvider>
    </AuthProvider>
  );
}
