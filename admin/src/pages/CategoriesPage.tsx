import { Fragment, useState } from "react";
import { Link } from "react-router-dom";

import type { Category, SizeScaleId } from "@shared/types";
import { SIZE_SCALE_LIST } from "@shared/sizes";
import { buildCategoryTree, type CategoryNode } from "@shared/categories";
import { PRODUCT_IMAGE } from "@shared/media";
import { Button } from "@admin/components/ui/Button";
import { Card, PageHeader } from "@admin/components/ui/Card";
import { Badge } from "@admin/components/ui/Badge";
import { Field, Switch } from "@admin/components/ui/Field";
import { Select } from "@admin/components/ui/Select";
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
 * Categories and subcategories (requirements section 8, §5).
 *
 * A small table with a big consequence: `sort_order` here IS the order of the
 * category strip on the shop's landing page and of the chips above the product
 * grid, and `active` decides whether a category appears there at all. So the
 * list is presented in its display order and reordered in place, rather than
 * being sorted by name with a number field to fill in.
 *
 * ---------------------------------------------------------------------------
 * TWO LEVELS, SHOWN AS TWO LEVELS
 * ---------------------------------------------------------------------------
 * A category can sit inside another one — "Oxford & Poplin" under "Shirts" —
 * and this screen draws that nesting literally: children are indented under
 * their parent and move within it. The database refuses a third level
 * (`categories_enforce_one_level()`), so there is no depth for this list to
 * grow into.
 *
 * ORDER IS PER GROUP. The top-level categories order among themselves and each
 * set of children orders inside its parent, so moving "Linen & Viscose" up
 * cannot displace "Winter Collection". That is why every move sends only the
 * slugs of the row it happened in (see `reorderCategories`).
 *
 * COUNTS AND FILTERS HERE ARE EXACT, not rolled up. "3 pieces" on Shirts means
 * three products whose category IS Shirts, and the link beside it opens exactly
 * those. The shop does the opposite — browsing Shirts there includes everything
 * in its subcategories — because a shopper means "show me shirts" and an admin
 * means "show me the rows I would be editing". Both are right for their reader;
 * they must not be confused for each other.
 *
 * ---------------------------------------------------------------------------
 * A CATEGORY CANNOT BE RENAMED AT ITS SLUG, AND CANNOT BE DELETED WHILE FULL
 * ---------------------------------------------------------------------------
 * The slug is a public URL (`/products?category=shirts`) and the primary key
 * that `products.category_slug` points at. The display NAME is free to change
 * whenever; the slug is fixed at creation, and the form says so instead of
 * offering an edit that would break every existing link.
 *
 * Where a category SITS is not like that: moving a sub-collection under a
 * different heading rewrites no URL, so that one is editable.
 *
 * Deletion is refused by the database while any product still points at the
 * category — including retired ones — and, now, while it still has
 * subcategories. That is correct, and the dialog explains which of the two is
 * in the way rather than surfacing a foreign key error.
 */
export function CategoriesPage() {
  const toast = useToast();
  const categories = useQuery(CATEGORY_LIST_KEY, ["categories"], listCategories);

  const [editing, setEditing] = useState<Category | "new">();
  const [pendingDelete, setPendingDelete] = useState<CategoryNode | Category>();
  const [deleting, setDeleting] = useState(false);
  const [order, setOrder] = useState<Category[]>();

  const list = order ?? categories.data ?? [];
  const tree = buildCategoryTree(list);

  /**
   * Applies a move optimistically and persists the group it happened in.
   *
   * The optimistic list is FLATTENED BACK with fresh `sortOrder` values,
   * because that is what the next `buildCategoryTree` reads to order the
   * children — keeping the moved array alone would have shown the new order for
   * one render and then snapped back.
   */
  const persist = async (roots: CategoryNode[], groupSlugs: string[]) => {
    setOrder(flatten(roots));

    try {
      await reorderCategories(groupSlugs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setOrder(undefined);
    }
  };

  const onMoveRoot = (from: number, to: number) => {
    const next = move(tree, from, to);
    return persist(next, next.map((node) => node.slug));
  };

  const onMoveChild = (parent: CategoryNode, from: number, to: number) => {
    const children = move(parent.children, from, to);
    const next = tree.map((node) => (node.slug === parent.slug ? { ...node, children } : node));
    return persist(next, children.map((child) => child.slug));
  };

  /**
   * Hiding a PARENT takes its subcategories out of the shop with it — they are
   * headings underneath a heading that is no longer there, so the storefront
   * stops drawing the whole branch (`buildCategoryTree`). The rows here stay
   * marked "shown", because they are: nothing was written to them, and showing
   * the parent again brings them straight back. The toast says so, because it
   * is the one consequence of this click that the list does not draw.
   */
  const onToggle = async (category: Category) => {
    const next = !(category.active ?? true);
    const children = tree.find((node) => node.slug === category.slug)?.children.length ?? 0;

    try {
      await setCategoryActive(category.slug, next);
      setOrder(undefined);
      toast.success(
        next
          ? `${category.name} is shown in the shop`
          : children > 0
            ? `${category.name} is hidden, along with the ${children} ${
                children === 1 ? "subcategory" : "subcategories"
              } inside it. Every product stays live unless you hide it too.`
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

  /** Subcategories blocking a delete — checked before the database refuses it. */
  const blockingChildren =
    pendingDelete && "children" in pendingDelete ? pendingDelete.children.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="How the shop is divided up. This order is the order customers see, on the landing page and above the product grid. A category can sit inside another one — those are indented, and move within their parent."
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
        ) : tree.length === 0 ? (
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
            {tree.map((node, index) => (
              <Fragment key={node.slug}>
                <CategoryRow
                  category={node}
                  subcategoryCount={node.children.length}
                  index={index}
                  count={tree.length}
                  onMove={(from, to) => void onMoveRoot(from, to)}
                  onEdit={() => setEditing(node)}
                  onToggle={() => void onToggle(node)}
                  onDelete={() => setPendingDelete(node)}
                />

                {node.children.map((child, childIndex) => (
                  <CategoryRow
                    key={child.slug}
                    category={child}
                    nestedUnder={node.name}
                    index={childIndex}
                    count={node.children.length}
                    onMove={(from, to) => void onMoveChild(node, from, to)}
                    onEdit={() => setEditing(child)}
                    onToggle={() => void onToggle(child)}
                    onDelete={() => setPendingDelete(child)}
                  />
                ))}
              </Fragment>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <CategoryDialog
          category={editing === "new" ? undefined : editing}
          categories={list}
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
          pendingDelete && blockingChildren > 0 ? (
            <>
              This category has {blockingChildren}{" "}
              {blockingChildren === 1 ? "subcategory" : "subcategories"} inside it, and the
              database will refuse to delete it while it does. Move those out to the top
              level, or delete them first.
            </>
          ) : pendingDelete && pendingDelete.productCount > 0 ? (
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

/**
 * The optimistic list, back in the flat shape `listCategories` returns.
 *
 * `sortOrder` is rewritten to the position within the group, matching exactly
 * what `reorderCategories` is about to write — so the rebuilt tree shows the
 * order the server is being given, not the one it had.
 */
function flatten(roots: readonly CategoryNode[]): Category[] {
  return roots.flatMap((node, index) => [
    { ...stripNode(node), sortOrder: index },
    ...node.children.map((child, childIndex) => ({ ...child, sortOrder: childIndex })),
  ]);
}

/** A tree node back down to the plain `Category` the list is made of. */
function stripNode({ children, totalProductCount, ...category }: CategoryNode): Category {
  void children;
  void totalProductCount;
  return category;
}

/* ---------------------------------------------------------------------------
 * One row
 * ------------------------------------------------------------------------ */

function CategoryRow({
  category,
  /** Set on a subcategory — indents the row and names its parent for a reader. */
  nestedUnder,
  /** Set on a parent — how many categories sit inside it. */
  subcategoryCount = 0,
  index,
  count,
  onMove,
  onEdit,
  onToggle,
  onDelete,
}: {
  category: Category;
  nestedUnder?: string;
  subcategoryCount?: number;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const active = category.active ?? true;

  return (
    <li
      className={`flex flex-wrap items-center gap-4 py-4 pr-4 sm:pr-5 ${
        nestedUnder ? "bg-surface-sunken/40 pl-10 sm:pl-14" : "pl-4 sm:pl-5"
      }`}
    >
      <Thumb
        src={category.thumb}
        alt={category.name}
        width={64}
        height={64}
        className={nestedUnder ? "h-10 w-10 shrink-0" : "h-14 w-14 shrink-0"}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{category.name}</span>
          {!active && <Badge tone="neutral">Hidden</Badge>}
          {subcategoryCount > 0 && (
            <Badge tone="neutral">
              {subcategoryCount} {subcategoryCount === 1 ? "subcategory" : "subcategories"}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          {nestedUnder ? `in ${nestedUnder} · ` : ""}/{category.slug}
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
        count={count}
        onMove={onMove}
        label={category.name}
      />

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-label={active ? `Hide ${category.name}` : `Show ${category.name}`}
          className="rounded-md px-2 py-1.5 text-xs text-ink-soft transition hover:bg-surface-sunken hover:text-ink"
        >
          {active ? "Hide" : "Show"}
        </button>

        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${category.name}`}
          className="rounded-md p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
        >
          <EditIcon className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${category.name}`}
          className="rounded-md p-2 text-ink-muted transition hover:bg-danger/10 hover:text-danger"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------------------
 * The create/edit dialog
 * ------------------------------------------------------------------------ */

/** The value the "sits inside" dropdown uses for "nothing — top level". */
const TOP_LEVEL = "";

/**
 * The value the size-scale dropdown uses for "no suggestion".
 *
 * A separate sentinel from `TOP_LEVEL` despite both being the empty string,
 * because they answer different questions and a shared constant would make a
 * later change to one silently change the other.
 */
const NO_SUGGESTION = "";

function CategoryDialog({
  category,
  /** Every category, flat — for the slug check and the parent picker. */
  categories,
  onClose,
  onSaved,
}: {
  category?: Category;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !category;

  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugPinned, setSlugPinned] = useState(!isNew);
  const [description, setDescription] = useState(category?.description ?? "");
  const [parentSlug, setParentSlug] = useState(category?.parentSlug ?? TOP_LEVEL);
  const [active, setActive] = useState(category?.active ?? true);
  const [thumb, setThumb] = useState<string | undefined>(category?.thumb);
  /**
   * The size scale NEW products in this category start on. `NO_SUGGESTION` is a
   * real choice, not an empty one: a category holding a mix of things is better
   * off letting each product say how it is sized.
   */
  const [defaultSizeScale, setDefaultSizeScale] = useState<SizeScaleId | typeof NO_SUGGESTION>(
    category?.defaultSizeScale ?? NO_SUGGESTION,
  );

  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState<UploadStage>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const tree = buildCategoryTree(categories);
  const existingSlugs = categories.map((c) => c.slug);

  /**
   * Whether this category may be moved inside another at all.
   *
   * A category that already HAS subcategories cannot: that would be a third
   * level, which the database refuses. The picker says so rather than offering
   * a choice that fails on save.
   */
  const ownChildren = category
    ? (tree.find((node) => node.slug === category.slug)?.children.length ?? 0)
    : 0;
  const canNest = ownChildren === 0;

  /**
   * The categories this one may sit inside: the top-level ones, minus itself.
   * A subcategory is never offered, because nothing may sit inside one.
   */
  const parentOptions = tree.filter((node) => node.slug !== category?.slug);

  /**
   * Where a NEW category goes in its group's order — last, so creating one
   * never reshuffles what is already arranged. Recomputed against whichever
   * group the picker currently names.
   */
  const nextSortOrder =
    parentSlug === TOP_LEVEL
      ? tree.length
      : (tree.find((node) => node.slug === parentSlug)?.children.length ?? 0);

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
      // An existing category keeps its place in its group unless it is being
      // moved to a different one, where it goes last rather than colliding with
      // whatever already holds that position.
      sortOrder:
        category && (category.parentSlug ?? TOP_LEVEL) === parentSlug
          ? category.sortOrder
          : nextSortOrder,
      active,
      thumb: thumb ?? null,
      parentSlug: parentSlug || null,
      defaultSizeScale: defaultSizeScale === NO_SUGGESTION ? null : defaultSizeScale,
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
          ? "Shirts, Hoodies, Winter collection — however the shop is divided up. It can sit on its own, or inside another category."
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

        {/*
          Where it sits. Unlike the slug this IS editable after creation: a
          subcategory's URL is its own slug, so moving it under a different
          heading changes where it appears in the navigation and breaks no link.
        */}
        <Select
          label="Sits inside"
          value={parentSlug}
          onChange={setParentSlug}
          disabled={!canNest || parentOptions.length === 0}
          options={[
            { value: TOP_LEVEL, label: "Nothing — a category of its own" },
            ...parentOptions.map((node) => ({
              value: node.slug,
              label: node.name,
              group: "Inside another category",
            })),
          ]}
          hint={
            !canNest
              ? `${category?.name ?? "This category"} has ${ownChildren} ${
                  ownChildren === 1 ? "subcategory" : "subcategories"
                } of its own, so it has to stay at the top level — categories only nest one level deep.`
              : parentOptions.length === 0
                ? "There is no other category to sit inside yet."
                : "A subcategory appears under its parent on the shop's category page, and as a chip when someone browses the parent. Browsing the parent shows its products too."
          }
        />

        {/*
          What products in here are sized by. A SUGGESTION for the product
          editor and nothing more — it is read once, when a product is created,
          and changing it never re-sizes anything already in the category. Shoes
          are the reason it exists: nobody should have to remember that the
          sneakers go by EU numbers every single time they add a pair.
        */}
        <Select
          label="New products in here are sized by"
          value={defaultSizeScale}
          onChange={setDefaultSizeScale}
          options={[
            { value: NO_SUGGESTION, label: "No suggestion — ask each time" },
            ...SIZE_SCALE_LIST.map((scale) => ({ value: scale.id, label: scale.name })),
          ]}
          hint="Only a starting point for the product editor. Every product carries its own sizing, and this never changes one that already exists."
        />

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
              hint={
                parentSlug
                  ? "Optional. Subcategories are listed as links under their parent's tile, so this is rarely shown."
                  : "Optional. Shown on the landing page's category strip."
              }
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
