import type { CustomerSummary } from "@shared/types";
import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { epoch } from "@admin/services/rows";
import type { Page } from "@admin/services/products";
import { DEFAULT_PAGE_SIZE } from "@admin/services/products";

/**
 * Customers — the accounts people have created on the shop.
 *
 * ---------------------------------------------------------------------------
 * READ ONLY, AND THAT IS THE WHOLE SHAPE OF IT
 * ---------------------------------------------------------------------------
 * There is no create, no update and no delete here, and none of them is
 * missing by accident:
 *
 *  - A profile is created by a DATABASE TRIGGER when somebody signs up, and
 *    removed by cascade when the account is deleted. `profiles` has no insert
 *    or delete policy for any client, this dashboard included.
 *  - A customer's name and phone belong to the customer. Row level security
 *    grants update on those two columns to the account that owns the row and to
 *    nobody else — an admin cannot rewrite a person's own details, which is
 *    correct and is also the reason there is no edit form on this screen.
 *  - A customer's ROLE is shown here and cannot be changed from here. The
 *    database refuses any role change made from a session that has an
 *    `auth.uid()`, which is every request this dashboard can make — so an admin
 *    session cannot promote anybody, including itself. Roles are changed in the
 *    Supabase SQL or table editor by whoever owns the project.
 *
 * So this is a directory: who has an account, how to reach them, and what they
 * have bought.
 *
 * ---------------------------------------------------------------------------
 * ORDER COUNTS COME FROM THE DATABASE, NOT FROM A LOOP
 * ---------------------------------------------------------------------------
 * It reads `customer_summaries`, a view that aggregates each profile's orders
 * with a lateral join answered by the existing `orders_user` index. A page of
 * twenty customers is ONE request; the obvious alternative — fetch profiles,
 * then fetch each one's orders — is the N+1 the brief rules out.
 */

export type CustomerSort = "newest" | "oldest" | "spend" | "orders" | "name";

export interface CustomerListOptions {
  search?: string;
  sort?: CustomerSort;
  page?: number;
  pageSize?: number;
}

export function customerListKey(options: CustomerListOptions): string {
  const { search, sort = "newest", page = 1, pageSize = DEFAULT_PAGE_SIZE } = options;
  return ["customers", (search ?? "").trim().toLowerCase() || "-", sort, page, pageSize].join(":");
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

interface CustomerRow {
  id: string;
  role: CustomerSummary["role"];
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
}

const COLUMNS =
  "id, role, email, full_name, phone, created_at, order_count, total_spent, last_order_at";

function toCustomer(row: CustomerRow): CustomerSummary {
  return {
    id: row.id,
    role: row.role,
    email: row.email ?? undefined,
    fullName: row.full_name ?? undefined,
    phone: row.phone ?? undefined,
    createdAt: epoch(row.created_at),
    // The view has no `updated_at` — nothing on this screen shows one, and
    // selecting a column to satisfy a type would be reading data for the type
    // checker rather than for the user.
    updatedAt: epoch(row.created_at),
    orderCount: Number(row.order_count),
    totalSpent: Number(row.total_spent),
    lastOrderAt: row.last_order_at ? epoch(row.last_order_at) : undefined,
  };
}

export async function listCustomers(
  options: CustomerListOptions,
): Promise<Page<CustomerSummary>> {
  const { search, sort = "newest", page = 1, pageSize = DEFAULT_PAGE_SIZE } = options;

  let q = getSupabase().from("customer_summaries").select(COLUMNS, { count: "exact" });

  const term = (search ?? "").trim().toLowerCase();
  if (term) {
    // `profiles.search_text` is generated over email, name and phone, with a
    // trigram index behind it — one indexed substring match rather than three
    // `or`-ed scans. Same pattern as products and orders.
    q = q.ilike("search_text", `%${escapeLike(term)}%`);
  }

  switch (sort) {
    case "oldest":
      q = q.order("created_at", { ascending: true });
      break;
    case "spend":
      q = q.order("total_spent", { ascending: false });
      break;
    case "orders":
      q = q.order("order_count", { ascending: false });
      break;
    case "name":
      // Someone who never gave a name sorts last rather than first, which is
      // where a null would otherwise put them in ascending order.
      q = q.order("full_name", { ascending: true, nullsFirst: false });
      break;
    default:
      q = q.order("created_at", { ascending: false });
  }

  q = q.order("id", { ascending: true });

  const start = (page - 1) * pageSize;
  const { data, error, count } = await q.range(start, start + pageSize - 1);
  if (error) throw new Error(describeError(error));

  return {
    rows: (data ?? []).map((row) => toCustomer(row as unknown as CustomerRow)),
    total: count ?? 0,
    page,
    pageSize,
  };
}
