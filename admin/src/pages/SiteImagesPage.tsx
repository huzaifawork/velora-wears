import { useState } from "react";

import type { SiteImage, SiteImageSlot } from "@shared/types";
import { SITE_IMAGE } from "@shared/media";
import { Button } from "@admin/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@admin/components/ui/Card";
import { Badge } from "@admin/components/ui/Badge";
import { Field, Switch } from "@admin/components/ui/Field";
import { ConfirmDialog, Modal } from "@admin/components/ui/Modal";
import { ReorderControls, move } from "@admin/components/ui/Reorder";
import { EmptyState, ErrorState, Skeleton } from "@admin/components/ui/Skeleton";
import { Thumb } from "@admin/components/ui/Thumb";
import { ImageDrop, type UploadStage } from "@admin/components/ui/ImageDrop";
import { useToast } from "@admin/components/ui/Toast";
import { EditIcon, ImagesIcon, PlusIcon, TrashIcon } from "@admin/components/ui/Icons";
import { useQuery } from "@admin/hooks/useQuery";
import {
  SITE_IMAGES_KEY,
  createSiteImage,
  deleteSiteImage,
  listSiteImages,
  reorderSiteImages,
  replaceSiteImage,
  setSiteImageActive,
  updateSiteImage,
  type SiteImageInput,
} from "@admin/services/siteImages";

/**
 * The landing page's imagery — the HERO and the PROMOTIONAL BANNERS
 * (requirements section 8; the hero was the client's own specific request).
 *
 * ---------------------------------------------------------------------------
 * WHAT AN EMPTY LIST MEANS HERE, AND WHY IT IS SAFE
 * ---------------------------------------------------------------------------
 * Nothing. The storefront keeps its existing hero photograph and its two
 * banners as DEFAULTS and only overrides what this screen provides. So the shop
 * looks exactly as it does today until something is uploaded, and a mistake —
 * deleting every row, deactivating the lot — degrades to the current design
 * rather than to a blank rectangle at the top of the landing page. Both panels
 * say which of the two is happening right now, because "what are customers
 * actually seeing" is the only question this screen has to answer.
 *
 * ---------------------------------------------------------------------------
 * THE COPY IS OPTIONAL, AND THAT IS THE DESIGN
 * ---------------------------------------------------------------------------
 * Every text field on a record — the eyebrow, the headline, the body, the
 * button — can be left empty, and the storefront falls back to the copy it
 * already ships with. An admin who wants a new hero photograph for the season
 * and the same words uploads a photograph and stops. Nobody has to retype a
 * headline to change a picture.
 *
 * ---------------------------------------------------------------------------
 * MORE THAN ONE HERO
 * ---------------------------------------------------------------------------
 * Several hero images can be active at once. The storefront shows the first and
 * offers the rest as a small thumbnail strip beside it — the images all arrive
 * in the one query the landing page already makes, so switching between them
 * costs nothing. That is why this list is ordered rather than a single slot.
 */

const SLOTS: Array<{
  slot: SiteImageSlot;
  title: string;
  description: string;
  emptyTitle: string;
  emptyBody: string;
  fallbackNote: string;
}> = [
  {
    slot: "hero",
    title: "Hero images",
    description:
      "The large image at the top of the landing page — the first thing anyone sees.",
    emptyTitle: "No hero image uploaded",
    emptyBody:
      "The shop is showing the hero photograph it ships with. Upload one here to replace it — and add more than one if you want a small set customers can look through.",
    fallbackNote:
      "The shop is showing your uploaded hero. The first image is the large one; any others appear as a thumbnail strip beside it.",
  },
  {
    slot: "promo",
    title: "Promotional banners",
    description:
      "The editorial panels further down the landing page, each linking somewhere in the shop.",
    emptyTitle: "No banners uploaded",
    emptyBody:
      "The shop is showing the two banners it ships with. Upload your own to replace them — a photograph, a headline, and where the button should go.",
    fallbackNote: "The shop is showing your uploaded banners, in this order.",
  },
];

export function SiteImagesPage() {
  const images = useQuery(SITE_IMAGES_KEY, ["site-images"], listSiteImages);

  const [editing, setEditing] = useState<{ slot: SiteImageSlot; image?: SiteImage }>();
  const [pendingDelete, setPendingDelete] = useState<SiteImage>();
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const onDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    try {
      await deleteSiteImage(pendingDelete.id, [pendingDelete.thumb, pendingDelete.full]);
      toast.success("Image deleted");
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
        title="Hero & banners"
        description="The images customers see on the landing page. Anything left empty keeps the shop's own design."
      />

      {images.error ? (
        <ErrorState error={images.error} onRetry={images.refetch} />
      ) : (
        SLOTS.map((config) => (
          <SlotSection
            key={config.slot}
            config={config}
            loading={images.loading}
            images={(images.data ?? []).filter((image) => image.slot === config.slot)}
            onAdd={() => setEditing({ slot: config.slot })}
            onEdit={(image) => setEditing({ slot: config.slot, image })}
            onDelete={setPendingDelete}
          />
        ))
      )}

      {editing && (
        <SiteImageDialog
          slot={editing.slot}
          image={editing.image}
          onClose={() => setEditing(undefined)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(undefined)}
        onConfirm={() => void onDelete()}
        loading={deleting}
        title="Delete this image?"
        message="The image is removed from the landing page and from storage. If it was the last one in its section, the shop goes back to the design it ships with."
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * One slot's list
 * ------------------------------------------------------------------------ */

function SlotSection({
  config,
  images,
  loading,
  onAdd,
  onEdit,
  onDelete,
}: {
  config: (typeof SLOTS)[number];
  images: SiteImage[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (image: SiteImage) => void;
  onDelete: (image: SiteImage) => void;
}) {
  const toast = useToast();
  const [order, setOrder] = useState<SiteImage[]>();
  const list = order ?? images;

  const liveCount = list.filter((image) => image.active).length;

  const onMove = async (from: number, to: number) => {
    const next = move(list, from, to);
    setOrder(next);

    try {
      await reorderSiteImages(next.map((image) => image.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setOrder(undefined);
    }
  };

  const onToggle = async (image: SiteImage) => {
    try {
      await setSiteImageActive(image.id, !image.active);
      setOrder(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Card padded={false}>
      <div className="p-5 sm:p-6">
        <CardHeader
          title={config.title}
          description={config.description}
          action={
            <Button variant="secondary" size="sm" onClick={onAdd}>
              <PlusIcon className="h-4 w-4" />
              Upload
            </Button>
          }
        />

        {!loading && (
          <p
            className={`mt-4 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
              liveCount > 0
                ? "border-success/25 bg-success/8 text-ink-soft"
                : "border-line bg-surface-sunken text-ink-soft"
            }`}
          >
            {liveCount > 0 ? config.fallbackNote : config.emptyBody}
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 px-5 pb-5">
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<ImagesIcon />}
          title={config.emptyTitle}
          description="Nothing uploaded yet."
          action={
            <Button size="sm" onClick={onAdd}>
              <PlusIcon className="h-4 w-4" />
              Upload an image
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {list.map((image, index) => (
            <li key={image.id} className="flex flex-wrap items-start gap-4 px-4 py-4 sm:px-5">
              <Thumb
                src={image.thumb}
                alt={image.alt ?? image.title ?? "Landing page image"}
                width={SITE_IMAGE.thumb.width}
                height={SITE_IMAGE.thumb.height}
                className="h-20 w-28 shrink-0"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {image.title || image.alt || "Untitled image"}
                  </span>
                  {index === 0 && image.active && config.slot === "hero" && (
                    <Badge tone="ink">Showing now</Badge>
                  )}
                  {!image.active && <Badge tone="neutral">Hidden</Badge>}
                </div>

                {image.body && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                    {image.body}
                  </p>
                )}

                {image.ctaLabel && image.ctaHref && (
                  <p className="mt-1 truncate text-xs text-ink-muted">
                    Button: “{image.ctaLabel}” → {image.ctaHref}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <ReorderControls
                  index={index}
                  count={list.length}
                  onMove={(from, to) => void onMove(from, to)}
                  label={image.title || "this image"}
                  className="mr-1"
                />

                <button
                  type="button"
                  onClick={() => void onToggle(image)}
                  className="rounded-md px-2 py-1.5 text-xs text-ink-soft transition hover:bg-surface-sunken hover:text-ink"
                >
                  {image.active ? "Hide" : "Show"}
                </button>

                <button
                  type="button"
                  onClick={() => onEdit(image)}
                  aria-label="Edit this image"
                  className="rounded-md p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
                >
                  <EditIcon className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onDelete(image)}
                  aria-label="Delete this image"
                  className="rounded-md p-2 text-ink-muted transition hover:bg-danger/10 hover:text-danger"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Upload / edit
 * ------------------------------------------------------------------------ */

function SiteImageDialog({
  slot,
  image,
  onClose,
}: {
  slot: SiteImageSlot;
  image?: SiteImage;
  onClose: () => void;
}) {
  const toast = useToast();
  const isNew = !image;

  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [alt, setAlt] = useState(image?.alt ?? "");
  const [eyebrow, setEyebrow] = useState(image?.eyebrow ?? "");
  const [title, setTitle] = useState(image?.title ?? "");
  const [body, setBody] = useState(image?.body ?? "");
  const [ctaLabel, setCtaLabel] = useState(image?.ctaLabel ?? "");
  const [ctaHref, setCtaHref] = useState(image?.ctaHref ?? "");
  const [active, setActive] = useState(image?.active ?? true);

  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<UploadStage>();
  const [error, setError] = useState<string>();

  const pick = (files: File[]) => {
    // The previous preview's object URL is released here rather than in an
    // effect, so a second pick cannot leak the first decoded file.
    if (preview) URL.revokeObjectURL(preview);
    setFile(files[0]);
    setPreview(URL.createObjectURL(files[0]));
  };

  const close = () => {
    if (preview) URL.revokeObjectURL(preview);
    onClose();
  };

  const onSave = async () => {
    if (isNew && !file) {
      setError("Choose an image to upload.");
      return;
    }
    if (ctaLabel.trim() && !ctaHref.trim()) {
      setError("A button needs somewhere to go — fill in the link, or clear the button text.");
      return;
    }

    const input: SiteImageInput = { alt, eyebrow, title, body, ctaLabel, ctaHref, active };

    setSaving(true);
    setError(undefined);
    try {
      if (isNew) {
        await createSiteImage({ slot, file: file!, input, onProgress: setStage });
        toast.success("Image uploaded and live on the landing page");
      } else {
        if (file) {
          await replaceSiteImage({
            id: image.id,
            slot,
            file,
            previous: { thumb: image.thumb, full: image.full },
            onProgress: setStage,
          });
        }
        await updateSiteImage(image.id, input);
        toast.success("Saved");
      }
      close();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
      setStage(undefined);
    }
  };

  const isHero = slot === "hero";

  return (
    <Modal
      open
      onClose={close}
      dismissable={!saving}
      size="lg"
      title={isNew ? (isHero ? "Upload a hero image" : "Upload a banner") : "Edit image"}
      description={
        isHero
          ? "The photograph at the top of the landing page. Every text field below is optional — leave one empty and the shop keeps the words it already uses."
          : "An editorial panel further down the landing page. Every text field is optional; leave one empty and the shop keeps its own copy."
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void onSave()} loading={saving}>
            {saving && stage
              ? stage === "encoding"
                ? "Compressing…"
                : "Uploading…"
              : isNew
                ? "Upload"
                : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="shrink-0">
            {preview ? (
              // The chosen file, before upload. Rendered directly rather than
              // through `Thumb` — an object URL has no thumb variant, and this
              // is the one image in the dashboard that is not yet on a server.
              <img
                src={preview}
                alt="The image you are about to upload"
                className="h-40 w-32 rounded-lg object-cover"
              />
            ) : (
              <Thumb
                src={image?.thumb}
                alt={image?.alt ?? "Current image"}
                width={SITE_IMAGE.thumb.width}
                height={SITE_IMAGE.thumb.height}
                className="h-40 w-32"
              />
            )}
          </div>

          <ImageDrop
            className="flex-1"
            onFiles={pick}
            onReject={toast.error}
            disabled={saving}
            label={isNew ? "Choose an image" : "Replace this image"}
            hint={
              isNew
                ? "Resized and converted to WebP in your browser. A large version for the page and a small one for this dashboard are both written."
                : "Optional — leave this alone to keep the current photograph and only change the words."
            }
          />
        </div>

        <Field
          label="Describe the image"
          value={alt}
          onChange={setAlt}
          optional
          maxLength={140}
          placeholder="Deep plum heavyweight hoodie, worn open over a cream tee"
          hint="Read aloud to customers using a screen reader, and shown if the image fails to load."
        />

        <div className="rounded-lg border border-line bg-surface-raised p-4">
          <p className="text-xs font-medium text-ink-soft">
            Copy — all optional
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Anything you leave empty keeps the wording the shop already has.
          </p>

          <div className="mt-4 space-y-4">
            <Field
              label="Small label above the headline"
              value={eyebrow}
              onChange={setEyebrow}
              optional
              maxLength={60}
              placeholder="Winter drop"
            />

            <Field
              label="Headline"
              value={title}
              onChange={setTitle}
              optional
              maxLength={120}
              placeholder="400 GSM fleece, in from the cold"
            />

            <Field
              label="Supporting line"
              value={body}
              onChange={setBody}
              optional
              multiline
              rows={2}
              maxLength={240}
              placeholder="Heavyweight hoodies with a hood that stands up and a fit that layers."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Button text"
                value={ctaLabel}
                onChange={setCtaLabel}
                optional
                maxLength={40}
                placeholder="Shop winter"
              />

              <Field
                label="Button link"
                value={ctaHref}
                onChange={setCtaHref}
                optional
                maxLength={200}
                placeholder="/products?category=winter-collection"
                hint="A path inside the shop, or a full web address."
              />
            </div>
          </div>
        </div>

        <Switch
          label="Live on the landing page"
          checked={active}
          onChange={setActive}
          description="Hidden images stay here but customers do not see them. If every image in a section is hidden, the shop uses its own design for that section."
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
