import { useMemo, useState } from "react";

import type { Category, Discount, DiscountKind, DiscountScope, ProductSummary } from "@shared/types";
import {
  MAX_DISCOUNT_PERCENT,
  MIN_DISCOUNT_PERCENT,
  discountState,
  priceAfter,
  validateDiscount,
  type DiscountState,
} from "@shared/discounts";
import { categorySelectOptions } from "@admin/lib/categoryOptions";
import { Badge, type BadgeTone } from "@admin/components/ui/Badge";
import { Button } from "@admin/components/ui/Button";
import { Card, PageHeader } from "@admin/components/ui/Card";
import { Field, Switch } from "@admin/components/ui/Field";
import { ConfirmDialog, Modal } from "@admin/components/ui/Modal";
import { Select } from "@admin/components/ui/Select";
import { EmptyState, ErrorState, Skeleton } from "@admin/components/ui/Skeleton";
import { useToast } from "@admin/components/ui/Toast";
import { DiscountsIcon, EditIcon, PlusIcon, TrashIcon } from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import { CATEGORY_LIST_KEY, listCategories } from "@admin/services/categories";
import { listProducts, productListKey } from "@admin/services/products";
import {
  DISCOUNT_LIST_KEY,
  createDiscount,
  deleteDiscount,
  listDiscounts,
  setDiscountActive,
  updateDiscount,
  type DiscountInput,
} from "@admin/services/discounts";
import { formatDate, formatPrice } from "@admin/lib/format";

/**
 * Discounts — the screen the client asked for: put a category on offer, or one
 * piece, for a stated number of days.
 *
 * `shared/discounts.ts` is the contract behind it and explains the rules this
 * screen is a face for. The two worth knowing while reading the form:
 *
 *  1. **Nothing here edits a price.** A discount is a rule. No product row is
 *     touched when a sale starts or ends, so there is no "put the prices back"
 *     step that can fail to run — see `services/discounts.ts`.
 *  2. **Offers do not stack.** A shirt caught by "10% off shirts" and "50% off
 *     this shirt" gets 50% off, not 55%. The form says so where an admin is
 *     most likely to create the overlap, because the alternative is finding out
 *     from a customer.
 *
 * ---------------------------------------------------------------------------
 * THE DATES ARE DAYS, NOT TIMESTAMPS
 * ---------------------------------------------------------------------------
 * "Seven days" is how the client described this and how shops think about it,
 * so the form takes two dates and translates. A start date means the beginning
 * of that day; an end date means the END of that day, so a sale set to end on
 * the 19th runs through the 19th and is over on the 20th. Stored as an
 * exclusive bound (midnight on the 20th), which is the only reading with no
 * ambiguous half-day in it.
 *
 * Both are optional and the common case is neither: a sale that starts now and
 * runs until somebody stops it.
 */

const SCOPE_OPTIONS: ReadonlyArray<{ value: DiscountScope; label: string }> = [
  { value: "category", label: "A category" },
  { value: "product", label: "One product" },
  { value: "all", label: "Everything in the shop" },
];

const KIND_OPTIONS: ReadonlyArray<{ value: DiscountKind; label: string }> = [
  { value: "percent", label: "Percentage off" },
  { value: "amount", label: "Rupees off" },
];

const STATE_BADGE: Record<DiscountState, { label: string; tone: BadgeTone }> = {
  live: { label: "Running", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
  off: { label: "Off", tone: "neutral" },
};

/** Every product, for the picker. Bounded, and the shop is not a warehouse. */
const PRODUCT_PICKER = { sort: "name" as const, pageSize: 200, status: "all" as const };

export function DiscountsPage() {
  const toast = useToast();

  const discounts = useQuery(DISCOUNT_LIST_KEY, ["discounts"], listDiscounts);
  const categories = useQuery(CATEGORY_LIST_KEY, ["categories"], listCategories);
  const products = useQuery(productListKey(PRODUCT_PICKER), ["products"], () =>
    listProducts(PRODUCT_PICKER),
  );

  const [editing, setEditing] = useState<Discount | "new">();
  const [pendingDelete, setPendingDelete] = useState<Discount>();
  const [deleting, setDeleting] = useState(false);

  const list = discounts.data ?? [];
  const categoryList = categories.data ?? [];
  const productList = products.data?.rows ?? [];

  const onToggle = async (discount: Discount) => {
    try {
      await setDiscountActive(discount.id, !discount.active);
      toast.success(
        discount.active
          ? `${discount.name} stopped. Prices are back to normal.`
          : `${discount.name} is running. The shop is showing the reduced prices now.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      discounts.refetch();
    }
  };

  const onDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    try {
      await deleteDiscount(pendingDelete.id);
      toast.success(`${pendingDelete.name} deleted`);
      setPendingDelete(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discounts"
        description="Put a category or a single product on offer for as long as you choose. The shop shows the reduced price with the old one struck through, and stops by itself on the end date — nothing here changes a product's own price."
        action={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon className="h-4 w-4" />
            New discount
          </Button>
        }
      />

      <Card padded={false}>
        {discounts.error ? (
          <ErrorState error={discounts.error} onRetry={discounts.refetch} />
        ) : discounts.loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<DiscountsIcon />}
            title="No discounts yet"
            description="A discount takes a percentage or a fixed amount off everything in a category, off one particular product, or off the whole shop — for a week, a weekend, or until you stop it."
            action={
              <Button size="sm" onClick={() => setEditing("new")}>
                <PlusIcon className="h-4 w-4" />
                New discount
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((discount) => (
              <DiscountRow
                key={discount.id}
                discount={discount}
                categories={categoryList}
                products={productList}
                onEdit={() => setEditing(discount)}
                onToggle={() => void onToggle(discount)}
                onDelete={() => setPendingDelete(discount)}
              />
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <DiscountDialog
          discount={editing === "new" ? undefined : editing}
          categories={categoryList}
          products={productList}
          onClose={() => setEditing(undefined)}
          onSaved={() => setEditing(undefined)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(undefined)}
        onConfirm={() => void onDelete()}
        loading={deleting}
        title={`Delete ${pendingDelete?.name ?? "this discount"}?`}
        message="Prices go back to normal immediately. Orders already placed keep the price they were charged, so nothing about them changes. If you might run this offer again, switch it off instead."
        confirmLabel="Delete"
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * One row
 * ------------------------------------------------------------------------ */

/** What this discount applies to, in words — "Shirts", "Meridian Oxford Shirt". */
function targetLabel(
  discount: Discount,
  categories: readonly Category[],
  products: readonly ProductSummary[],
): string {
  switch (discount.scope) {
    case "all":
      return "Everything in the shop";
    case "category": {
      const found = categories.find((c) => c.slug === discount.categorySlug);
      return found ? found.name : (discount.categorySlug ?? "A category");
    }
    case "product": {
      const found = products.find((p) => p.id === discount.productId);
      return found ? found.name : "One product";
    }
    default:
      return "";
  }
}

/** "10% off", "Rs 500 off". */
function amountLabel(discount: Discount): string {
  return discount.kind === "percent"
    ? `${discount.value}% off`
    : `${formatPrice(discount.value)} off`;
}

/**
 * The dates, read the way they were entered.
 *
 * `endsAt` is stored as an EXCLUSIVE bound — midnight at the start of the day
 * after the sale — so it is shown as the day before, which is the last day the
 * offer actually runs and the date the admin typed.
 */
function scheduleLabel(discount: Discount): string {
  const from = discount.startsAt !== undefined ? formatDate(discount.startsAt) : null;
  const to = discount.endsAt !== undefined ? formatDate(discount.endsAt - 1) : null;

  if (from && to) return `${from} – ${to}`;
  if (to) return `Until ${to}`;
  if (from) return `From ${from}`;
  return "No end date";
}

function DiscountRow({
  discount,
  categories,
  products,
  onEdit,
  onToggle,
  onDelete,
}: {
  discount: Discount;
  categories: readonly Category[];
  products: readonly ProductSummary[];
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const state = discountState(discount);
  const badge = STATE_BADGE[state];

  return (
    <li className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-ink">{discount.name}</p>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {amountLabel(discount)} &middot; {targetLabel(discount, categories, products)}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">{scheduleLabel(discount)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/*
          The switch first, because stopping a sale in a hurry is the thing an
          admin most often comes to this screen to do — and it is one click,
          with no form to re-confirm.
        */}
        <Switch
          checked={discount.active}
          onChange={onToggle}
          label={discount.active ? "Running" : "Off"}
          className="mr-2"
        />
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${discount.name}`}>
          <EditIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          aria-label={`Delete ${discount.name}`}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------------------
 * The form
 * ------------------------------------------------------------------------ */

/** `2026-09-19` — what a native date input reads and writes. */
function toDateInput(timestamp: number | undefined, endExclusive = false): string {
  if (timestamp === undefined) return "";
  const date = new Date(endExclusive ? timestamp - 1 : timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The START of that day, in the admin's own timezone. Empty is "no date". */
function startOfDay(value: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/**
 * The END of that day — midnight at the start of the NEXT one.
 *
 * A sale that ends "on the 19th" runs through the 19th. Storing the 19th at
 * midnight instead would end it before the day it names had begun, which is the
 * off-by-one every date range gets wrong once.
 */
function endOfDay(value: string): number | null {
  const start = startOfDay(value);
  if (start === null) return null;
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  return next.getTime();
}

function DiscountDialog({
  discount,
  categories,
  products,
  onClose,
  onSaved,
}: {
  discount?: Discount;
  categories: readonly Category[];
  products: readonly ProductSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editing = Boolean(discount);

  const [name, setName] = useState(discount?.name ?? "");
  const [scope, setScope] = useState<DiscountScope>(discount?.scope ?? "category");
  const [categorySlug, setCategorySlug] = useState(discount?.categorySlug ?? "");
  const [productId, setProductId] = useState(discount?.productId ?? "");
  const [kind, setKind] = useState<DiscountKind>(discount?.kind ?? "percent");
  const [value, setValue] = useState(discount ? String(discount.value) : "10");
  const [startsOn, setStartsOn] = useState(toDateInput(discount?.startsAt));
  const [endsOn, setEndsOn] = useState(toDateInput(discount?.endsAt, true));
  const [active, setActive] = useState(discount?.active ?? true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const numericValue = Number(value);

  const input: DiscountInput = {
    name,
    scope,
    categorySlug: categorySlug || null,
    productId: productId || null,
    kind,
    value: numericValue,
    startsAt: startOfDay(startsOn),
    endsAt: endOfDay(endsOn),
    active,
  };

  /**
   * The offer applied to a real price from the catalogue, so the admin can see
   * what they are actually about to do.
   *
   * A percentage is abstract — "30% off" is a number until it is 30% off
   * something — and a FIXED amount is worse: Rs 500 off is a gentle discount on
   * a coat and most of the price of a t-shirt. Showing it against the cheapest
   * piece it would touch is the case worth checking, because that is where a
   * fixed amount does damage.
   */
  const preview = useMemo(() => {
    if (!Number.isFinite(numericValue) || numericValue <= 0) return undefined;

    const affected =
      scope === "product"
        ? products.filter((p) => p.id === productId)
        : scope === "category"
          ? products.filter((p) => p.categorySlug === categorySlug)
          : products;

    const cheapest = affected.reduce<ProductSummary | undefined>(
      (low, p) => (low === undefined || p.price < low.price ? p : low),
      undefined,
    );
    if (!cheapest) return undefined;

    return {
      name: cheapest.name,
      before: cheapest.price,
      after: priceAfter(cheapest.price, kind, numericValue),
      count: affected.length,
    };
  }, [scope, categorySlug, productId, kind, numericValue, products]);

  const save = async () => {
    const found = validateDiscount(input);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      if (discount) await updateDiscount(discount.id, input);
      else await createDiscount(input);

      toast.success(discount ? `${name.trim()} saved` : `${name.trim()} created`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!saving}
      size="lg"
      title={editing ? "Edit discount" : "New discount"}
      description="Nothing here changes a product's own price. The shop works the reduced price out from this rule, and goes back to normal the moment the rule stops."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {editing ? "Save discount" : "Create discount"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Name"
          value={name}
          onChange={setName}
          error={errors.name}
          hint="Only you see this. Something you will recognise in the list — “Eid weekend”, “Shirts clearance”."
          maxLength={80}
          autoFocus
        />

        <Select<DiscountScope>
          label="Applies to"
          value={scope}
          options={SCOPE_OPTIONS}
          onChange={setScope}
          hint="A category includes everything filed under it, subcategories and all."
        />

        {scope === "category" && (
          <Select
            label="Category"
            value={categorySlug}
            options={[
              { value: "", label: "Choose a category", disabled: true },
              ...categorySelectOptions(categories),
            ]}
            onChange={setCategorySlug}
            hint={errors.target}
          />
        )}

        {scope === "product" && (
          <Select
            label="Product"
            value={productId}
            options={[
              { value: "", label: "Choose a product", disabled: true },
              ...products.map((product) => ({
                value: product.id,
                label: `${product.name} — ${formatPrice(product.price)}`,
              })),
            ]}
            onChange={setProductId}
            hint={errors.target}
          />
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Select<DiscountKind>
            label="Discount type"
            value={kind}
            options={KIND_OPTIONS}
            onChange={setKind}
          />

          <Field
            label={kind === "percent" ? "Percentage off" : "Rupees off"}
            value={value}
            onChange={setValue}
            error={errors.value}
            type="number"
            inputMode="numeric"
            min={kind === "percent" ? MIN_DISCOUNT_PERCENT : 1}
            max={kind === "percent" ? MAX_DISCOUNT_PERCENT : undefined}
            step={1}
            prefix={kind === "amount" ? "Rs" : undefined}
            suffix={kind === "percent" ? "%" : undefined}
          />
        </div>

        {preview && (
          <p className="rounded-lg bg-surface-sunken px-4 py-3 text-sm text-ink-soft">
            The cheapest piece this touches is <span className="text-ink">{preview.name}</span>, at{" "}
            {formatPrice(preview.before)}. It would sell for{" "}
            <span className="font-medium text-ink">{formatPrice(preview.after)}</span>.
            {preview.count > 1 && ` ${preview.count} products are affected in total.`}
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Starts"
            value={startsOn}
            onChange={setStartsOn}
            type="date"
            optional
            hint="Leave blank to start straight away."
          />
          <Field
            label="Last day"
            value={endsOn}
            onChange={setEndsOn}
            type="date"
            optional
            error={errors.endsAt}
            hint="The offer runs through this day and stops by itself. Leave blank to run until you switch it off."
          />
        </div>

        <Switch
          checked={active}
          onChange={setActive}
          label="Running"
          description="Switch off to keep the discount without applying it — useful for an offer you plan to run again."
        />

        {/*
          The one thing about this feature that surprises people, stated where
          the overlap is created rather than discovered later from a customer.
        */}
        <p className="text-xs leading-relaxed text-ink-muted">
          If more than one discount covers the same product, the customer gets the biggest single
          one — they are never added together.
        </p>
      </div>
    </Modal>
  );
}
