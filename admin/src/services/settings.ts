import type { Settings } from "@shared/types";
import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { invalidate } from "@admin/lib/cache";
import { SETTINGS_COLUMNS, toSettings, type SettingsRow } from "@admin/services/rows";

/**
 * Store settings — delivery charges above all (requirements section 10).
 *
 *   "The delivery charges should be manageable from the Admin Dashboard...
 *    The configured delivery charges should automatically appear during
 *    checkout and be properly included in the customer's total order amount."
 *
 * The second half of that is ALREADY TRUE and is not this dashboard's to
 * implement: `place_order()` reads `settings.delivery_charge` and
 * `free_delivery_threshold` from the database at the moment an order is placed
 * and computes `total = subtotal + delivery` itself, ignoring anything the
 * browser sends (see `20260829000003_payment_method.sql`). Writing this row IS
 * the whole feature — there is no second place to update and no cache to bust
 * on the storefront beyond its own Realtime invalidation, which fires on this
 * table already.
 *
 * ---------------------------------------------------------------------------
 * ONE ROW, ENFORCED BY THE DATABASE
 * ---------------------------------------------------------------------------
 * `settings.id` is `boolean primary key default true check (id)`, so there can
 * only ever be one row and it can only ever have one id. That is why every
 * write here is an UPSERT with `id: true` rather than an update: the schema
 * ships EMPTY (`developerb.md` §4 — no seed data, ever), so the first time an
 * admin saves the delivery charge the row does not exist yet, and an `update`
 * would report success having changed nothing at all.
 *
 * ---------------------------------------------------------------------------
 * ROOM TO GROW, WITHOUT BUILDING IT NOW
 * ---------------------------------------------------------------------------
 * The brief mentions city- and region-based charges and asks that the design
 * not block them, while explicitly warning against over-engineering. So:
 * nothing here models a zone, and no empty `delivery_zones` table is created
 * for a feature nobody has asked for. What makes the extension safe is where
 * the CALCULATION lives — inside `place_order()`, server-side, reading the
 * database. Adding zones later is a migration plus a branch in that function;
 * neither the storefront's checkout nor this form has to be rewritten, because
 * neither one computes the charge in the first place.
 */

export const SETTINGS_KEY = "settings:store";

export async function getSettings(): Promise<Settings | null> {
  const { data, error } = await getSupabase()
    .from("settings")
    .select(SETTINGS_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(describeError(error));
  return data ? toSettings(data as SettingsRow) : null;
}

export interface SettingsInput {
  deliveryCharge: number;
  /** Undefined means "no free delivery" — stored as SQL null, not zero. */
  freeDeliveryThreshold?: number;
  lowStockThreshold: number;
  storeAnnouncement?: string;
}

export async function saveSettings(input: SettingsInput): Promise<void> {
  const { error } = await getSupabase().from("settings").upsert(
    {
      id: true,
      delivery_charge: Math.max(0, Math.round(input.deliveryCharge)),
      // A threshold of 0 would mean "free delivery on everything", which is a
      // real thing an admin might want, so it must not be conflated with
      // "unset". Only `undefined` clears it.
      free_delivery_threshold:
        input.freeDeliveryThreshold === undefined
          ? null
          : Math.max(0, Math.round(input.freeDeliveryThreshold)),
      low_stock_threshold: Math.max(0, Math.round(input.lowStockThreshold)),
      store_announcement: input.storeAnnouncement?.trim() || null,
    },
    { onConflict: "id" },
  );

  if (error) throw new Error(describeError(error));

  // `low_stock_threshold` feeds the `product_summaries` view's `low_stock`
  // column, so changing it re-labels products across the whole dashboard —
  // which is why this invalidates products as well as settings.
  invalidate("settings", "products");
}

/* ---------------------------------------------------------------------------
 * settings_private — admin-only, no public read at all
 * ------------------------------------------------------------------------ */

export interface PrivateSettings {
  notifyEmail?: string;
}

export const PRIVATE_SETTINGS_KEY = "settings:private";

export async function getPrivateSettings(): Promise<PrivateSettings> {
  const { data, error } = await getSupabase()
    .from("settings_private")
    .select("notify_email")
    .maybeSingle();

  if (error) throw new Error(describeError(error));

  const row = data as { notify_email: string | null } | null;
  return { notifyEmail: row?.notify_email ?? undefined };
}

export async function savePrivateSettings(input: PrivateSettings): Promise<void> {
  const { error } = await getSupabase()
    .from("settings_private")
    .upsert(
      { id: true, notify_email: input.notifyEmail?.trim() || null },
      { onConflict: "id" },
    );

  if (error) throw new Error(describeError(error));
  invalidate("settings");
}
