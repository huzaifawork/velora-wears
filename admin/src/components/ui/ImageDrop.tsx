import { useRef, useState, type ReactNode } from "react";

import { ACCEPTED_IMAGE_TYPES } from "@shared/media";
import { rejectFile } from "@admin/lib/image";
import { Spinner } from "@admin/components/ui/Button";

/**
 * The image picker — a drop target that is also a button.
 *
 * Every upload in this dashboard goes through it: product galleries, the hero,
 * the promo banners, category tiles. It does the four things that would
 * otherwise be re-implemented per screen and forgotten on at least one of them:
 *
 *  1. accepts a drop OR a click, and both reach the same handler;
 *  2. validates each file BEFORE anything is decoded (`rejectFile`), so a
 *     40 MB raw camera file is refused with a sentence instead of freezing the
 *     tab;
 *  3. shows what is happening — "Compressing", "Uploading" — because a 4 MB
 *     photograph takes long enough that silence reads as a broken button;
 *  4. clears the `<input>`'s value after every pick, so choosing THE SAME FILE
 *     twice in a row fires a change event the second time. (It does not
 *     otherwise. This is the bug that makes a re-upload after a failure look
 *     like a dead control.)
 *
 * It does NOT upload anything itself. It hands files to `onFiles` and the
 * feature decides where they go — the storage path for a product image is not
 * this component's business.
 */

export type UploadStage = "encoding" | "uploading";

export const UPLOAD_STAGE_LABEL: Record<UploadStage, string> = {
  encoding: "Compressing",
  uploading: "Uploading",
};

export function ImageDrop({
  onFiles,
  onReject,
  multiple = false,
  busy = false,
  stage,
  disabled = false,
  label = "Add image",
  hint,
  className = "",
  children,
}: {
  onFiles: (files: File[]) => void;
  /** Called with a sentence when a file is refused. Wire it to a toast. */
  onReject?: (message: string) => void;
  multiple?: boolean;
  busy?: boolean;
  stage?: UploadStage;
  disabled?: boolean;
  label?: string;
  hint?: ReactNode;
  className?: string;
  /** Replaces the default face — used by the "replace this image" tiles. */
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (list: FileList | null) => {
    if (!list || list.length === 0) return;

    const files: File[] = [];
    for (const file of Array.from(multiple ? list : [list[0]])) {
      const problem = rejectFile(file);
      if (problem) onReject?.(problem);
      else files.push(file);
    }

    if (files.length > 0) onFiles(files);
  };

  const locked = disabled || busy;

  return (
    <div className={className}>
      <button
        type="button"
        disabled={locked}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          if (locked) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (locked) return;
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition duration-200 ease-brand ${
          dragging
            ? "border-accent bg-accent/8"
            : "border-line-strong bg-surface-raised hover:border-ink-muted hover:bg-surface-sunken"
        } ${locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        {children ?? (
          <>
            {busy ? (
              <Spinner className="text-accent" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-6 w-6 text-ink-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 16V4m0 0L8 8m4-4 4 4" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
            )}

            <span className="text-sm font-medium text-ink">
              {busy && stage ? `${UPLOAD_STAGE_LABEL[stage]}…` : label}
            </span>

            {!busy && (
              <span className="text-xs text-ink-muted">
                Drop an image here, or click to choose. JPEG, PNG, WebP or AVIF.
              </span>
            )}
          </>
        )}
      </button>

      {hint && <p className="mt-2 text-xs leading-relaxed text-ink-muted">{hint}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          accept(event.target.files);
          // Without this, picking the same file twice in a row fires no change
          // event the second time and the control looks dead.
          event.target.value = "";
        }}
      />
    </div>
  );
}
