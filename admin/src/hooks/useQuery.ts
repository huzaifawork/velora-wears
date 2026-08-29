import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { cacheVersion, cached, subscribeToCache, type CacheTag } from "@admin/lib/cache";

/**
 * The ONE place data loading is wired to React state (requirements section 18
 * — repeated fetching logic belongs in a shared hook, not copied per page).
 *
 * Modelled on the storefront's `useAsync`, with two additions the dashboard
 * needs and the shop does not:
 *
 *  1. **It reads through the cache** (`lib/cache.ts`), so navigating back to a
 *     list is instant rather than a second skeleton.
 *  2. **It re-reads when a write invalidates its tags.** The cache's version
 *     counter is subscribed through `useSyncExternalStore` and folded into the
 *     effect key, so saving a product in a modal refreshes the list behind it
 *     without the two components being wired to each other.
 *
 * `key` must name EVERY input the loader depends on — `products:hoodies:2`,
 * not `products` — because it is both the cache entry and the reload trigger.
 *
 * `loading` is DERIVED rather than stored, exactly as in `useAsync`: a settled
 * result carries the key that produced it, so anything that does not match the
 * current key is by definition still in flight. Changing the key shows a
 * skeleton immediately instead of briefly showing the previous key's data.
 */

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  /**
   * Runs the read again. This is the "try again" behind every error state —
   * and it works without any cache-busting of its own because a FAILED read is
   * never cached (`lib/cache.ts` deletes the entry on rejection), so the next
   * attempt always reaches the database. To force a re-read of a SUCCESSFUL
   * one, invalidate its tag instead; that is what every write already does.
   */
  refetch: () => void;
}

interface Settled<T> {
  key: string;
  data?: T;
  error?: Error;
}

export function useQuery<T>(
  key: string,
  tags: readonly CacheTag[],
  load: () => Promise<T>,
): QueryState<T> {
  const version = useSyncExternalStore(subscribeToCache, cacheVersion, cacheVersion);
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>();

  // The identity a result is stamped with. It has to include the cache version
  // and the manual retry counter, or a re-read would resolve with a key that
  // already matches and never clear the previous data.
  const stamp = `${key}#${version}#${attempt}`;

  useEffect(() => {
    let live = true;

    cached(key, tags, load).then(
      (data) => {
        if (live) setSettled({ key: stamp, data });
      },
      (error: unknown) => {
        if (live) {
          setSettled({
            key: stamp,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );

    return () => {
      live = false;
    };
    // `load` and `tags` are inline values that are new on every render; `stamp`
    // already describes exactly when a reload is needed. Same reasoning as the
    // storefront's `useAsync`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  const current = settled?.key === stamp ? settled : undefined;

  return {
    data: current?.data,
    loading: current === undefined,
    error: current?.error,
    refetch,
  };
}
