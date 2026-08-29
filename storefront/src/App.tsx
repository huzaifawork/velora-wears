import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";

import { Container } from "@/components/layout/Container";
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
const ProductDetailPage = lazy(() =>
  import("@/pages/ProductDetailPage").then((m) => ({ default: m.ProductDetailPage })),
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
  return (
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
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
