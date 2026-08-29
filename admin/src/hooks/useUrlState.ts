import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Reading and writing a screen's filters as the URL's query string.
 *
 * Every list in this dashboard keeps its search, filters, sort and page in the
 * address bar rather than in component state. Three things follow, and all
 * three are behaviours an admin tool needs:
 *
 *   - the back button undoes a filter rather than leaving the screen;
 *   - opening a record and coming back returns to the same filtered page,
 *     because the page was never lost — it is in the URL;
 *   - "sold-out hoodies" is a link that can be sent to somebody.
 *
 * `set` takes a patch. `null` REMOVES a parameter, which is what keeps the URL
 * honest: a default is absent rather than spelled out, so `?sort=newest` never
 * appears and two URLs showing the same thing are the same string.
 *
 * It replaces rather than pushes, so typing into a search box does not put
 * eight entries in the browser's history for one word.
 */
export interface UrlState {
  set: (patch: Record<string, string | number | null>) => void;
}

export function useUrlState(): UrlState {
  const [params, setParams] = useSearchParams();

  const set = useCallback(
    (patch: Record<string, string | number | null>) => {
      const next = new URLSearchParams(params);

      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, String(value));
      }

      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  return useMemo(() => ({ set }), [set]);
}
