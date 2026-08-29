import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { OrderStatus } from "@shared/types";
import { SIZE_LABELS } from "@shared/stock";
import { paymentMethodCopy } from "@shared/payment";
import { Button, buttonClasses } from "@admin/components/ui/Button";
import { Card, CardHeader, Detail, PageHeader } from "@admin/components/ui/Card";
import { OrderStatusBadge } from "@admin/components/ui/Badge";
import { Select } from "@admin/components/ui/Select";
import { ErrorState, Skeleton } from "@admin/components/ui/Skeleton";
import { Thumb } from "@admin/components/ui/Thumb";
import { useToast } from "@admin/components/ui/Toast";
import { CopyIcon } from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COPY,
  getOrder,
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
 */
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const order = useQuery(`order:${id}`, ["orders"], () => getOrder(id!));
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.customer.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{data.orderNumber}</span>
            <span aria-hidden="true">·</span>
            <span>{formatDateTime(data.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{data.isGuest ? "Guest checkout" : "Signed-in customer"}</span>
          </span>
        }
        action={
          <Link to={routes.ORDERS} className={buttonClasses({ variant: "secondary" })}>
            Back to orders
          </Link>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* --- What was bought --------------------------------------- */}
          <Card padded={false}>
            <div className="p-5 sm:p-6 sm:pb-4">
              <CardHeader
                title="Items"
                description="What the customer bought, at the price they were charged."
              />
            </div>

            <ul className="divide-y divide-line border-t border-line">
              {(data.items ?? []).map((item, index) => (
                <li
                  key={`${item.productId}-${item.size}-${index}`}
                  className="flex items-center gap-4 px-5 py-4 sm:px-6"
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
                      {SIZE_LABELS[item.size]} · {item.qty} ×{" "}
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
            <dl className="space-y-2 border-t border-line bg-surface-raised px-5 py-4 text-sm sm:px-6">
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
              {payment.label}. {payment.amountLabel}: {formatPrice(data.total)}. These
              figures were computed by the shop's server when the order was
              placed — they are not editable here, and the items are a snapshot,
              so repricing a product later does not change what this customer
              paid.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          {/* --- Status ------------------------------------------------ */}
          <Card>
            <CardHeader title="Status" />

            <div className="mt-4 flex items-center gap-3">
              <OrderStatusBadge status={data.status} />
              <span className="text-xs text-ink-muted">
                Updated {formatDateTime(data.updatedAt)}
              </span>
            </div>

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
        className="-mt-1 shrink-0 px-2"
      >
        <CopyIcon className="h-3.5 w-3.5" />
        <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </span>
  );
}
