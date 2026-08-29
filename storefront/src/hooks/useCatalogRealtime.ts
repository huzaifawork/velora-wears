import { useEffect } from "react";

import { clearCatalogCache, isLiveSource } from "@/lib/queries";

/**
 * Keeps the open tab in step with the database (Supabase Realtime).
 *
 * Postgres publishes every row change and the Realtime server streams it to
 * subscribed browsers over a WebSocket. When the catalog changes — an admin
 * edits a price, someone else buys the last Medium — the response cache in
 * `queries.ts` is dropped and the mounted pages re-read. So a stock badge, a
 * price and the bag's total correct themselves without a refresh, which is the
 * thing a plain request/response client cannot do.
 *
 * It is deliberately a BLUNT invalidation rather than a per-row patch. The
 * catalog is small, the reads are cached and bounded, and trying to splice an
 * updated row into whatever pages happen to be mounted would mean a second copy
 * of the filtering and sorting rules that could disagree with the first. Drop
 * the cache, let the existing read path run again.
 *
 * It is also the ONLY place the app subscribes. One channel for the whole tab,
 * mounted once at the root, rather than a subscription per component.
 *
 * In demo mode this does nothing at all: there is no database to watch, and the
 * Supabase SDK is never downloaded.
 */
export function useCatalogRealtime(onChange?: () => void): void {
  useEffect(() => {
    // Checked BEFORE the dynamic import, and that ordering is the point: the
    // Supabase SDK is ~57 kB gzipped, and awaiting it first would download it on
    // every page load in demo mode, where there is nothing to subscribe to
    // (requirements section 19). `isLiveSource` is a static import from
    // `queries.ts`, which is in the main bundle already, so it costs nothing.
    if (!isLiveSource()) return;

    let cancelled = false;
    let teardown: (() => void) | undefined;

    void (async () => {
      const { getSupabase, hasSupabaseConfig } = await import("@/lib/supabase");

      if (!hasSupabaseConfig() || cancelled) return;

      const supabase = getSupabase();

      const invalidate = () => {
        clearCatalogCache();
        onChange?.();
      };

      const channel = supabase
        .channel("catalog")
        .on("postgres_changes", { event: "*", schema: "public", table: "products" }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "product_sizes" }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "product_images" }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "reviews" }, invalidate)
        .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, invalidate)
        .subscribe();

      teardown = () => void supabase.removeChannel(channel);
      if (cancelled) teardown();
    })();

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [onChange]);
}
