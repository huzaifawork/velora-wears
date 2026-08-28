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
 */
export function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, search, hash]);

  return null;
}
