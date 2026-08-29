import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { ProductSummary } from "@shared/types";
import { Button } from "@admin/components/ui/Button";
import { Card, PageHeader } from "@admin/components/ui/Card";
import { Badge, StockBadge } from "@admin/components/ui/Badge";
import { EmptyState, ErrorState, Skeleton } from "@admin/components/ui/Skeleton";
import { Modal } from "@admin/components/ui/Modal";
import { ReorderControls, move } from "@admin/components/ui/Reorder";
import { SearchInput } from "@admin/components/ui/SearchInput";
import { Thumb } from "@admin/components/ui/Thumb";
import { useToast } from "@admin/components/ui/Toast";
import { FeaturedIcon, PlusIcon, TrashIcon } from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import {
  listFeatured,
  listProducts,
  productListKey,
  reorderFeatured,
  setProductFeatured,
} from "@admin/services/products";
import { SETTINGS_KEY, getSettings } from "@admin/services/settings";
import { formatPrice } from "@admin/lib/format";
import * as routes from "@admin/lib/routes";

/**
 * Featured products — the landing page's strip (requirements section 8).
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACES
 * ---------------------------------------------------------------------------
 * The strip has always been "the eight newest products". That is a reasonable
 * default and it is not a decision the shop's owner could make: a piece the
 * brand actually wants to push had to be created most recently to be seen. Now
 * it is a chosen, ordered list, and the storefront reads it in that order.
 *
 * If NOTHING is featured, the shop falls back to newest-first exactly as it
 * does today — so this screen being empty is a valid state, not a broken
 * landing page. The panel says so, because an admin who sees an empty list
 * should know what customers are currently being shown.
 *
 * ---------------------------------------------------------------------------
 * THE WARNINGS ARE THE POINT OF THE SCREEN
 * ---------------------------------------------------------------------------
 * A featured product that is SOLD OUT or HIDDEN is the specific failure this
 * screen exists to catch: it is the most valuable slot in the shop, spent on
 * something a customer cannot buy. Both are flagged in place rather than left
 * for someone to notice.
 */
export function FeaturedPage() {
  const toast = useToast();
  const featured = useQuery("products:featured", ["products"], listFeatured);
  const settings = useQuery(SETTINGS_KEY, ["settings"], getSettings);
  const threshold = settings.data?.lowStockThreshold;

  const [picking, setPicking] = useState(false);
  const [order, setOrder] = useState<ProductSummary[]>();
  const [busy, setBusy] = useState(false);

  const list = order ?? featured.data ?? [];

  const onMove = async (from: number, to: number) => {
    const next = move(list, from, to);
    setOrder(next);

    try {
      await reorderFeatured(next.map((product) => product.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setOrder(undefined);
    }
  };

  const onRemove = async (product: ProductSummary) => {
    setBusy(true);
    try {
      await setProductFeatured(product.id, false);
      setOrder(undefined);
      toast.success(`${product.name} removed from the featured strip`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const problems = list.filter(
    (product) => !product.active || !product.inStock,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Featured products"
        description="The edit that appears on the landing page, in this order."
        action={
          <Button onClick={() => setPicking(true)}>
            <PlusIcon className="h-4 w-4" />
            Add products
          </Button>
        }
      />

      {problems > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/8 p-4">
          <p className="text-sm leading-relaxed text-ink">
            <strong className="font-medium">
              {problems === 1
                ? "One featured product cannot be bought right now."
                : `${problems} featured products cannot be bought right now.`}
            </strong>{" "}
            They are hidden or sold out, and they are taking up the most valuable
            space on the shop's landing page.
          </p>
        </div>
      )}

      <Card padded={false}>
        {featured.error ? (
          <ErrorState error={featured.error} onRetry={featured.refetch} />
        ) : featured.loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<FeaturedIcon />}
            title="Nothing is featured"
            description="The landing page is showing the eight newest products instead — which works, but means the shop cannot choose what to push. Pick the pieces the brand wants seen first."
            action={
              <Button size="sm" onClick={() => setPicking(true)}>
                <PlusIcon className="h-4 w-4" />
                Choose products
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((product, index) => (
              <li
                key={product.id}
                className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5"
              >
                <span className="w-6 shrink-0 text-center font-display text-lg text-ink-muted tabular-nums">
                  {index + 1}
                </span>

                <Thumb
                  src={product.thumb}
                  alt={product.name}
                  width={44}
                  height={58}
                  className="h-14 w-11 shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <Link
                    to={routes.productPath(product.id)}
                    className="block truncate text-sm font-medium text-ink hover:text-accent"
                  >
                    {product.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
                    {formatPrice(product.price)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {!product.active && <Badge tone="danger">Hidden from the shop</Badge>}
                  <StockBadge quantity={product.totalStock ?? 0} threshold={threshold} />
                </div>

                <ReorderControls
                  index={index}
                  count={list.length}
                  onMove={(from, to) => void onMove(from, to)}
                  label={product.name}
                  disabled={busy}
                />

                <button
                  type="button"
                  onClick={() => void onRemove(product)}
                  aria-label={`Remove ${product.name} from featured`}
                  className="shrink-0 rounded-md p-2 text-ink-muted transition hover:bg-danger/10 hover:text-danger"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {picking && (
        <PickerDialog
          alreadyFeatured={new Set(list.map((product) => product.id))}
          onClose={() => setPicking(false)}
          onAdded={() => setOrder(undefined)}
        />
      )}
    </div>
  );
}

/**
 * The picker.
 *
 * It searches the LIVE catalog only — featuring a hidden product would put a
 * dead link on the landing page — and the search runs against the database with
 * the same debounce as every other list, rather than downloading the catalog to
 * filter it here.
 */
function PickerDialog({
  alreadyFeatured,
  onClose,
  onAdded,
}: {
  alreadyFeatured: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string>();

  const options = useMemo(
    () => ({
      search,
      status: "active" as const,
      sort: "newest" as const,
      page: 1,
      pageSize: 12,
    }),
    [search],
  );

  const products = useQuery(`picker:${productListKey(options)}`, ["products"], () =>
    listProducts(options),
  );

  const onAdd = async (product: ProductSummary) => {
    setAdding(product.id);
    try {
      await setProductFeatured(product.id, true);
      onAdded();
      toast.success(`${product.name} added to the featured strip`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setAdding(undefined);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add to featured"
      description="Live products only. New ones go to the end of the strip."
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <SearchInput
        label="Search products"
        placeholder="Search the catalog…"
        value={search}
        onChange={setSearch}
      />

      <div className="mt-4">
        {products.error ? (
          <ErrorState error={products.error} onRetry={products.refetch} />
        ) : products.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : (products.data?.rows ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-soft">
            No live products match that search.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {(products.data?.rows ?? []).map((product) => {
              const already = alreadyFeatured.has(product.id);

              return (
                <li key={product.id} className="flex items-center gap-3 py-3">
                  <Thumb
                    src={product.thumb}
                    alt={product.name}
                    width={40}
                    height={52}
                    className="h-13 w-10 shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{product.name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
                      {formatPrice(product.price)}
                      {!product.inStock && " · sold out"}
                    </p>
                  </div>

                  {already ? (
                    <Badge tone="accent">Featured</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={adding === product.id}
                      onClick={() => void onAdd(product)}
                    >
                      Add
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
