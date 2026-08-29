import type { Order, OrderItem } from "@shared/types";
import { paymentMethodOf } from "@shared/payment";

/**
 * A signed-in customer's own order history — what optional accounts unlock
 * (the note added to requirements section 12: "an account only lets a
 * customer see past orders and skip re-typing their details next time").
 *
 * **Security is the row level security policy, not this file.** `orders` has
 * a select policy of `user_id = auth.uid()` (see `supabase/migrations/
 * 20260829000001_init.sql`) — a guest or another customer's session gets
 * back an empty list, never an error and never someone else's order. This
 * module does not need to (and does not) filter by user id itself; it reads
 * exactly what RLS already scoped.
 *
 * Deliberately its own module rather than a `CatalogSource` method: unlike
 * the catalog, orders have no "demo mode" — checkout always writes through
 * the real `place-order` Edge Function regardless of `VITE_DATA_SOURCE` (see
 * `lib/placeOrder.ts`), so an order history read always goes straight to
 * Supabase too.
 */

interface OrderItemRow {
  id: string;
  product_id: string;
  name: string;
  slug: string;
  thumb: string;
  size: string;
  qty: number;
  unit_price: number;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: Order["status"];
  full_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string | null;
  notes: string | null;
  subtotal: number;
  delivery_charge: number;
  total: number;
  payment_method: string | null;
  is_guest: boolean;
  user_id: string | null;
  review_token: string;
  created_at: string;
  updated_at: string;
  order_items: OrderItemRow[] | null;
}

const epoch = (iso: string): number => new Date(iso).getTime();

function toOrderItem(row: OrderItemRow): OrderItem {
  return {
    productId: row.product_id,
    name: row.name,
    slug: row.slug,
    thumb: row.thumb,
    size: row.size as OrderItem["size"],
    qty: row.qty,
    unitPrice: row.unit_price,
  };
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    customer: {
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      address: row.address,
      city: row.city,
      postalCode: row.postal_code ?? undefined,
      notes: row.notes ?? undefined,
    },
    items: (row.order_items ?? []).map(toOrderItem),
    subtotal: row.subtotal,
    deliveryCharge: row.delivery_charge,
    total: row.total,
    paymentMethod: paymentMethodOf(row.payment_method),
    isGuest: row.is_guest,
    userId: row.user_id ?? undefined,
    reviewToken: row.review_token,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}

const SELECT =
  "id, order_number, status, full_name, email, phone, address, city, postal_code, notes, " +
  "subtotal, delivery_charge, total, payment_method, is_guest, user_id, review_token, " +
  "created_at, updated_at, " +
  "order_items(id, product_id, name, slug, thumb, size, qty, unit_price)";

/** Every order the signed-in customer has placed, newest first. */
export async function listMyOrders(): Promise<Order[]> {
  const { getSupabase } = await import("@/lib/supabase");

  const { data, error } = await getSupabase()
    .from("orders")
    .select(SELECT)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as OrderRow[]).map(toOrder);
}
