/**
 * The dashboard's read cache and its invalidation bus.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * Requirements section 19, and section 26 of the dashboard brief: "when an
 * administrator opens a section such as Products or Orders, they should not
 * experience unnecessary waiting." A PostgREST request is a plain HTTP call
 * with no client-side cache of its own, so without this, walking Products →
 * Orders → Products refetches a list that has not changed, and every one of
 * those refetches is a visible skeleton.
 *
 * It is deliberately about 60 lines rather than a query library. The
 * dashboard has perhaps a dozen distinct reads and one writer (the admin
 * sitting in front of it), so the hard parts a real cache library solves —
 * background refetching, request deduplication across windows, optimistic
 * rollback trees — are not problems this application has.
 *
 * ---------------------------------------------------------------------------
 * TAGS, NOT KEYS, ARE WHAT WRITES INVALIDATE
 * ---------------------------------------------------------------------------
 * A product list is cached under a key naming every filter it was read with
 * (`products:hoodies:newest:1`) — there are many such keys and a write cannot
 * know which ones exist. So each entry also declares what it is ABOUT, and a
 * write says what it changed:
 *
 *     cached("products:hoodies:newest:1", ["products"], load)
 *     ...
 *     await updateProduct(...); invalidate("products");
 *
 * Every entry tagged `products` is dropped and every mounted `useQuery` on one
 * re-reads. Editing stock invalidates `products` too, because the product list
 * shows a stock column — the tag is the SUBJECT, not the table.
 *
 * In-flight promises are cached as well, so two components mounting at the
 * same moment share one request rather than racing two.
 */

export type CacheTag =
  | "products"
  | "categories"
  | "orders"
  | "reviews"
  | "settings"
  | "site-images"
  | "customers"
  | "admins";

interface Entry {
  at: number;
  tags: readonly CacheTag[];
  value: Promise<unknown>;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

/**
 * How long a cached read stays fresh.
 *
 * Short, because the alternative to a stale read here is not an inconvenience:
 * an admin who edits a price in one tab and reads the old one in another has
 * been shown wrong information about their own shop. Thirty seconds keeps
 * navigation instant without letting anything drift for long, and every write
 * this app makes invalidates its own tags immediately anyway.
 */
const TTL_MS = 30_000;

/**
 * Bumped on every invalidation. `useQuery` reads it through
 * `useSyncExternalStore`, so a write in one component re-reads every mounted
 * query without any of them knowing about each other.
 */
let version = 0;

export function cacheVersion(): number {
  return version;
}

export function subscribeToCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function cached<T>(
  key: string,
  tags: readonly CacheTag[],
  load: () => Promise<T>,
): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;

  const value = load().catch((error: unknown) => {
    // Never cache a failure: a network blip would otherwise pin an error
    // screen in place for the whole TTL with no way to retry but a reload.
    entries.delete(key);
    throw error;
  });

  entries.set(key, { at: Date.now(), tags, value });
  return value;
}

/**
 * Drop everything about these subjects and tell every mounted query to
 * re-read. Call it after a write, naming what the write actually changed.
 */
export function invalidate(...tags: readonly CacheTag[]): void {
  if (tags.length === 0) return;

  for (const [key, entry] of entries) {
    if (entry.tags.some((tag) => tags.includes(tag))) entries.delete(key);
  }

  notify();
}

/** Drops the whole cache. Used on sign-out, so nothing survives into the next session. */
export function clearCache(): void {
  entries.clear();
  notify();
}
