import {
  createContext,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Transient feedback — "Saved", "Could not delete that", "Order marked
 * Shipped" (requirements section 19: every operation gets UI feedback).
 *
 * WHY A TOAST AND NOT AN INLINE MESSAGE. Most writes in this dashboard happen
 * from a row in a table or from a dialog that closes on success, so there is
 * frequently no element left on screen to put a message inside. A toast is not
 * a decoration here; it is the only place the result of those actions can be
 * said.
 *
 * WHAT IS NOT A TOAST. A validation error belongs on its field, and a failed
 * READ belongs in the space the data would have occupied (`ErrorState`) — both
 * describe something the admin has to look at, and a message that disappears
 * after four seconds is the wrong shape for that. Toasts report the outcome of
 * an action the admin just took.
 *
 * `role="status"` with `aria-live="polite"` means a screen reader announces the
 * result without interrupting; an error toast raises that to `alert`, because a
 * failed save is worth interrupting for.
 */

export type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = use(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

const DURATION: Record<ToastTone, number> = {
  success: 3200,
  info: 4000,
  // Longer, because an error is something to read rather than acknowledge —
  // and it is dismissable, so it does not have to be timed for the slowest
  // reader either.
  error: 7000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = (nextId.current += 1);
      // Capped at four. A burst of writes — reordering a gallery, say — would
      // otherwise stack a column of toasts taller than the screen.
      setToasts((current) => [...current.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), DURATION[tone]);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext value={api}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext>
  );
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-success/30 bg-success/8 text-success",
  error: "border-danger/30 bg-danger/8 text-danger",
  info: "border-line-strong bg-surface text-ink",
};

const TONE_PATHS: Record<ToastTone, string> = {
  success: "M20 6 9 17l-5-5",
  error: "M12 8v5M12 16.5h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  info: "M12 16v-5M12 8h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
};

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-xl border bg-surface px-4 py-3 shadow-raised ${TONE_STYLES[toast.tone]}`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={TONE_PATHS[toast.tone]} />
      </svg>

      <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">{toast.message}</p>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mt-1 -mr-1 shrink-0 rounded p-1 text-ink-muted transition hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
