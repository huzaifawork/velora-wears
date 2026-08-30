import { useState } from "react";

import { PRODUCT_IMAGE } from "@shared/media";
import { Card, CardHeader } from "@admin/components/ui/Card";
import { Badge } from "@admin/components/ui/Badge";
import { ImageDrop, type UploadStage } from "@admin/components/ui/ImageDrop";
import { ConfirmDialog } from "@admin/components/ui/Modal";
import { ReorderControls, move } from "@admin/components/ui/Reorder";
import { Thumb } from "@admin/components/ui/Thumb";
import { useToast } from "@admin/components/ui/Toast";
import { Field } from "@admin/components/ui/Field";
import { TrashIcon } from "@admin/components/ui/Icons";
import { formatBytes } from "@admin/lib/format";
import {
  addProductImage,
  deleteProductImage,
  reorderProductImages,
  updateImageAlt,
} from "@admin/services/products";
import type { AdminProductImage } from "@admin/services/rows";

/**
 * The product gallery editor (requirements section 19).
 *
 * ---------------------------------------------------------------------------
 * THE FIRST IMAGE IS THE COVER, AND THE SCREEN SAYS SO
 * ---------------------------------------------------------------------------
 * `product_summaries.thumb` is defined as "the first `product_images` row by
 * position", so the image at the front of this list is the one on every card in
 * the shop, in search results, on the landing page, and snapshotted onto every
 * future order line. That is a large consequence for a drag, so the first tile
 * is labelled rather than left to be discovered.
 *
 * ---------------------------------------------------------------------------
 * BOTH VARIANTS, EVERY TIME
 * ---------------------------------------------------------------------------
 * Requirements section 19's most concrete ask of this dashboard: every upload
 * writes a small `thumb_url` for cards and a large `full_url` for the detail
 * gallery. It is not a checkbox here — `uploadImagePair` produces both from one
 * decode and `addProductImage` refuses to write a row without both. The panel
 * reports what the compression achieved, because "4.2 MB → 180 KB" is the one
 * piece of feedback that tells an admin the pipeline is working.
 */
export function ProductImages({
  productId,
  images,
  productName,
  onChanged,
}: {
  productId: string;
  images: AdminProductImage[];
  productName: string;
  /** Re-reads the product. The service has already invalidated the cache. */
  onChanged: () => void;
}) {
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<UploadStage>();
  const [saved, setSaved] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<AdminProductImage>();
  const [deleting, setDeleting] = useState(false);

  // Reordering renders from this the moment a button is pressed, so the tiles
  // move immediately and the writes settle behind them. Safe: position is
  // presentational, and a failure re-reads the real order.
  const [order, setOrder] = useState<AdminProductImage[]>();
  const list = order ?? images;

  const onUpload = async (files: File[]) => {
    setBusy(true);
    setSaved(undefined);

    let position = images.length;
    let originalBytes = 0;

    try {
      // Sequential, not parallel. Three 4 MB photographs decoded at once will
      // stall the main thread and can exhaust memory on a phone; one at a time
      // keeps the page responsive and the progress honest.
      for (const file of files) {
        await addProductImage({
          productId,
          file,
          position,
          onProgress: setStage,
        });
        position += 1;
        originalBytes += file.size;
      }

      setSaved(
        `Uploaded. ${formatBytes(originalBytes)} of originals became a card-sized and a full-size WebP for each image.`,
      );

      setOrder(undefined);
      onChanged();
      toast.success(files.length === 1 ? "Image added" : `${files.length} images added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setStage(undefined);
    }
  };

  const onMove = async (from: number, to: number) => {
    const next = move(list, from, to);
    setOrder(next);

    try {
      await reorderProductImages(next.map((image) => image.id));
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setOrder(undefined);
    }
  };

  const onDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);
    try {
      await deleteProductImage(pendingDelete.id, [pendingDelete.thumb, pendingDelete.full]);
      setOrder(undefined);
      onChanged();
      toast.success("Image removed");
      setPendingDelete(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  };

  const onAlt = async (image: AdminProductImage, alt: string) => {
    if ((image.alt ?? "") === alt.trim()) return;

    try {
      await updateImageAlt(image.id, alt);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Card>
      <CardHeader
        title="Photographs"
        description={
          list.length === 0
            ? "The first image becomes the cover — it is what customers see on every card in the shop."
            : `${list.length} ${list.length === 1 ? "image" : "images"}. The first one is the cover.`
        }
      />

      {list.length > 0 && (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((image, index) => (
            <li
              key={image.id}
              className="overflow-hidden rounded-xl border border-line bg-surface-raised"
            >
              <div className="relative">
                <Thumb
                  src={image.thumb}
                  alt={image.alt ?? productName}
                  width={PRODUCT_IMAGE.thumb.width}
                  height={PRODUCT_IMAGE.thumb.height}
                  rounded="rounded-none"
                  className="aspect-3/4 w-full"
                />

                {index === 0 && (
                  <span className="absolute top-2 left-2">
                    <Badge tone="ink">Cover</Badge>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setPendingDelete(image)}
                  aria-label="Remove this image"
                  className="absolute top-2 right-2 rounded-lg bg-surface/90 p-2 text-ink-soft shadow-card backdrop-blur-sm transition hover:bg-danger hover:text-white"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 p-3">
                {/*
                  Alt text is a form field and not an afterthought: the shop
                  renders it on every product card, and a garment with no
                  description is invisible to a customer using a screen reader.
                  Where it is left empty the shop falls back to the product name.
                */}
                <AltField image={image} onSave={onAlt} />

                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted tabular-nums">
                    {image.width && image.height
                      ? `${image.width}×${image.height}`
                      : "Position " + (index + 1)}
                  </span>
                  <ReorderControls
                    index={index}
                    count={list.length}
                    onMove={(from, to) => void onMove(from, to)}
                    label={`image ${index + 1}`}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ImageDrop
        className="mt-5"
        multiple
        busy={busy}
        stage={stage}
        onFiles={(files) => void onUpload(files)}
        onReject={toast.error}
        label={list.length === 0 ? "Add the cover image" : "Add more images"}
        hint={
          saved ??
          "Resized and converted to WebP in your browser before upload — a card-sized version and a full-size one are written for every image, so the shop never downloads more than it shows."
        }
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(undefined)}
        onConfirm={() => void onDelete()}
        loading={deleting}
        title="Remove this image?"
        message="The image is deleted from storage and from this product. If it is the cover, the next image takes its place across the shop."
        confirmLabel="Remove"
      />
    </Card>
  );
}

/**
 * Alt text, committed on blur rather than on every keystroke — one write when
 * the admin is finished with the field, not one per character.
 */
function AltField({
  image,
  onSave,
}: {
  image: AdminProductImage;
  onSave: (image: AdminProductImage, alt: string) => Promise<void>;
}) {
  const [value, setValue] = useState(image.alt ?? "");

  return (
    <Field
      label="Describe this image"
      value={value}
      onChange={setValue}
      onBlur={() => void onSave(image, value)}
      optional
      maxLength={120}
      placeholder="Ecru oversized shirt, laid flat"
      hint="Read aloud to customers using a screen reader, and shown if the image fails to load."
    />
  );
}
