import "server-only";

import { getDb } from "@/lib/firebase/admin";

/**
 * Thin Realtime Database helpers.
 *
 * Feature-specific data access (products, orders, carts, ...) lands on top of
 * these once requirements.md is in place.
 */

export async function readPath<T>(path: string): Promise<T | null> {
  const snapshot = await getDb().ref(path).get();
  return snapshot.exists() ? (snapshot.val() as T) : null;
}

export async function writePath(path: string, value: unknown): Promise<void> {
  await getDb().ref(path).set(value);
}
