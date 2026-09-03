import { useEffect } from "react";

import { invalidate } from "@admin/lib/cache";
import { getSupabase } from "@admin/lib/supabase";
import { useToast } from "@admin/components/ui/Toast";

/**
 * New orders, arriving without a refresh (Supabase Realtime).
 *
 * ---------------------------------------------------------------------------
 * ONE SUBSCRIPTION FOR THE WHOLE APPLICATION, AND ONLY FOR ORDERS
 * ---------------------------------------------------------------------------
 * The brief asks to "avoid unnecessary realtime subscriptions", and this is the
 * one that is necessary. An admin leaves this dashboard open on a second
 * monitor; an order placed on the shop has to appear without them thinking to
 * reload, because the whole job of the orders screen is knowing what has come
 * in. Everything else in this dashboard changes only when the admin themselves
 * change it — and their own writes already invalidate the cache directly, so
 * subscribing to `products` or `categories` would be paying a WebSocket to be
 * told what this tab just did.
 *
 * It is mounted ONCE, in the layout, rather than per screen, and it is torn
 * down on unmount — a channel left open across a sign-out is a socket
 * authenticated as someone who has left.
 *
 * WHY THIS IS SAFE TO SUBSCRIBE TO AT ALL: Realtime re-evaluates row level
 * security per subscriber before delivering a change (see the long note at the
 * bottom of `20260829000001_init.sql`). `orders` carries customer names, phone
 * numbers and addresses; an admin receives them because `"admins read orders"`
 * lets them, and nobody else receives anything.
 *
 * The payload is deliberately not read beyond the order number. This drops the
 * cached reads and lets the normal query path re-run, rather than splicing a
 * row into whatever list happens to be mounted — the same "blunt invalidation"
 * reasoning as the storefront's `useCatalogRealtime`, and for the same reason:
 * a second copy of the filtering rules is a second copy that can be wrong.
 */
export function useOrderAlerts(): void {
  const toast = useToast();

  useEffect(() => {
    const supabase = getSupabase();

    const channel = supabase
      .channel("admin-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          invalidate("orders");
          const order = payload.new as { order_number?: string };
          toast.info(
            order.order_number
              ? `New order ${order.order_number}`
              : "A new order has just come in",
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        () => {
          // Another admin (or another tab) moved an order along. No toast — an
          // update the person watching did not make is not news, it is just a
          // reason for the list they are looking at to be correct.
          invalidate("orders");
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        () => {
          // An order was deleted permanently (`delete_order()`), almost
          // certainly in another tab belonging to this same admin. No toast for
          // the same reason as an update — but the list MUST re-read, because
          // the row it is showing no longer exists and opening it would give a
          // "that order does not exist" screen.
          invalidate("orders");
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [toast]);
}
