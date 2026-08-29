import { useState } from "react";

import { FALLBACK_LOW_STOCK_THRESHOLD } from "@shared/stock";
import { Button } from "@admin/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@admin/components/ui/Card";
import { Field, Switch } from "@admin/components/ui/Field";
import { ErrorState, Skeleton } from "@admin/components/ui/Skeleton";
import { useToast } from "@admin/components/ui/Toast";
import { useQuery } from "@admin/hooks/useQuery";
import {
  PRIVATE_SETTINGS_KEY,
  SETTINGS_KEY,
  getPrivateSettings,
  getSettings,
  savePrivateSettings,
  saveSettings,
} from "@admin/services/settings";
import { formatPrice } from "@admin/lib/format";

/**
 * Delivery charges and store settings (requirements section 10).
 *
 *   "The delivery charges should be manageable from the Admin Dashboard...
 *    The configured delivery charges should automatically appear during
 *    checkout and be properly included in the customer's total order amount."
 *
 * ---------------------------------------------------------------------------
 * THIS FORM IS THE WHOLE FEATURE
 * ---------------------------------------------------------------------------
 * The second half of that requirement is already true and is not this
 * dashboard's to implement. `place_order()` reads `delivery_charge` and
 * `free_delivery_threshold` from this row at the moment an order is placed and
 * computes `total = subtotal + delivery` itself, ignoring anything the browser
 * sends. So saving here changes what the next customer is charged, with no
 * deployment and no second place to update — which is exactly why the preview
 * below shows the arithmetic against real amounts rather than leaving the admin
 * to imagine it.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE ARE NO DELIVERY ZONES
 * ---------------------------------------------------------------------------
 * The brief mentions city- and region-based charges as things the design should
 * not block, and warns in the same breath against over-engineering. So nothing
 * here models a zone and no empty table was created for one.
 *
 * What makes that extension safe later is WHERE THE CALCULATION LIVES: inside
 * `place_order()`, server-side, reading the database. Adding zones is a
 * migration plus a branch in that function — the storefront's checkout never
 * computes the charge and neither does this form, so neither has to be
 * rewritten when the rule gets richer.
 */
export function DeliveryPage() {
  const settings = useQuery(SETTINGS_KEY, ["settings"], getSettings);
  const priv = useQuery(PRIVATE_SETTINGS_KEY, ["settings"], getPrivateSettings);

  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.refetch} />;
  if (priv.error) return <ErrorState error={priv.error} onRetry={priv.refetch} />;

  if (settings.loading || priv.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  /*
   * The form is mounted only once its values exist, and it takes them as
   * PROPS rather than seeding itself from a read inside an effect.
   *
   * That is not a style preference. Seeding in an effect renders an empty form
   * first and overwrites it a frame later — so an admin can start typing into a
   * field that is about to be replaced underneath them, and React's own lint
   * rules flag the cascading render it causes. Mounting late means the first
   * render the form ever does is already correct.
   *
   * `settings` being null is the NORMAL first-run state: the schema ships empty
   * (developerb.md §4), so there is no settings row until this form writes one.
   * The fallbacks below are what that first save will contain.
   */
  return (
    <SettingsForm
      initial={{
        charge: String(settings.data?.deliveryCharge ?? 0),
        freeEnabled: settings.data?.freeDeliveryThreshold !== undefined,
        threshold: String(settings.data?.freeDeliveryThreshold ?? ""),
        lowStock: String(settings.data?.lowStockThreshold ?? FALLBACK_LOW_STOCK_THRESHOLD),
        announcement: settings.data?.storeAnnouncement ?? "",
        notifyEmail: priv.data?.notifyEmail ?? "",
      }}
    />
  );
}

interface SettingsDraft {
  charge: string;
  freeEnabled: boolean;
  threshold: string;
  lowStock: string;
  announcement: string;
  notifyEmail: string;
}

function SettingsForm({ initial }: { initial: SettingsDraft }) {
  const toast = useToast();

  const [charge, setCharge] = useState(initial.charge);
  const [freeEnabled, setFreeEnabled] = useState(initial.freeEnabled);
  const [threshold, setThreshold] = useState(initial.threshold);
  const [lowStock, setLowStock] = useState(initial.lowStock);
  const [announcement, setAnnouncement] = useState(initial.announcement);
  const [notifyEmail, setNotifyEmail] = useState(initial.notifyEmail);
  const [saving, setSaving] = useState(false);

  const chargeValue = Number(charge);
  const thresholdValue = Number(threshold);

  const chargeError = whole(charge, "The delivery charge");
  const thresholdError = freeEnabled ? whole(threshold, "The free delivery threshold") : undefined;
  const lowStockError = whole(lowStock, "The low stock threshold");

  const onSave = async () => {
    if (chargeError || thresholdError || lowStockError) {
      toast.error("Some values still need attention.");
      return;
    }

    setSaving(true);
    try {
      await saveSettings({
        deliveryCharge: chargeValue,
        freeDeliveryThreshold: freeEnabled ? thresholdValue : undefined,
        lowStockThreshold: Number(lowStock),
        storeAnnouncement: announcement,
      });
      await savePrivateSettings({ notifyEmail });
      toast.success("Saved. This applies to the next order a customer places.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery & store"
        description="What customers are charged for delivery, and the settings the shop reads at checkout."
        action={
          <Button onClick={() => void onSave()} loading={saving}>
            Save changes
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Delivery charge"
              description="Added to every order at checkout. The shop's server applies it — a customer's browser cannot change it."
            />

            <div className="mt-5 space-y-5">
              <Field
                label="Standard delivery charge"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={charge}
                onChange={setCharge}
                error={chargeError}
                prefix="Rs"
                hint="Set 0 for free delivery on everything."
              />

              <div className="rounded-lg border border-line bg-surface-raised p-4">
                <Switch
                  label="Free delivery over a certain amount"
                  checked={freeEnabled}
                  onChange={setFreeEnabled}
                  description="When the basket subtotal reaches this figure, delivery is not charged."
                />

                {freeEnabled && (
                  <Field
                    className="mt-4"
                    label="Free delivery from"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={threshold}
                    onChange={setThreshold}
                    error={thresholdError}
                    prefix="Rs"
                    hint="The shop advertises this on the landing page and in the bag."
                  />
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Store"
              description="Two settings the shop reads that are not about delivery."
            />

            <div className="mt-5 space-y-5">
              <Field
                label="Low stock threshold"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={lowStock}
                onChange={setLowStock}
                error={lowStockError}
                suffix="units"
                hint="At or below this many units a piece counts as running low — the amber badge in this dashboard and the “only N left” line customers see. One number, both sides."
              />

              <Field
                label="Announcement"
                value={announcement}
                onChange={setAnnouncement}
                optional
                multiline
                rows={2}
                maxLength={160}
                placeholder="Free delivery on orders over Rs 5,000 — cash on delivery, nationwide."
                hint="Shown across the top of the shop. Leave it empty for no announcement."
              />

              <Field
                label="Notification email"
                type="email"
                inputMode="email"
                value={notifyEmail}
                onChange={setNotifyEmail}
                optional
                maxLength={120}
                placeholder="orders@velorawears.com"
                hint="Private — stored where only administrators can read it, and never shown to customers."
              />
            </div>
          </Card>
        </div>

        {/* --- What this actually does at checkout ------------------- */}
        <Card>
          <CardHeader
            title="At checkout"
            description="What a customer will be charged, with the values above."
          />

          <div className="mt-5 space-y-3">
            {[1500, 4000, 8000].map((subtotal) => {
              const free = freeEnabled && thresholdValue >= 0 && subtotal >= thresholdValue;
              const delivery = free ? 0 : Math.max(0, chargeValue || 0);

              return (
                <div
                  key={subtotal}
                  className="rounded-lg border border-line bg-surface-raised p-4"
                >
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-soft">Basket</dt>
                      <dd className="text-ink tabular-nums">{formatPrice(subtotal)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-soft">Delivery</dt>
                      <dd className={`tabular-nums ${free ? "text-success" : "text-ink"}`}>
                        {free ? "Free" : formatPrice(delivery)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-line pt-1.5">
                      <dt className="font-medium text-ink">Total</dt>
                      <dd className="font-medium text-ink tabular-nums">
                        {formatPrice(subtotal + delivery)}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>

          <p className="mt-5 text-xs leading-relaxed text-ink-muted">
            These figures are worked out here the same way the shop's server
            works them out when an order is placed: the delivery charge is read
            from the database, never sent by the customer's browser, and the
            total is always the basket plus delivery.
          </p>
        </Card>
      </div>
    </div>
  );
}

/** Whole, non-negative, and present. Every one of these has a `check` behind it. */
function whole(value: string, what: string): string | undefined {
  if (value.trim() === "") return `${what} is required.`;
  const number = Number(value);
  if (!Number.isFinite(number)) return `${what} has to be a number.`;
  if (number < 0) return `${what} cannot be negative.`;
  if (!Number.isInteger(number)) return `${what} has to be a whole number of rupees.`;
  return undefined;
}
