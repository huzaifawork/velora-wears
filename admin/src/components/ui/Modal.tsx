import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@admin/components/ui/Button";

/**
 * The dialog every form and every confirmation in this dashboard opens in.
 *
 * Built on the native `<dialog>` element, which is what gets three things right
 * that a hand-rolled `position: fixed` overlay reliably gets wrong: it traps
 * focus, it renders in the browser's top layer (so no stacking-context bug can
 * put a sticky table header over it), and Escape closes it. All three would
 * otherwise be re-implemented here, badly, in about eighty lines.
 *
 * The one thing `<dialog>` does NOT do is close on a backdrop click, so that is
 * wired below by checking whether the click landed on the element itself rather
 * than on the content inside it.
 */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  /** For a form mid-submit: closing would abandon a write already in flight. */
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // Escape fires `cancel`, not `close`. Intercepting it here is what lets a
    // dialog refuse to be dismissed mid-save.
    const onCancel = (event: Event) => {
      event.preventDefault();
      if (dismissable) onClose();
    };

    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [dismissable, onClose]);

  // The page behind must not scroll while a sheet is over it — on a phone that
  // is the difference between a dialog and a confusing half-scrolled page.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const widths = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  } as const;

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClick={(event) => {
        if (!dismissable) return;
        // Only when the click landed on the dialog element itself — its own box
        // is the full backdrop, and any click inside the content stops here.
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100vw-2rem)] ${widths[size]} rounded-xl border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-brand-deep/45 backdrop:backdrop-blur-[2px] open:animate-sheet`}
    >
      {/* max-height and the internal scroll keep a long form usable on a laptop
          — the header and footer stay put and only the body moves. */}
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-lg text-ink">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{description}</p>
            )}
          </div>

          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1 shrink-0 rounded-lg p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-raised px-5 py-4 sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}

/**
 * The confirmation every destructive action goes through (§19 — delete
 * confirmations).
 *
 * It takes the CONSEQUENCE, not just a name: "Delete Noor Linen Shirt?" is a
 * question about a string, while "its images will be removed and it will
 * disappear from the shop" is a question about what will happen. The confirm
 * button says the verb — "Delete", never "OK" — so a misread dialog is still
 * one legible word away from being understood.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  variant = "danger",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissable={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-soft">{message}</p>
    </Modal>
  );
}
