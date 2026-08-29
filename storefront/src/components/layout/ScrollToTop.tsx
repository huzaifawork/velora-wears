import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Sends every navigation to the top of the new page.
 *
 * A single-page app does not reset the scroll position the way a browser does
 * on a real page load, so following "Shop all" from the footer would otherwise
 * open the products page already scrolled halfway down it.
 *
 * The jump is explicitly instant: `html` carries `scroll-behavior: smooth` for
 * in-page anchors, and inheriting that here would animate the whole page length
 * on every route change.
 *
 * `search` is in the dependencies because `/products?category=hoodies` is a
 * different page to `/products` even though the path has not changed. A `hash`
 * link is left alone — the browser is already scrolling to that element.
 *
 * `location.state.preserveScroll` is the one opt-out. Toggling a filter or a
 * sort on the products page (section 14) changes `search` exactly the same
 * way following a category link does, but the visitor is refining a grid they
 * are already partway down, not arriving somewhere new — jumping them to the
 * top on every checkbox click reads as the page reloading under them. The
 * callers that mean it (`ProductFilters`, the in-stock toggle) pass that flag
 * through `setSearchParams`'s own `state` option; a real navigation — a
 * category link, a fresh search — carries no state and scrolls up as before.
 */
export function ScrollToTop() {
  const { pathname, search, hash, state } = useLocation();
  const preserveScroll = Boolean((state as { preserveScroll?: boolean } | null)?.preserveScroll);

  useEffect(() => {
    if (hash || preserveScroll) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, search, hash, preserveScroll]);

  return null;
}
