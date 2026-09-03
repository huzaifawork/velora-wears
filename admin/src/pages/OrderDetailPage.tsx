import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { OrderStatus } from "@shared/types";
import { orderLineSize } from "@shared/sizes";
import { paymentMethodCopy } from "@shared/payment";
import { Button, buttonClasses } from "@admin/components/ui/Button";
import { Card, CardHeader, Detail, PageHeader } from "@admin/components/ui/Card";
import { Badge, OrderStatusBadge } from "@admin/components/ui/Badge";
import { Select } from "@admin/components/ui/Select";
import { ErrorState, Skeleton } from "@admin/components/ui/Skeleton";
import { Thumb } from "@admin/components/ui/Thumb";
import { useToast } from "@admin/components/ui/Toast";
import { ConfirmDialog } from "@admin/components/ui/Modal";
import { ArchiveIcon, CopyIcon, RestoreIcon, TrashIcon } from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COPY,
  archiveOrder,
  canArchive,
  deleteOrder,
  getOrder,
  restoreOrder,
  setOrderStatus,
} from "@admin/services/orders";
import { formatDateTime, formatPrice } from "@admin/lib/format";
import * as routes from "@admin/lib/routes";

/**
 * One order (requirements section 8).
 *
 * ---------------------------------------------------------------------------
 * THE MONEY IS READ-ONLY, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------
 * `place_order()` computed this order's subtotal, delivery charge and total
 * server-side from stored prices, inside the transaction that decremented
 * stock, and the line items are a SNAPSHOT of what was bought at the price
 * actually paid — renaming or repricing a product later does not touch them.
 *
 * The row-level-security policy on `orders` would technically let this
 * dashboard write those columns, and it never does. A dashboard that can edit a
 * total is a dashboard that can make a customer's receipt disagree with what
 * they were charged, silently and with no record of who did it. So the arithmetic
 * is displayed and checked — `subtotal + delivery = total` is asserted on screen
 * — and the one thing that changes here is the STATUS.
 *
 * ---------------------------------------------------------------------------
 * CANCELLING DOES NOT RESTORE STOCK
 * ---------------------------------------------------------------------------
 * Stock was decremented when the order was placed, and nothing puts it back.
 * That is the honest default — a cancelled order's pieces may be damaged, lost
 * with a courier, or already on their way back — but it is invisible unless
 * somebody says so, so the status control says it at the moment of the change.
 *
 * ---------------------------------------------------------------------------
 * THE FILING CARD: ARCHIVE AND DELETE
 * ---------------------------------------------------------------------------
 * Deleting is always available and always permanent — the order, its lines and
 * any reviews written from it, gone, with only a row in `deleted_orders` left
 * to account for the missing revenue. Archiving sits above it as the reversible
 * option for a finished order: the row stays, the customer keeps seeing it, the
 * figures do not move.
 *
 * An ARCHIVED order's status control is replaced by a note, because the
 * database will not let one move: `orders_archive_requires_settled` allows an
 * `archived_at` only on a delivered or cancelled order, so "restore it first"
 * is the real answer and the screen may as well say it before the write fails.
 */
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const order = useQuery(`order:${id}`, ["orders"], () => getOrder(id!));
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // `saving` disables every control on the screen while a write is in flight;
  // this says WHICH button was pressed, so the spinner appears on that one
  // rather than on all three at once.
  const [action, setAction] = useState<"archive" | "restore" | "delete">();

  // Set the instant a delete succeeds. Deleting invalidates the `orders` tag,
  // which makes this screen's own read run again and come back empty — without
  // this flag the admin would see "that order does not exist" flash up on the
  // way out, which reads like an error rather than a success.
  const [removed, setRemoved] = useState(false);

  const onStatus = async (status: OrderStatus) => {
    if (!order.data || status === order.data.status) return;

    setSaving(true);
    try {
      await setOrderStatus(order.data.id, status);
      toast.success(`Order marked ${ORDER_STATUS_COPY[status].label.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const onArchive = async () => {
    if (!order.data) return;

    setAction("archive");
    setSaving(true);
    try {
      await archiveOrder(order.data.id);
      toast.success("Archived. It is off the orders list, and one click puts it back.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const onRestore = async () => {
    if (!order.data) return;

    setAction("restore");
    setSaving(true);
    try {
      await restoreOrder(order.data.id);
      toast.success("Back on the orders list.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!order.data) return;

    setAction("delete");
    setSaving(true);
    try {
      const gone = await deleteOrder(order.data.id);
      setRemoved(true);
      setConfirmingDelete(false);
      navigate(routes.ORDERS, { replace: true });
      toast.success(
        gone.reviewsDeleted > 0
          ? `${gone.orderNumber} deleted, along with ${gone.reviewsDeleted} review${
              gone.reviewsDeleted === 1 ? "" : "s"
            } written from it.`
          : `${gone.orderNumber} deleted.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  };

  if (removed) return null;

  if (order.error) return <ErrorState error={order.error} onRetry={order.refetch} />;

  if (order.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const data = order.data;
  if (!data) {
    return (
      <ErrorState
        error={new Error("That order does not exist.")}
        onRetry={() => navigate(routes.ORDERS)}
      />
    );
  }

  const payment = paymentMethodCopy(data.paymentMethod);
  const arithmeticHolds = data.subtotal + data.deliveryCharge === data.total;
  const archived = data.archivedAt !== undefined;

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Print-only letterhead — the sidebar and top bar carrying the shop's
          name are hidden while printing (see AdminLayout.tsx). */}
      <div className="hidden print:mb-6 print:block">
        <p className="font-display text-xl text-ink">Velora Wears</p>
        <p className="text-xs text-ink-soft">Order receipt</p>
      </div>

      <PageHeader
        title={data.customer.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{data.orderNumber}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDateTime(data.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{data.isGuest ? "Guest checkout" : "Signed-in customer"}</span>
            {archived && (
              <Badge tone="neutral" className="print:hidden">
                Archived
              </Badge>
            )}
          </span>
        }
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              Print receipt
            </Button>
            <Link to={routes.ORDERS} className={buttonClasses({ variant: "secondary" })}>
              Back to orders
            </Link>
          </div>
        }
      />

      <div className="grid items-start gap-6 print:grid-cols-[1.5fr_1fr] print:gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* --- What was bought --------------------------------------- */}
          <Card padded={false}>
            <div className="p-5 print:p-3 sm:p-6 sm:pb-4">
              <CardHeader
                title="Items"
                description="What the customer bought, at the price they were charged."
              />
            </div>

            <ul className="divide-y divide-line border-t border-line">
              {(data.items ?? []).map((item, index) => (
                <li
                  key={`${item.productId}-${item.size}-${index}`}
                  className="flex items-center gap-4 px-5 py-4 print:px-3 print:py-2 sm:px-6"
                >
                  <Thumb
                    src={item.thumb}
                    alt={item.name}
                    width={44}
                    height={58}
                    className="h-14 w-11 shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {orderLineSize(item)} · {item.qty} ×{" "}
                      {formatPrice(item.unitPrice)}
                    </p>
                  </div>

                  <p className="shrink-0 text-sm font-medium text-ink tabular-nums">
                    {formatPrice(item.unitPrice * item.qty)}
                  </p>
                </li>
              ))}
            </ul>

            {/* --- The arithmetic ------------------------------------- */}
            <dl className="space-y-2 border-t border-line bg-surface-raised px-5 py-4 text-sm print:px-3 print:py-3 sm:px-6">
              <Row label="Subtotal" value={formatPrice(data.subtotal)} />
              <Row
                label="Delivery"
                value={
                  data.deliveryCharge === 0 ? "Free" : formatPrice(data.deliveryCharge)
                }
              />
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
                <dt className="font-medium text-ink">Total</dt>
                <dd className="font-display text-lg text-ink tabular-nums">
                  {formatPrice(data.total)}
                </dd>
              </div>
            </dl>

            {!arithmeticHolds && (
              <p className="border-t border-danger/20 bg-danger/8 px-5 py-3 text-xs leading-relaxed text-danger sm:px-6">
                This order's subtotal and delivery charge do not add up to its
                total. Nothing in the shop or this dashboard can produce that —
                it means the row has been edited outside the checkout that wrote
                it. Do not act on this order until it has been looked at.
              </p>
            )}

            <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-muted sm:px-6">
              {payment.label}. {payment.amountLabel}: {formatPrice(data.total)}.{" "}
              {/* How the money works in this dashboard, addressed to the person
                  at the keyboard. The courier reading the slip in the parcel is
                  owed the sentence above it and nothing else — and this is the
                  longest block of text on the page, so it is also the cheapest
                  thing to leave off the sheet. */}
              <span className="print:hidden">
                These figures were computed by the shop's server when the order
                was placed — they are not editable here, and the items are a
                snapshot, so repricing a product later does not change what this
                customer paid.
              </span>
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          {/* --- Status ------------------------------------------------ */}
          <Card className="print:hidden">
            <CardHeader title="Status" />

            <div className="mt-4 flex items-center gap-3">
              <OrderStatusBadge status={data.status} />
              <span className="text-xs text-ink-muted">
                Updated {formatDateTime(data.updatedAt)}
              </span>
            </div>

            {archived ? (
              // Not a disabled dropdown: a control that cannot be used should
              // say why rather than sit there greyed out. The database enforces
              // this too — only a delivered or cancelled order may be archived,
              // so moving this one anywhere would violate that check.
              <p className="mt-4 rounded-lg border border-line bg-surface-sunken px-3.5 py-3 text-xs leading-relaxed text-ink-soft">
                This order is archived, so its status is fixed where it is.
                Restore it below to move it again.
              </p>
            ) : (
              <Select
                className="mt-4"
                label="Move this order to"
                value={data.status}
                disabled={saving}
                onChange={(value) => void onStatus(value as OrderStatus)}
                options={ORDER_STATUSES.map((status) => ({
                  value: status,
                  label: ORDER_STATUS_COPY[status].label,
                }))}
                hint={ORDER_STATUS_COPY[data.status].hint}
              />
            )}
          </Card>

          {/* --- Filing ------------------------------------------------ */}
          <Card className="print:hidden">
            <CardHeader
              title="Filing"
              description="Taking this order off the dashboard — reversibly, or for good."
            />

            {/* The reversible half. It changes with the order; the delete
                below it does not, which is why they are separate blocks. */}
            {archived ? (
              <div className="mt-4 space-y-4">
                <p className="text-xs leading-relaxed text-ink-soft">
                  Archived {formatDateTime(data.archivedAt!)}. It is out of the
                  orders list, and nothing else about it has changed: the
                  customer still sees it in their order history, and it still
                  counts towards the shop&apos;s revenue.
                </p>

                <Button
                  variant="secondary"
                  icon={<RestoreIcon className="h-4 w-4" />}
                  loading={saving && action === "restore"}
                  disabled={saving}
                  onClick={() => void onRestore()}
                >
                  Put back on the orders list
                </Button>
              </div>
            ) : canArchive(data.status) ? (
              <div className="mt-4 space-y-4">
                <p className="text-xs leading-relaxed text-ink-soft">
                  Archiving takes this order off the orders list without
                  deleting anything — the record stays, the customer keeps
                  seeing it, and the revenue figures do not move.
                </p>

                <Button
                  variant="secondary"
                  icon={<ArchiveIcon className="h-4 w-4" />}
                  loading={saving && action === "archive"}
                  disabled={saving}
                  onClick={() => void onArchive()}
                >
                  Archive this order
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-xs leading-relaxed text-ink-soft">
                Only a delivered or cancelled order can be archived. This one is
                still open, and filing away work that has not finished would
                take it off the list while the count on the Orders tab went on
                including it. Move it to Delivered or Cancelled first.
              </p>
            )}

            {/* --- and the half that is always here --------------------- */}
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs leading-relaxed text-ink-soft">
                Deleting removes the order for good: its items, and any reviews
                the customer wrote from it, go with it, and it disappears from
                their order history and from the shop&apos;s revenue figures.
                What is left behind is a line in the shop&apos;s deletion record
                — the order number, its total and who removed it — so the gap in
                the takings can still be accounted for.
              </p>

              <Button
                variant="danger"
                className="mt-3"
                icon={<TrashIcon className="h-4 w-4" />}
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >
                Delete permanently
              </Button>
            </div>
          </Card>

          {/* --- Customer ---------------------------------------------- */}
          <Card>
            <CardHeader
              title="Customer"
              description="Given at checkout. Handle it as personal data."
            />

            <dl className="mt-5 space-y-4">
              <Detail label="Name">{data.customer.fullName}</Detail>

              <Detail label="Phone">
                <CopyableValue value={data.customer.phone}>
                  <a
                    href={`tel:${data.customer.phone}`}
                    className="text-ink underline-offset-2 hover:text-accent hover:underline"
                  >
                    {data.customer.phone}
                  </a>
                </CopyableValue>
              </Detail>

              <Detail label="Email">
                <CopyableValue value={data.customer.email}>
                  <a
                    href={`mailto:${data.customer.email}`}
                    className="break-all text-ink underline-offset-2 hover:text-accent hover:underline"
                  >
                    {data.customer.email}
                  </a>
                </CopyableValue>
              </Detail>

              <Detail label="Delivery address">
                <CopyableValue
                  value={[
                    data.customer.address,
                    data.customer.city,
                    data.customer.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                >
                  <span className="whitespace-pre-line">
                    {data.customer.address}
                    {"\n"}
                    {data.customer.city}
                    {data.customer.postalCode ? ` ${data.customer.postalCode}` : ""}
                  </span>
                </CopyableValue>
              </Detail>

              {data.customer.notes && (
                <Detail label="Notes from the customer">
                  <span className="whitespace-pre-line">{data.customer.notes}</span>
                </Detail>
              )}
            </dl>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void onDelete()}
        loading={saving && action === "delete"}
        title={`Delete ${data.orderNumber} permanently?`}
        message={
          <>
            This erases the order, the {(data.items ?? []).length} line
            {(data.items ?? []).length === 1 ? "" : "s"} on it, and any reviews
            the customer wrote from it. It disappears from their order history
            in the shop and from the shop&apos;s revenue figures, and it cannot
            be undone.
            <br />
            <br />
            {!canArchive(data.status) ? (
              <>
                This order has not been fulfilled yet — it is still{" "}
                {ORDER_STATUS_COPY[data.status].label.toLowerCase()}. Deleting
                it is not the same as cancelling it: no stock comes back, and
                the customer is left with nothing to point at if they ask what
                happened. Cancel it first unless the record itself has to go.
              </>
            ) : archived ? (
              <>
                It is already archived, so it is off the orders list and out of
                your way. Deleting is only worth doing if the record itself has
                to go.
              </>
            ) : (
              <>
                If you only want it off the orders list, archive it instead —
                that keeps the record and can be undone.
              </>
            )}
          </>
        }
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-ink tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * A value with a copy button.
 *
 * Small, and the most-used control on this screen in practice: an admin
 * arranging a courier is copying a phone number and an address, and retyping
 * either one by hand is where a delivery goes to the wrong house.
 */
function CopyableValue({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <span className="flex items-start gap-2">
      <span className="min-w-0 flex-1">{children}</span>
      <Button
        variant="ghost"
        size="sm"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
        className="-mt-1 shrink-0 px-2 print:hidden"
      >
        <CopyIcon className="h-3.5 w-3.5" />
        <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </span>
  );
}
