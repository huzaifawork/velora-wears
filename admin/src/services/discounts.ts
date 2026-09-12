import type { Discount, DiscountKind, DiscountScope } from "@shared/types";
import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { invalidate } from "@admin/lib/cache";
import { epoch } from "@admin/services/rows";

/**
 * Discounts (requirements section 8 — the admin manages what the shop shows).
 *
 * A discount is a row saying WHAT is on offer, HOW MUCH comes off, and WHEN it
 * runs. `shared/discounts.ts` is the contract and carries the reasoning — in
 * particular why several offers on one piece resolve to the best one rather
 * than stacking. Read that before changing anything here.
 *
 * ---------------------------------------------------------------------------
 * THIS SERVICE WRITES THE RULE. IT NEVER WRITES A PRICE.
 * ---------------------------------------------------------------------------
 * No product row is touched when a sale starts, and none is touched when it
 * ends. The sale price is computed — by `product_summaries` for every listing,
 * and by `place_order()` at the moment of purchase — so a discount that expires
 * simply stops applying, everywhere, without anything running.
 *
 * The alternative, rewriting `products.price` and keeping the old one
 * somewhere, is how a shop ends up with a "sale" that never ended because the
 * job that was meant to put the prices back did not run.
 *
 * So: a discount is deleted, switched off, or allowed to expire, and the
 * catalogue is correct in all three cases with no cleanup at all.
 */

export const DISCOUNT_LIST_KEY = "discounts:all";

interface DiscountRow {
  id: string;
  name: string;
  scope: DiscountScope;
  category_slug: string | null;
  product_id: string | null;
  kind: DiscountKind;
  value: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, name, scope, category_slug, product_id, kind, value, starts_at, ends_at, active, created_at, updated_at";

function toDiscount(row: DiscountRow): Discount {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    categorySlug: row.category_slug ?? undefined,
    productId: row.product_id ?? undefined,
    kind: row.kind,
    value: row.value,
    startsAt: row.starts_at ? epoch(row.starts_at) : undefined,
    endsAt: row.ends_at ? epoch(row.ends_at) : undefined,
    active: row.active,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}

/**
 * Every discount, running or not.
 *
 * Ordered so the list reads the way an admin thinks about it: what is switched
 * on first, newest first inside that. A finished sale is still worth keeping —
 * it is how the same offer runs again next season without being retyped — so
 * nothing is hidden here, and the row says which state it is in.
 *
 * The whole table is a handful of rows and there is no paging: a shop running
 * more than a screenful of simultaneous offers has a different problem.
 */
export async function listDiscounts(): Promise<Discount[]> {
  const { data, error } = await getSupabase()
    .from("discounts")
    .select(COLUMNS)
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(describeError(error));
  return (data ?? []).map((row) => toDiscount(row as DiscountRow));
}

export interface DiscountInput {
  name: string;
  scope: DiscountScope;
  /** Set when `scope` is `category`; ignored otherwise. */
  categorySlug?: string | null;
  /** Set when `scope` is `product`; ignored otherwise. */
  productId?: string | null;
  kind: DiscountKind;
  value: number;
  /** Epoch milliseconds, or null for "already running". */
  startsAt?: number | null;
  /** Epoch milliseconds, exclusive, or null for "until switched off". */
  endsAt?: number | null;
  active: boolean;
}

/**
 * The row as Postgres wants it.
 *
 * The target fields are NULLED OUT according to the scope rather than passed
 * through, because the database's own constraint refuses a row that carries
 * both — and an admin who picks a product, changes their mind and picks a
 * category would otherwise be sending the stale one along. Deciding it here
 * means the form can hold whatever the admin last touched without that ever
 * reaching the table.
 */
function toRow(input: DiscountInput) {
  return {
    name: input.name.trim(),
    scope: input.scope,
    category_slug: input.scope === "category" ? (input.categorySlug ?? null) : null,
    product_id: input.scope === "product" ? (input.productId ?? null) : null,
    kind: input.kind,
    value: Math.round(input.value),
    starts_at: input.startsAt == null ? null : new Date(input.startsAt).toISOString(),
    ends_at: input.endsAt == null ? null : new Date(input.endsAt).toISOString(),
    active: input.active,
  };
}

/*
 * Every write invalidates `products` as well as `discounts`.
 *
 * Nothing about a product row changes when a sale starts — but what the
 * dashboard SHOWS for it does, because the product list reads the summaries
 * view, and that view is where the sale price is computed. The tag names the
 * subject, not the table (`lib/cache.ts`), and a price on screen is a fact
 * about a product.
 */

export async function createDiscount(input: DiscountInput): Promise<void> {
  const { error } = await getSupabase().from("discounts").insert(toRow(input));
  if (error) throw new Error(describeError(error));
  invalidate("discounts", "products");
}

export async function updateDiscount(id: string, input: DiscountInput): Promise<void> {
  const { error } = await getSupabase().from("discounts").update(toRow(input)).eq("id", id);
  if (error) throw new Error(describeError(error));
  invalidate("discounts", "products");
}

/**
 * The switch, on its own — the one-click "stop this sale now" from the list.
 *
 * Separate from `updateDiscount` because it is a different action with
 * different stakes: an admin ending a sale in a hurry should not have to open a
 * form and re-confirm six fields they are not changing.
 */
export async function setDiscountActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from("discounts").update({ active }).eq("id", id);
  if (error) throw new Error(describeError(error));
  invalidate("discounts", "products");
}

/**
 * Delete a discount.
 *
 * Nothing references it and nothing has to be undone: orders placed while it
 * ran carry their own copy of what was charged and what it would have cost
 * (`order_items.list_price`), so a deleted discount cannot rewrite the past.
 */
export async function deleteDiscount(id: string): Promise<void> {
  const { error } = await getSupabase().from("discounts").delete().eq("id", id);
  if (error) throw new Error(describeError(error));
  invalidate("discounts", "products");
}
