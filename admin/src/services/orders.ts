import type { OrderStatus } from "@shared/types";
import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { invalidate } from "@admin/lib/cache";
import {
  ORDER_DETAIL_COLUMNS,
  ORDER_LIST_COLUMNS,
  toOrder,
  type AdminOrder,
  type OrderRow,
} from "@admin/services/rows";
import type { Page } from "@admin/services/products";
import { DEFAULT_PAGE_SIZE } from "@admin/services/products";

/**
 * Orders (requirements section 8 — "every confirmed customer order should be
 * stored and visible in the Admin Dashboard for order management").
 *
 * ---------------------------------------------------------------------------
 * THE DASHBOARD READS ORDERS, CHANGES THEIR STATUS, AND FILES THEM AWAY.
 * ---------------------------------------------------------------------------
 * `orders` has NO insert policy for anyone (`developerb.md` §4). Orders are
 * written exclusively by the storefront's `place-order` Edge Function, which
 * recomputes every price and the delivery charge from the database inside one
 * transaction and decrements stock under a row lock. Row level security grants
 * this dashboard `select` and `update`.
 *
 * It has no DELETE policy either, and this file does not add one. Archiving and
 * deletion both go through the three functions in
 * `20260903000001_order_archive_delete.sql` — see `archiveOrder` below.
 *
 * The money columns are technically writable through that update policy, and
 * this file never touches them — deliberately. `place_order()` computed
 * `subtotal + delivery_charge = total` from stored prices at the moment of
 * sale; a dashboard that could edit a total would be a dashboard that can make
 * a customer's receipt disagree with what they were charged, and it would do it
 * with no record of who changed what.
 *
 * ---------------------------------------------------------------------------
 * THE LIST DOES NOT READ ORDER LINES.
 * ---------------------------------------------------------------------------
 * Forty orders would be four hundred line items nobody looks at until a row is
 * opened. The lines come with the DETAIL read, in the same query as the order
 * itself (a PostgREST embed, one round trip — not a second request per row,
 * which is the N+1 the brief names).
 */

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
];

/**
 * What each status MEANS, so the dropdown is not five words with no context.
 * The set itself is the database enum (`public.order_status`) and is not the
 * dashboard's to extend — adding one is a migration, agreed jointly (§20).
 */
export const ORDER_STATUS_COPY: Record<OrderStatus, { label: string; hint: string }> = {
  pending: {
    label: "Pending",
    hint: "Where every new order lands. Checkout has succeeded and stock is already deducted — what has not happened yet is you confirming it.",
  },
  confirmed: {
    label: "Confirmed",
    hint: "Checked and accepted by you — the customer reached, the address good. Move an order here once you are happy to fulfil it.",
  },
  shipped: { label: "Shipped", hint: "Handed to the courier and on its way." },
  delivered: {
    label: "Delivered",
    hint: "Received by the customer and paid for. This also UNLOCKS reviewing: a customer can only review the pieces on an order once it is marked delivered.",
  },
  cancelled: {
    label: "Cancelled",
    hint: "Called off. NOTE: this does not put the stock back — adjust it on the product if the pieces are returning to the shelf.",
  },
};

/**
 * Whether an order may be filed away yet.
 *
 * The SAME rule as the database's `orders_archive_requires_settled` check, and
 * a deliberate second copy of it: the constraint is what makes it true, this is
 * what stops the dashboard offering a button that would fail. An order still
 * being fulfilled must not be archivable, because the sidebar's open-orders
 * badge counts pending + confirmed + shipped and would then be counting work
 * that has been hidden from the list.
 */
export function canArchive(status: OrderStatus): boolean {
  return status === "delivered" || status === "cancelled";
}

export type OrderSort = "newest" | "oldest" | "total-desc" | "total-asc";

/**
 * Which drawer of the filing cabinet the list is looking in.
 *
 * This is deliberately NOT a sixth value on the status dropdown. An archived
 * order still HAS a status — it is a delivered order that has been filed away,
 * or a cancelled one — and folding the two into one control would make
 * "Delivered" and "Archived" look mutually exclusive when they are not.
 */
export type OrderView = "active" | "archived" | "all";

export const ORDER_VIEW_COPY: Record<OrderView, { label: string; hint: string }> = {
  active: {
    label: "Active orders",
    hint: "Everything except what you have filed away. This is the working list.",
  },
  archived: {
    label: "Archived",
    hint: "Finished orders you have filed away. Nothing here is gone — each one can be put back, and each one still counts towards the shop's revenue.",
  },
  all: {
    label: "All orders",
    hint: "Active and archived together — the shop's complete history.",
  },
};

export interface OrderListOptions {
  search?: string;
  status?: OrderStatus | "all";
  /** Inclusive, as `YYYY-MM-DD`. Empty means unbounded. */
  from?: string;
  to?: string;
  sort?: OrderSort;
  /** Defaults to `"active"` — archived orders are out of the way unless asked for. */
  view?: OrderView;
  page?: number;
  pageSize?: number;
}

export function orderListKey(options: OrderListOptions): string {
  const {
    search,
    status = "all",
    from = "",
    to = "",
    sort = "newest",
    view = "active",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  return ["orders", (search ?? "").trim().toLowerCase() || "-", status, from || "-", to || "-", sort, view, page, pageSize].join(":");
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function listOrders(options: OrderListOptions): Promise<Page<AdminOrder>> {
  const {
    search,
    status = "all",
    from,
    to,
    sort = "newest",
    view = "active",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  let q = getSupabase().from("orders").select(ORDER_LIST_COLUMNS, { count: "exact" });

  // The archive filter comes FIRST because it is the one that is almost always
  // on: `orders_active_created` and `orders_active_status` are partial indexes
  // over exactly this predicate, so the default list reads an index that
  // contains only the rows it wants rather than filtering archived ones out
  // afterwards (§19).
  if (view === "active") q = q.is("archived_at", null);
  if (view === "archived") q = q.not("archived_at", "is", null);

  if (status !== "all") q = q.eq("status", status);

  // Dates arrive as `YYYY-MM-DD` from a date input and are compared against a
  // `timestamptz`, so both bounds carry a TIME. Without one, "to 30 August"
  // would mean midnight on the 30th and silently exclude every order placed
  // that day — which is all of them.
  if (from) q = q.gte("created_at", `${from}T00:00:00`);
  if (to) q = q.lte("created_at", `${to}T23:59:59.999`);

  const term = (search ?? "").trim().toLowerCase();
  if (term) {
    // `search_text` is a GENERATED column over the order number, name, email,
    // phone and city, with a trigram index behind it (see the migration). One
    // indexed substring match answers all five of the searches section 8 asks
    // for, rather than five `or`-ed `ilike`s across five unindexed columns.
    q = q.ilike("search_text", `%${escapeLike(term)}%`);
  }

  switch (sort) {
    case "oldest":
      q = q.order("created_at", { ascending: true });
      break;
    case "total-desc":
      q = q.order("total", { ascending: false });
      break;
    case "total-asc":
      q = q.order("total", { ascending: true });
      break;
    default:
      q = q.order("created_at", { ascending: false });
  }

  q = q.order("id", { ascending: true });

  const start = (page - 1) * pageSize;
  const { data, error, count } = await q.range(start, start + pageSize - 1);
  if (error) throw new Error(describeError(error));

  return {
    rows: (data ?? []).map((row) => toOrder(row as unknown as OrderRow)),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** One order, with its lines, in a single query. */
export async function getOrder(id: string): Promise<AdminOrder | null> {
  const { data, error } = await getSupabase()
    .from("orders")
    .select(ORDER_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(describeError(error));
  return data ? toOrder(data as unknown as OrderRow) : null;
}

/**
 * Move an order to a new status.
 *
 * NEVER OPTIMISTIC. The brief allows optimistic updates "where safe" and rules
 * them out where they could show incorrect order information — and an order
 * that appears to have been marked Delivered but was not is exactly that. The
 * caller waits, then the list re-reads.
 */
export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const { error } = await getSupabase().from("orders").update({ status }).eq("id", id);
  if (error) throw new Error(describeError(error));
  invalidate("orders");
}

/**
 * ---------------------------------------------------------------------------
 * ARCHIVING, AND THE DELETE THAT SITS BEHIND IT
 * ---------------------------------------------------------------------------
 * The shop's owner asked to be able to delete an order. `orders` is the sales
 * record, so the dashboard offers two actions and puts the reversible one
 * first:
 *
 *   ARCHIVE  takes a finished order off this list and nothing more. The row
 *            stays, the customer still sees it in their own order history, and
 *            it still counts towards revenue and that customer's lifetime
 *            spend. One click puts it back.
 *
 *   DELETE   erases the row, its line items and any reviews written from it.
 *            Only offered on an order that is already archived.
 *
 * NONE OF THE THREE IS A TABLE WRITE. `orders` has no delete policy for any
 * role and this file does not add one — a `DELETE /orders?id=neq.…` from a
 * stolen admin session would otherwise take the shop's whole history with it.
 * All three are `security definer` functions that re-check `is_admin()`
 * themselves, refuse an order that has not been archived, and write a row to
 * `deleted_orders` before removing anything. See
 * `20260903000001_order_archive_delete.sql`.
 *
 * NEVER OPTIMISTIC, for the same reason `setOrderStatus` is not: a list that
 * shows an order as gone before the database agrees is a list showing incorrect
 * order information. Each one waits, then invalidates.
 */

/** File a finished order away. Returns when it was archived. */
export async function archiveOrder(id: string): Promise<number> {
  const { data, error } = await getSupabase().rpc("archive_order", {
    target_order: id,
  });

  if (error) throw new Error(describeError(error));

  invalidate("orders");
  return data ? new Date(data as string).getTime() : Date.now();
}

/** Put an archived order back on the working list. */
export async function restoreOrder(id: string): Promise<void> {
  const { error } = await getSupabase().rpc("restore_order", { target_order: id });
  if (error) throw new Error(describeError(error));
  invalidate("orders");
}

/** What a delete actually removed, so the toast can say so rather than guess. */
export interface DeletedOrderSummary {
  orderNumber: string;
  itemsDeleted: number;
  reviewsDeleted: number;
}

/**
 * Permanently remove an archived order.
 *
 * `reviews` is invalidated alongside `orders` because deleting an order deletes
 * the reviews written from it — the moderation screen open in another tab is
 * now showing rows that no longer exist.
 */
export async function deleteOrder(id: string): Promise<DeletedOrderSummary> {
  const { data, error } = await getSupabase().rpc("delete_order", {
    target_order: id,
  });

  if (error) throw new Error(describeError(error));

  invalidate("orders", "reviews");
  return data as DeletedOrderSummary;
}

/**
 * The newest few orders, for the dashboard home. Deliberately tiny.
 *
 * Archived orders are left out: this panel is "what has just come in", and an
 * order the admin has explicitly filed away is the opposite of that.
 */
export async function listRecentOrders(limit = 6): Promise<AdminOrder[]> {
  const { data, error } = await getSupabase()
    .from("orders")
    .select(ORDER_LIST_COLUMNS)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(describeError(error));
  return (data ?? []).map((row) => toOrder(row as unknown as OrderRow));
}
