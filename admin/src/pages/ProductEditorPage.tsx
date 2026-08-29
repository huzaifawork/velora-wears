import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { Category, Size } from "@shared/types";
import { SIZES, SIZE_LABELS, stockLevel } from "@shared/stock";
import { Button, buttonClasses } from "@admin/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@admin/components/ui/Card";
import { Badge, StockBadge } from "@admin/components/ui/Badge";
import { Field, Switch } from "@admin/components/ui/Field";
import { Select } from "@admin/components/ui/Select";
import { ErrorState, Skeleton } from "@admin/components/ui/Skeleton";
import { useToast } from "@admin/components/ui/Toast";
import { ExternalIcon } from "@admin/components/ui/Icons";
import { ProductImages } from "@admin/features/products/ProductImages";
import { useQuery } from "@admin/hooks/useQuery";
import { CATEGORY_LIST_KEY, listCategories } from "@admin/services/categories";
import { SETTINGS_KEY, getSettings } from "@admin/services/settings";
import {
  createProduct,
  getProduct,
  updateProduct,
  type ProductInput,
} from "@admin/services/products";
import type { AdminProductImage } from "@admin/services/rows";
import { SLUG_HINT, isValidSlug, slugify } from "@admin/lib/slug";
import { formatDateTime, formatPrice } from "@admin/lib/format";
import * as routes from "@admin/lib/routes";

/**
 * The product editor — creating and editing (requirements section 8, §11).
 *
 * ---------------------------------------------------------------------------
 * ONE SCREEN FOR BOTH, AND THE ONE DIFFERENCE THAT MATTERS
 * ---------------------------------------------------------------------------
 * Create and edit are the same fields, the same validation and the same save,
 * so they are one component rather than two that drift. The only real
 * difference: IMAGES NEED A PRODUCT TO BELONG TO. `product_images.product_id`
 * is a foreign key and uploads are filed under `products/<id>/`, so there is
 * nowhere to put a photograph until the record exists. Rather than inventing a
 * staging area for a thirty-second gap, the panel says what to do — save, then
 * add images — and the save lands straight on the editor with the gallery
 * enabled.
 *
 * ---------------------------------------------------------------------------
 * WHY VALIDATION IS HERE AT ALL, GIVEN THE DATABASE VALIDATES
 * ---------------------------------------------------------------------------
 * Postgres will refuse a negative price, a duplicate slug and a missing
 * category on its own — those constraints are the real guarantee and this form
 * cannot weaken them. What this adds is TIMING: an error next to the field
 * while the admin is still looking at it, instead of a rejected save after they
 * have moved on. Every rule below has a constraint behind it.
 */

interface Draft {
  name: string;
  slug: string;
  description: string;
  price: string;
  categorySlug: string;
  active: boolean;
  featured: boolean;
  stock: Record<Size, string>;
}

const EMPTY: Draft = {
  name: "",
  slug: "",
  description: "",
  price: "",
  categorySlug: "",
  active: true,
  featured: false,
  stock: { S: "0", M: "0", L: "0" },
};

/**
 * The route. It LOADS, and hands the form its initial values as props.
 *
 * The split is deliberate and it is not cosmetic. A single component would have
 * to seed its fields from a read inside an effect — which renders an empty form
 * first, overwrites it a frame later, and lets an admin type into a field that
 * is about to be replaced underneath them. Mounting the form only once its
 * values exist means the first render it ever does is already correct.
 *
 * `key` is what makes a re-read safe: it changes only when the product does, so
 * refetching after an image upload re-renders the form WITHOUT stamping the
 * database's values over edits the admin has not saved yet.
 */
export function ProductEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();

  const product = useQuery(
    id ? `product:${id}` : "product:new",
    ["products"],
    () => (id ? getProduct(id) : Promise.resolve(null)),
  );
  const categories = useQuery(CATEGORY_LIST_KEY, ["categories"], listCategories);
  const settings = useQuery(SETTINGS_KEY, ["settings"], getSettings);

  if (product.error) {
    return <ErrorState error={product.error} onRetry={product.refetch} />;
  }

  if (categories.loading || (!isNew && product.loading)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!isNew && !product.data) {
    return (
      <ErrorState
        error={new Error("That product no longer exists. It may have been deleted.")}
        onRetry={() => navigate(routes.PRODUCTS)}
      />
    );
  }

  const loaded = product.data;

  const initial: Draft = loaded
    ? {
        name: loaded.name,
        slug: loaded.slug,
        description: loaded.description,
        price: String(loaded.price),
        categorySlug: loaded.categorySlug,
        active: loaded.active,
        featured: loaded.featured ?? false,
        stock: {
          S: String(loaded.sizes.S.stock),
          M: String(loaded.sizes.M.stock),
          L: String(loaded.sizes.L.stock),
        },
      }
    : {
        ...EMPTY,
        // A new product defaults to the first category, so the commonest case
        // is one fewer decision to make.
        categorySlug: categories.data?.[0]?.slug ?? "",
      };

  return (
    <ProductForm
      key={loaded?.id ?? "new"}
      productId={loaded?.id}
      initial={initial}
      images={loaded?.images ?? []}
      updatedAt={loaded?.updatedAt}
      categories={categories.data ?? []}
      lowStockThreshold={settings.data?.lowStockThreshold}
      onImagesChanged={product.refetch}
    />
  );
}

function ProductForm({
  productId,
  initial,
  images,
  updatedAt,
  categories,
  lowStockThreshold,
  onImagesChanged,
}: {
  /** Undefined for a product that does not exist yet. */
  productId?: string;
  initial: Draft;
  images: AdminProductImage[];
  updatedAt?: number;
  categories: Category[];
  lowStockThreshold?: number;
  onImagesChanged: () => void;
}) {
  const isNew = !productId;
  const navigate = useNavigate();
  const toast = useToast();

  const [draft, setDraft] = useState<Draft>(initial);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  /** True once the slug is fixed — after that it stops following the name. */
  const [slugPinned, setSlugPinned] = useState(!isNew);

  const errors = useMemo(() => validate(draft), [draft]);
  const hasErrors = Object.keys(errors).length > 0;

  const show = (field: keyof Draft | string) =>
    touched[field] ? errors[field] : undefined;

  const setField = <K extends keyof Draft>(field: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const onName = (name: string) => {
    setDraft((current) => ({
      ...current,
      name,
      // The slug follows the name only while the record is new AND the slug has
      // not been touched. On a live product it is a public URL — see lib/slug.
      slug: slugPinned ? current.slug : slugify(name),
    }));
  };

  const onSave = async () => {
    setTouched({
      name: true,
      slug: true,
      price: true,
      categorySlug: true,
      description: true,
      stock: true,
    });

    if (hasErrors) {
      toast.error("Some fields still need attention.");
      return;
    }

    const input: ProductInput = {
      name: draft.name,
      slug: draft.slug,
      description: draft.description,
      price: Number(draft.price),
      categorySlug: draft.categorySlug,
      active: draft.active,
      featured: draft.featured,
      stock: {
        S: Number(draft.stock.S),
        M: Number(draft.stock.M),
        L: Number(draft.stock.L),
      },
    };

    setSaving(true);
    try {
      if (isNew) {
        const created = await createProduct(input);
        toast.success(`${input.name} created. Add its photographs next.`);
        navigate(routes.productPath(created), { replace: true });
      } else {
        await updateProduct(productId, input);
        toast.success("Saved");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const totalStock = SIZES.reduce(
    (sum, size) => sum + Math.max(0, Number(draft.stock[size]) || 0),
    0,
  );
  const threshold = lowStockThreshold;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? "New product" : draft.name || "Product"}
        description={
          isNew
            ? "Everything a customer needs to decide: what it is, what it costs, what sizes are left, and what it looks like."
            : updatedAt
              ? `Last saved ${formatDateTime(updatedAt)}`
              : undefined
        }
        action={
          <>
            <Link to={routes.PRODUCTS} className={buttonClasses({ variant: "secondary" })}>
              Back to products
            </Link>
            {!isNew && draft.active && (
              <a
                href={routes.shopProductUrl(draft.slug)}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ variant: "secondary" })}
              >
                <ExternalIcon className="h-4 w-4" />
                View in shop
              </a>
            )}
            <Button onClick={() => void onSave()} loading={saving}>
              {isNew ? "Create product" : "Save changes"}
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {/* --- The record ------------------------------------------- */}
          <Card>
            <CardHeader title="Details" />

            <div className="mt-5 space-y-4">
              <Field
                label="Product name"
                value={draft.name}
                onChange={onName}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                error={show("name")}
                maxLength={120}
                placeholder="Noor Oversized Drop Shoulder Shirt"
              />

              <Field
                label="Web address (slug)"
                value={draft.slug}
                onChange={(value) => {
                  setSlugPinned(true);
                  setField("slug", value);
                }}
                onBlur={() => setTouched((t) => ({ ...t, slug: true }))}
                error={show("slug")}
                maxLength={80}
                prefix="/products/"
                hint={SLUG_HINT}
              />

              <Field
                label="Description"
                value={draft.description}
                onChange={(value) => setField("description", value)}
                onBlur={() => setTouched((t) => ({ ...t, description: true }))}
                error={show("description")}
                multiline
                rows={6}
                maxLength={2000}
                placeholder="The fabric, the fit, and how it wears. Two or three sentences a customer can decide from."
                hint={`${draft.description.length} of 2000 characters`}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={draft.price}
                  onChange={(value) => setField("price", value)}
                  onBlur={() => setTouched((t) => ({ ...t, price: true }))}
                  error={show("price")}
                  prefix="Rs"
                  hint={
                    Number(draft.price) > 0
                      ? `Shown to customers as ${formatPrice(Number(draft.price))}`
                      : "Whole rupees. The shop has no paisa amounts."
                  }
                />

                <Select
                  label="Category"
                  value={draft.categorySlug}
                  onChange={(value) => setField("categorySlug", value)}
                  options={[
                    ...(draft.categorySlug ? [] : [{ value: "", label: "Choose a category" }]),
                    ...categories.map((category) => ({
                      value: category.slug,
                      label: category.active === false ? `${category.name} (hidden)` : category.name,
                    })),
                  ]}
                  hint={
                    categories.length === 0
                      ? "No categories exist yet — create one first."
                      : undefined
                  }
                />
              </div>
            </div>
          </Card>

          {/* --- Photographs ------------------------------------------ */}
          {isNew ? (
            <Card>
              <CardHeader
                title="Photographs"
                description="Available once the product is created — an image has to belong to something."
              />
              <div className="mt-5 rounded-xl border-2 border-dashed border-line-strong bg-surface-raised px-4 py-10 text-center">
                <p className="text-sm text-ink-soft">
                  Create the product first. The gallery opens straight afterwards.
                </p>
              </div>
            </Card>
          ) : (
            <ProductImages
              productId={productId}
              productName={draft.name}
              images={images}
              onChanged={onImagesChanged}
            />
          )}
        </div>

        {/* --- Visibility and stock ---------------------------------- */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Visibility" />

            <div className="mt-5 space-y-4">
              <Switch
                label="Live in the shop"
                checked={draft.active}
                onChange={(value) => setField("active", value)}
                description={
                  draft.active
                    ? "Customers can find and buy this product."
                    : "Hidden from every listing and from its own page. Existing orders are unaffected."
                }
              />

              <Switch
                label="Featured on the landing page"
                checked={draft.featured}
                onChange={(value) => setField("featured", value)}
                description="Appears in the featured strip on the home page. Set the order on the Featured products screen."
              />
            </div>
          </Card>

          {/* --- Per-size stock (requirements section 11) ------------- */}
          <Card>
            <CardHeader
              title="Stock by size"
              description="A size with zero stock is struck out on the product page and cannot be bought."
            />

            <div className="mt-5 space-y-3">
              {SIZES.map((size) => (
                <div key={size} className="flex items-center gap-3">
                  <div className="w-24 shrink-0">
                    <span className="text-sm font-medium text-ink">{SIZE_LABELS[size]}</span>
                  </div>

                  <Field
                    label={`${SIZE_LABELS[size]} stock`}
                    className="flex-1 [&_label]:sr-only"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={draft.stock[size]}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        stock: { ...current.stock, [size]: value },
                      }))
                    }
                    suffix="units"
                  />

                  <div className="w-24 shrink-0 text-right">
                    <Badge
                      tone={
                        stockLevel(Number(draft.stock[size]) || 0, threshold) === "out-of-stock"
                          ? "danger"
                          : stockLevel(Number(draft.stock[size]) || 0, threshold) === "low-stock"
                            ? "warning"
                            : "success"
                      }
                    >
                      {stockLevel(Number(draft.stock[size]) || 0, threshold) === "out-of-stock"
                        ? "Sold out"
                        : stockLevel(Number(draft.stock[size]) || 0, threshold) === "low-stock"
                          ? "Low"
                          : "OK"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {errors.stock && touched.stock && (
              <p className="mt-3 text-xs text-danger">{errors.stock}</p>
            )}

            <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
              <span className="text-sm text-ink-soft">Total across sizes</span>
              <StockBadge quantity={totalStock} threshold={threshold} />
            </div>

            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              Stock is decremented automatically when an order is placed, inside
              the same transaction that writes the order — so two customers
              cannot both buy the last one.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * The form's rules. Each one has a database constraint behind it — this exists
 * for the timing, not for the guarantee.
 */
function validate(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!draft.name.trim()) errors.name = "A product needs a name.";
  else if (draft.name.trim().length < 3) errors.name = "That is too short to be a name.";

  if (!draft.slug.trim()) errors.slug = "A product needs a web address.";
  else if (!isValidSlug(draft.slug.trim()))
    errors.slug = "Lowercase letters, numbers and single hyphens only.";

  if (!draft.description.trim()) errors.description = "Describe the piece — customers buy from this.";

  const price = Number(draft.price);
  if (draft.price.trim() === "") errors.price = "Set a price.";
  else if (!Number.isFinite(price) || price < 0) errors.price = "The price cannot be negative.";
  else if (!Number.isInteger(price)) errors.price = "Prices are whole rupees.";

  if (!draft.categorySlug) errors.categorySlug = "Choose a category.";

  for (const size of SIZES) {
    const value = Number(draft.stock[size]);
    if (draft.stock[size].trim() === "" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      errors.stock = "Stock must be a whole number, zero or more, for every size.";
      break;
    }
  }

  return errors;
}
