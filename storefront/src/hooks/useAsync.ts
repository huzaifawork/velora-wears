import { useEffect, useState } from "react";

/**
 * The one place data loading is wired to React state (requirements section 18 —
 * repeated data-fetching logic belongs in a shared hook, not copied per page).
 *
 * Returns a loading flag so callers can render a skeleton rather than a blank
 * screen (section 19), and ignores the result of a stale request if the key
 * changes or the component unmounts.
 *
 * `key` identifies the request. It must contain EVERY input the loader depends
 * on — `products:hoodies:price-asc`, not `products` — because it is what
 * triggers a reload and what stamps the result. A key is used instead of a
 * dependency array so the reload condition is explicit and greppable, and it
 * lines up one-to-one with the cache keys in `lib/queries.ts`.
 *
 * `loading` is DERIVED, not stored: a result carries the key of the request that
 * produced it, and anything that does not match the current key is by definition
 * still in flight. That keeps the effect free of synchronous state updates —
 * which would otherwise cascade an extra render on every mount — and means a
 * change of key shows a skeleton immediately instead of briefly showing the
 * previous key's data.
 */
export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

interface Settled<T> {
  key: string;
  data?: T;
  error?: Error;
}

export function useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> {
  const [settled, setSettled] = useState<Settled<T>>();

  useEffect(() => {
    let live = true;

    load().then(
      (data) => {
        if (live) setSettled({ key, data });
      },
      (error: unknown) => {
        if (live) {
          setSettled({
            key,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      },
    );

    return () => {
      live = false;
    };
    // `load` is deliberately not a dependency: it is an inline closure that is
    // new on every render, and `key` already describes when a reload is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = settled?.key === key ? settled : undefined;

  return {
    data: current?.data,
    loading: current === undefined,
    error: current?.error,
  };
}
