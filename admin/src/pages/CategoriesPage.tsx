import { useState } from "react";
import { Link } from "react-router-dom";

import type { Category } from "@shared/types";
import { PRODUCT_IMAGE } from "@shared/media";
import { Button } from "@admin/components/ui/Button";
import { Card, PageHeader } from "@admin/components/ui/Card";
import { Badge } from "@admin/components/ui/Badge";
import { Field, Switch } from "@admin/components/ui/Field";
import { ConfirmDialog, Modal } from "@admin/components/ui/Modal";
import { ReorderControls, move } from "@admin/components/ui/Reorder";
import { EmptyState, ErrorState, Skeleton } from "@admin/components/ui/Skeleton";
import { Thumb } from "@admin/components/ui/Thumb";
import { ImageDrop, type UploadStage } from "@admin/components/ui/ImageDrop";
import { useToast } from "@admin/components/ui/Toast";
import { CategoriesIcon, EditIcon, PlusIcon, TrashIcon } from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import {
  CATEGORY_LIST_KEY,
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  setCategoryActive,
  updateCategory,
  uploadCategoryThumb,
  type CategoryInput,
} from "@admin/services/categories";
import { SLUG_HINT, isValidSlug, slugify } from "@admin/lib/slug";
import { formatPieceCount } from "@admin/lib/format";
import * as routes from "@admin/lib/routes";

/**
 * Categories (requirements section 8, §5).
 *
 * A small table with a big consequence: `sort_order` here IS the order of the
 * category strip on the shop's landing page and of the chips above the product
 * grid, and `active` decides whether a category appears there at all. So the
 * list is presented in its display order and reordered in place, rather than
 * being sorted by name with a number field to fill in.
 *
 * ---------------------------------------------------------------------------
 * A CATEGORY CANNOT BE RENAMED AT ITS SLUG, AND CANNOT BE DELETED WHILE FULL
 * ---------------------------------------------------------------------------
 * The slug is a public URL (`/products?category=shirts`) and the primary key
 * that `products.category_slug` points at. The display NAME is free to change
 * whenever; the slug is fixed at creation, and the form says so instead of
 * offering an edit that would break every existing link.
 *
 * Deletion is refused by the database while any product still points at the
 * category — including retired ones. That is correct, and the dialog explains
 * it rather than surfacing a foreign key error.
 */
export function CategoriesPage() {
  const toast = useToast();
  const categories = useQuery(CATEGORY_LIST_KEY, ["categories"], listCategories);

  const [editing, setEditing] = useState<Category | "new">();
  const [pendingDelete, setPendingDelete] = useState<Category>();
  const [deleting, setDeleting] = useState(false);
  const [order, setOrder] = useState<Category[]>();

  const list = order ?? categories.data ?? [];

  const onMove = async (from: number, to: number) => {
    const next = move(list, from, to);
    setOrder(next);

    try {
      await reorderCategories(next.map((category) => category.slug));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setOrder(undefined);
    }
  };

  const onToggle = async (category: Category) => {
    const next = !(category.active ?? true);
    try {
      await setCategoryActive(category.slug, next);
      setOrder(undefined);
      toast.success(
        next
          ? `${category.name} is shown in the shop`
          : `${category.name} is hidden. Its products stay live unless you hide them too.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      categories.refetch();
    }
  };

  const onDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    try {
      await deleteCategory(pendingDelete.slug, pendingDelete.thumb);
      setOrder(undefined);
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
        title="Categories"
        description="How the shop is divided up. This order is the order customers see, on the landing page and above the product grid."
        action={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon className="h-4 w-4" />
            New category
          </Button>
        }
      />

      <Card padded={false}>
        {categories.error ? (
          <ErrorState error={categories.error} onRetry={categories.refetch} />
        ) : categories.loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<CategoriesIcon />}
            title="No categories yet"
            description="Every product belongs to a category, so the shop needs at least one — Shirts, Hoodies, Trousers, whatever the collection is divided into."
            action={
              <Button size="sm" onClick={() => setEditing("new")}>
                <PlusIcon className="h-4 w-4" />
                New category
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((category, index) => {
              const active = category.active ?? true;

              return (
                <li
                  key={category.slug}
                  className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5"
                >
                  <Thumb
                    src={category.thumb}
                    alt={category.name}
                    width={64}
                    height={64}
                    className="h-14 w-14 shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{category.name}</span>
                      {!active && <Badge tone="neutral">Hidden</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      /{category.slug}
                      {category.description ? ` · ${category.description}` : ""}
                    </p>
                  </div>

                  <Link
                    to={routes.productsInCategoryPath(category.slug)}
                    className="shrink-0 text-xs text-ink-soft underline-offset-2 hover:text-accent hover:underline"
                  >
                    {formatPieceCount(category.productCount)}
                  </Link>

                  <ReorderControls
                    index={index}
                    count={list.length}
                    onMove={(from, to) => void onMove(from, to)}
                    label={category.name}
                  />

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void onToggle(category)}
                      aria-label={active ? `Hide ${category.name}` : `Show ${category.name}`}
                      className="rounded-md px-2 py-1.5 text-xs text-ink-soft transition hover:bg-surface-sunken hover:text-ink"
                    >
                      {active ? "Hide" : "Show"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditing(category)}
                      aria-label={`Edit ${category.name}`}
                      className="rounded-md p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
                    >
                      <EditIcon className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setPendingDelete(category)}
                      aria-label={`Delete ${category.name}`}
                      className="rounded-md p-2 text-ink-muted transition hover:bg-danger/10 hover:text-danger"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && (
        <CategoryDialog
          category={editing === "new" ? undefined : editing}
          existingSlugs={list.map((category) => category.slug)}
          nextSortOrder={list.length}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setOrder(undefined);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(undefined)}
        onConfirm={() => void onDelete()}
        loading={deleting}
        title={`Delete ${pendingDelete?.name ?? "this category"}?`}
        message={
          pendingDelete && pendingDelete.productCount > 0 ? (
            <>
              This category still holds {formatPieceCount(pendingDelete.productCount)},
              and the database will refuse to delete it while it does — a product
              cannot exist without a category. Move those products first, or hide
              the category instead.
            </>
          ) : (
            "The category and its tile image are removed. This cannot be undone."
          )
        }
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The create/edit dialog
 * ------------------------------------------------------------------------ */

function CategoryDialog({
  category,
  existingSlugs,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  category?: Category;
  existingSlugs: string[];
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !category;

  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugPinned, setSlugPinned] = useState(!isNew);
  const [description, setDescription] = useState(category?.description ?? "");
  const [active, setActive] = useState(category?.active ?? true);
  const [thumb, setThumb] = useState<string | undefined>(category?.thumb);

  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState<UploadStage>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const slugError = !slug.trim()
    ? "A category needs a web address."
    : !isValidSlug(slug.trim())
      ? "Lowercase letters, numbers and single hyphens only."
      : isNew && existingSlugs.includes(slug.trim())
        ? "A category already uses that address."
        : undefined;

  const onUpload = async (files: File[]) => {
    const target = slug.trim() || "new";
    setUploading(true);
    try {
      const url = await uploadCategoryThumb(target, files[0], setStage);
      setThumb(url);
      toast.success("Tile image uploaded");
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(false);
      setStage(undefined);
    }
  };

  const onSave = async () => {
    if (!name.trim()) {
      setError("A category needs a name.");
      return;
    }
    if (slugError) {
      setError(slugError);
      return;
    }

    const input: CategoryInput = {
      slug: slug.trim(),
      name: name.trim(),
      description,
      sortOrder: category?.sortOrder ?? nextSortOrder,
      active,
      thumb: thumb ?? null,
    };

    setSaving(true);
    setError(undefined);
    try {
      if (isNew) await createCategory(input);
      else await updateCategory(category.slug, input);

      toast.success(isNew ? `${input.name} created` : "Saved");
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!saving}
      title={isNew ? "New category" : `Edit ${category.name}`}
      description={
        isNew
          ? "Shirts, Hoodies, Winter collection — however the shop is divided up."
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void onSave()} loading={saving}>
            {isNew ? "Create category" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Name"
          value={name}
          onChange={(value) => {
            setName(value);
            if (!slugPinned) setSlug(slugify(value));
          }}
          maxLength={60}
          placeholder="Winter collection"
          autoFocus
        />

        {isNew ? (
          <Field
            label="Web address (slug)"
            value={slug}
            onChange={(value) => {
              setSlugPinned(true);
              setSlug(value);
            }}
            error={slug ? slugError : undefined}
            prefix="/products?category="
            maxLength={60}
            hint={SLUG_HINT}
          />
        ) : (
          <div>
            <p className="text-xs font-medium text-ink-soft">Web address</p>
            <p className="mt-1.5 rounded-lg border border-line bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
              /products?category={category.slug}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              Fixed once a category exists. It is the address customers, links
              and search engines already have — renaming it would break all of
              them. The display name above can change freely.
            </p>
          </div>
        )}

        <Field
          label="One line of copy"
          value={description}
          onChange={setDescription}
          optional
          multiline
          rows={2}
          maxLength={200}
          placeholder="Heavyweight layers for the cold months."
          hint="Shown on the category tile and at the top of the category listing."
        />

        <div>
          <p className="text-xs font-medium text-ink-soft">Tile image</p>
          <div className="mt-1.5 flex items-start gap-4">
            <Thumb
              src={thumb}
              alt={name || "Category tile"}
              width={PRODUCT_IMAGE.thumb.width}
              height={PRODUCT_IMAGE.thumb.height}
              className="h-24 w-20 shrink-0"
            />
            <ImageDrop
              className="flex-1"
              busy={uploading}
              stage={stage}
              onFiles={(files) => void onUpload(files)}
              onReject={toast.error}
              label={thumb ? "Replace tile image" : "Add a tile image"}
              hint="Optional. Shown on the landing page's category strip."
            />
          </div>
        </div>

        <Switch
          label="Shown in the shop"
          checked={active}
          onChange={setActive}
          description="Hidden categories disappear from the shop's navigation. Products inside them keep their own visibility — hide those separately if you want them gone too."
        />

        {error && (
          <p role="alert" className="text-sm leading-relaxed text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
