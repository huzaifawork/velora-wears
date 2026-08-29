import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";

/**
 * The dashboard home's figures — ALL of them, in ONE request.
 *
 * Fifteen numbers over PostgREST is fifteen requests, or (the obvious first
 * attempt, and the worse one) a single request that downloads every order so
 * the browser can add up the totals. The second stops working the day the shop
 * is busy, which is the day the dashboard matters most.
 *
 * So the counting happens in Postgres, in `admin_dashboard_stats()` — see
 * `supabase/migrations/20260830000001_admin_dashboard.sql`. The function is
 * SECURITY INVOKER, so row level security still applies: an admin sees the
 * whole shop's figures because their policies allow it, and anybody else gets
 * zeros. It cannot become a back door to aggregate sales data.
 */

export interface DashboardStats {
  products: {
    total: number;
    active: number;
    inactive: number;
    featured: number;
    outOfStock: number;
    lowStock: number;
    /** Total units across every size of every product. */
    units: number;
  };
  categories: { total: number; active: number };
  reviews: { total: number; hidden: number };
  orders: {
    total: number;
    pending: number;
    confirmed: number;
    shipped: number;
    delivered: number;
    cancelled: number;
    /** Placed but not yet delivered or cancelled — the actual work queue. */
    open: number;
    last30d: number;
    revenue: number;
    revenue30d: number;
    revenueDelivered: number;
  };
  /** Fourteen days, gap-free — a day with no orders is a zero, not a hole. */
  daily: Array<{ day: string; orders: number; revenue: number }>;
}

export const DASHBOARD_STATS_KEY = "dashboard:stats";

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await getSupabase().rpc("admin_dashboard_stats");
  if (error) throw new Error(describeError(error));
  return data as DashboardStats;
}
