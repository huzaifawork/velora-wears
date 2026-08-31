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
 * THE DASHBOARD READS ORDERS AND CHANGES THEIR STATUS. NOTHING ELSE.
 * ---------------------------------------------------------------------------
 * `orders` has NO insert policy for anyone (`developerb.md` §4). Orders are
 * written exclusively by the storefront's `place-order` Edge Function, which
 * recomputes every price and the delivery charge from the database inside one
 * transaction and decrements stock under a row lock. Row level security grants
 * this dashboard `select` and `update`.
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

export type OrderSort = "newest" | "oldest" | "total-desc" | "total-asc";

export interface OrderListOptions {
  search?: string;
  status?: OrderStatus | "all";
  /** Inclusive, as `YYYY-MM-DD`. Empty means unbounded. */
  from?: string;
  to?: string;
  sort?: OrderSort;
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
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  return ["orders", (search ?? "").trim().toLowerCase() || "-", status, from || "-", to || "-", sort, page, pageSize].join(":");
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
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  let q = getSupabase().from("orders").select(ORDER_LIST_COLUMNS, { count: "exact" });

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

/** The newest few orders, for the dashboard home. Deliberately tiny. */
export async function listRecentOrders(limit = 6): Promise<AdminOrder[]> {
  const { data, error } = await getSupabase()
    .from("orders")
    .select(ORDER_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(describeError(error));
  return (data ?? []).map((row) => toOrder(row as unknown as OrderRow));
}
