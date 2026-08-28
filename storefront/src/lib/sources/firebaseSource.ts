import {
  endAt,
  equalTo,
  get,
  limitToFirst,
  orderByChild,
  query,
  ref,
  startAt,
} from "firebase/database";

import type { Category, Product, ProductSummary, Review, Settings } from "@shared/types";
import { getDb } from "@/lib/firebase";
import {
  sortSummaries,
  type CatalogSource,
  type ResolvedListOptions,
} from "@/lib/sources/CatalogSource";

/**
 * The REAL read layer — Realtime Database via the Firebase client SDK.
 *
 * Currently dormant: `VITE_DATA_SOURCE` is `demo` until the client buys the
 * Blaze plan and the catalog is seeded. Do not delete it; flipping that flag is
 * the whole switch. Everything here is loaded lazily by `queries.ts`, so in
 * demo mode the Firebase SDK is never even downloaded by the browser.
 *
 * Rules of thumb enforced here (requirements sections 18-19):
 *
 *  1. LIST views read `productSummaries`, never `products`. Summaries are small
 *     and carry a card-sized `thumb`, so a grid of 24 products does not pull 24
 *     full descriptions and full-resolution image URLs.
 *  2. Every `orderByChild` field must have a matching `.indexOn` in
 *     database.rules.json, or Firebase sorts client-side after downloading the
 *     whole node — the single most common cause of a slow RTDB app.
 *  3. Always bound reads with a limit. Never read an unbounded collection.
 *
 * Response caching lives one level up, in `queries.ts`, so both sources share it.
 */

function toArray<T>(val: Record<string, T> | null): T[] {
  return val ? Object.values(val) : [];
}

/**
 * NOTE ON A REAL RTDB LIMITATION: a query may use only ONE `orderByChild`. So
 * "filter by category AND sort by price" cannot be expressed server-side. We
 * filter on the indexed `categorySlug` and sort the (much smaller) result in
 * memory. If a single category ever grows large enough for that to hurt, add a
 * denormalised composite key such as `categorySlug_price` and index that.
 */
async function listProducts({
  categorySlug,
  sort,
  limit,
}: ResolvedListOptions): Promise<ProductSummary[]> {
  const base = ref(getDb(), "productSummaries");

  const q = categorySlug
    ? query(base, orderByChild("categorySlug"), equalTo(categorySlug), limitToFirst(limit))
    : query(base, orderByChild("createdAt"), limitToFirst(limit));

  const rows = toArray<ProductSummary>((await get(q)).val()).filter((p) => p.active);
  return sortSummaries(rows, sort);
}

/** Detail view — one full product, fetched only when the user opens it. */
async function getProductBySlug(slug: string): Promise<Product | null> {
  const q = query(ref(getDb(), "products"), orderByChild("slug"), equalTo(slug), limitToFirst(1));
  return toArray<Product>((await get(q)).val())[0] ?? null;
}

/**
 * Search (requirements section 13 — runs on Enter/button, not per keystroke).
 * Prefix match against the denormalised lowercase `searchText` field.
 */
async function searchProducts(term: string, limit: number): Promise<ProductSummary[]> {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  const q = query(
    ref(getDb(), "productSummaries"),
    orderByChild("searchText"),
    startAt(t),
    endAt(`${t}\uf8ff`),
    limitToFirst(limit),
  );
  return toArray<ProductSummary>((await get(q)).val()).filter((p) => p.active);
}

async function getCategories(): Promise<Category[]> {
  const rows = toArray<Category>((await get(ref(getDb(), "categories"))).val());
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** `settings/public` — the only settings branch the rules expose to the browser. */
async function getSettings(): Promise<Settings | null> {
  return (await get(ref(getDb(), "settings/public"))).val();
}

/**
 * Landing-page testimonials.
 *
 * Reviews are stored per product (`reviews/{productId}/{reviewId}`), so there is
 * no flat node to read the newest few from — pulling them would mean reading
 * every product's reviews, which section 19 forbids. Requirements section 16
 * resolves this with a denormalised, admin-maintained node of featured reviews;
 * until that section is built this returns nothing and the landing page simply
 * omits the strip.
 */
async function listTestimonials(): Promise<Review[]> {
  return [];
}

export const firebaseSource: CatalogSource = {
  listProducts,
  getProductBySlug,
  searchProducts,
  getCategories,
  getSettings,
  listTestimonials,
};
