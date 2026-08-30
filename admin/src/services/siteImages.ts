import type { SiteImage, SiteImageSlot } from "@shared/types";
import { SITE_IMAGE } from "@shared/media";
import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { invalidate } from "@admin/lib/cache";
import { deleteImageFiles, uploadImagePair } from "@admin/lib/storage";
import {
  SITE_IMAGE_COLUMNS,
  toSiteImage,
  type SiteImageRow,
} from "@admin/services/rows";

/**
 * The landing page's imagery — the hero and the promotional banners
 * (requirements section 8; the hero was the client's own specific request).
 *
 * Before this, both were literal file paths written inside the components that
 * render them (`storefront/src/features/home/Hero.tsx`, `PromoBanners.tsx`),
 * so changing the shop window meant editing React and redeploying. Now they
 * are rows.
 *
 * ---------------------------------------------------------------------------
 * WHAT AN EMPTY TABLE MEANS
 * ---------------------------------------------------------------------------
 * Nothing. That is the important design decision here: the storefront keeps its
 * existing hero image and its two banners as DEFAULTS and only overrides what
 * this table actually provides. So the shop looks exactly as it does today
 * until an admin uploads something, and a mistake here — deleting every hero
 * row, deactivating the lot — degrades to the current design rather than to a
 * blank white rectangle at the top of the page.
 *
 * Every text field is optional for the same reason. An admin who wants a new
 * hero photograph and the same headline uploads a photograph and stops.
 */

export const SITE_IMAGES_KEY = "site-images:all";

/**
 * Every site image, both slots, including inactive ones — ONE query for the
 * whole screen. The table holds a handful of rows; splitting it into a query
 * per slot would be two round trips to draw one page.
 */
export async function listSiteImages(): Promise<SiteImage[]> {
  const { data, error } = await getSupabase()
    .from("site_images")
    .select(SITE_IMAGE_COLUMNS)
    .order("slot", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(describeError(error));
  return (data ?? []).map((row) => toSiteImage(row as unknown as SiteImageRow));
}

export interface SiteImageInput {
  alt?: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  cta2Label?: string;
  cta2Href?: string;
  active?: boolean;
}

/** `""` and `undefined` both mean "not set" and are stored as SQL null. */
const nullable = (value: string | undefined): string | null => value?.trim() || null;

function toRow(input: SiteImageInput) {
  return {
    alt: nullable(input.alt),
    eyebrow: nullable(input.eyebrow),
    title: nullable(input.title),
    body: nullable(input.body),
    cta_label: nullable(input.ctaLabel),
    cta_href: nullable(input.ctaHref),
    cta2_label: nullable(input.cta2Label),
    cta2_href: nullable(input.cta2Href),
    ...(input.active === undefined ? {} : { active: input.active }),
  };
}

/**
 * Upload an image and create the row for it.
 *
 * Files first, row second — a failed upload must never leave a row pointing at
 * an image that does not exist, because that renders as a broken picture at the
 * very top of the shop's landing page.
 */
export async function createSiteImage({
  slot,
  file,
  input,
  onProgress,
}: {
  slot: SiteImageSlot;
  file: File;
  input: SiteImageInput;
  onProgress?: (stage: "encoding" | "uploading") => void;
}): Promise<void> {
  const uploaded = await uploadImagePair({
    file,
    folder: `site/${slot}`,
    specs: SITE_IMAGE,
    onProgress,
  });

  // New images go to the END of their slot, so uploading a second hero shot
  // never silently replaces the one on the page right now.
  const { data: last } = await getSupabase()
    .from("site_images")
    .select("position")
    .eq("slot", slot)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = ((last as { position: number } | null)?.position ?? -1) + 1;

  const { error } = await getSupabase().from("site_images").insert({
    slot,
    position,
    thumb_url: uploaded.thumbUrl,
    full_url: uploaded.fullUrl,
    width: uploaded.width,
    height: uploaded.height,
    ...toRow({ active: true, ...input }),
  });

  if (error) {
    void deleteImageFiles([uploaded.thumbUrl, uploaded.fullUrl]).catch(() => undefined);
    throw new Error(describeError(error));
  }

  invalidate("site-images");
}

/** Edit the copy on an existing image. Does not touch the files. */
export async function updateSiteImage(id: string, input: SiteImageInput): Promise<void> {
  const { error } = await getSupabase().from("site_images").update(toRow(input)).eq("id", id);
  if (error) throw new Error(describeError(error));
  invalidate("site-images");
}

/**
 * Swap the picture on an existing row, keeping its copy, its slot and its
 * position.
 *
 * The new files are uploaded under a NEW path and the row is repointed, rather
 * than overwriting the old object in place: an image at a URL that changes
 * meaning is one every CDN edge and every open browser tab keeps serving the
 * old version of. The old files are deleted afterwards, and a failure there is
 * ignored — the shop is already showing the new picture.
 */
export async function replaceSiteImage({
  id,
  slot,
  file,
  previous,
  onProgress,
}: {
  id: string;
  slot: SiteImageSlot;
  file: File;
  previous: { thumb: string; full: string };
  onProgress?: (stage: "encoding" | "uploading") => void;
}): Promise<void> {
  const uploaded = await uploadImagePair({
    file,
    folder: `site/${slot}`,
    specs: SITE_IMAGE,
    onProgress,
  });

  const { error } = await getSupabase()
    .from("site_images")
    .update({
      thumb_url: uploaded.thumbUrl,
      full_url: uploaded.fullUrl,
      width: uploaded.width,
      height: uploaded.height,
    })
    .eq("id", id);

  if (error) {
    void deleteImageFiles([uploaded.thumbUrl, uploaded.fullUrl]).catch(() => undefined);
    throw new Error(describeError(error));
  }

  invalidate("site-images");
  void deleteImageFiles([previous.thumb, previous.full]).catch(() => undefined);
}

export async function setSiteImageActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from("site_images").update({ active }).eq("id", id);
  if (error) throw new Error(describeError(error));
  invalidate("site-images");
}

export async function deleteSiteImage(
  id: string,
  urls: readonly string[],
): Promise<void> {
  const { error } = await getSupabase().from("site_images").delete().eq("id", id);
  if (error) throw new Error(describeError(error));

  invalidate("site-images");
  void deleteImageFiles(urls).catch(() => undefined);
}

/** Persist a slot's display order after a drag. */
export async function reorderSiteImages(orderedIds: readonly string[]): Promise<void> {
  const supabase = getSupabase();

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("site_images").update({ position: index }).eq("id", id),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(describeError(failed.error));

  invalidate("site-images");
}
