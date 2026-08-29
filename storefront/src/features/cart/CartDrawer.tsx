import { Suspense, lazy, useEffect } from "react";
import { useLocation } from "react-router-dom";

import { useCart } from "@/features/cart/CartContext";

/**
 * The mini bag's host (requirements section 6).
 *
 * Tiny and always mounted, for two reasons.
 *
 * **It keeps the drawer out of the first load.** The panel pulls in the cart
 * lines, the quantity stepper and the summary, and most visits never open the
 * bag at all — so it is `lazy`, and the chunk downloads the first time someone
 * actually opens it (requirements section 19). The chunk is shared with the
 * cart page, so opening the bag and then going to `/cart` costs nothing more.
 *
 * **It owns "close on navigate".** That has to live in a component that is
 * mounted the whole time: an effect inside the panel would fire on the panel's
 * own mount and close the drawer in the same breath as it opened.
 */
const CartDrawerPanel = lazy(() =>
  import("@/features/cart/CartDrawerPanel").then((m) => ({ default: m.CartDrawerPanel })),
);

export function CartDrawer() {
  const { drawerOpen, closeDrawer } = useCart();
  const pathname = useLocation().pathname;

  // Following any link inside the drawer leaves the drawer behind. On the first
  // mount this closes an already-closed drawer, which costs nothing.
  useEffect(() => {
    closeDrawer();
    // Only on an actual navigation — `closeDrawer` never changes identity in a
    // way that matters here, and listing it would not change when this fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!drawerOpen) return null;

  // No fallback: the chunk is a few kB and a flash of an empty scrim would be
  // worse than the panel simply appearing.
  return (
    <Suspense fallback={null}>
      <CartDrawerPanel />
    </Suspense>
  );
}
