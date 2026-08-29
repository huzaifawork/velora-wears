/**
 * Reordering — the move-up / move-down control every ordered list in this
 * dashboard uses (featured products, the hero images, the promo banners, the
 * product gallery, the category strip).
 *
 * ---------------------------------------------------------------------------
 * WHY BUTTONS AND NOT DRAG AND DROP
 * ---------------------------------------------------------------------------
 * Drag and drop is the obvious answer and it is the wrong one for this
 * application. Native HTML5 dragging does not work by touch AT ALL, which
 * rules it out on the phone this dashboard is required to work on
 * (requirements section 21); making it work needs pointer-event handling, an
 * auto-scroll, a drag preview and a keyboard alternative anyway, which is a
 * dependency or several hundred lines. And the lists being ordered here have
 * four to eight items in them.
 *
 * Two buttons work with a mouse, a finger and a keyboard, are announced
 * correctly by a screen reader with no ARIA of their own, and are understood
 * without being discovered. The order is committed on each press — these lists
 * are small and the write is one statement per row.
 */

/** `move(items, from, to)` — pure, so the caller can render optimistically. */
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return [...items];

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function ReorderControls({
  index,
  count,
  onMove,
  disabled = false,
  label,
  className = "",
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
  /** What is being moved, for the accessible name — "Move Noor Linen Shirt up". */
  label: string;
  className?: string;
}) {
  const button =
    "flex h-7 w-7 items-center justify-center rounded-md border border-line-strong bg-surface text-ink-soft transition hover:border-ink-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        className={button}
        disabled={disabled || index === 0}
        aria-label={`Move ${label} up`}
        onClick={() => onMove(index, index - 1)}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>

      <button
        type="button"
        className={button}
        disabled={disabled || index === count - 1}
        aria-label={`Move ${label} down`}
        onClick={() => onMove(index, index + 1)}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}
