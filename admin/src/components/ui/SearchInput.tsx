import { useEffect, useState, type ReactNode } from "react";

/**
 * The search box above every list, and the row it sits in.
 *
 * ---------------------------------------------------------------------------
 * IT DEBOUNCES, AND THE DEBOUNCE IS THE POINT
 * ---------------------------------------------------------------------------
 * Search runs against the database (`ilike` over a trigram index), and a query
 * per keystroke means eight requests to type "hoodies" — seven of which are
 * already stale when they arrive, and any of which can come back out of order
 * and paint the wrong results. So the typed value is LOCAL state that updates
 * instantly, and the committed value is published 300ms after typing stops.
 *
 * The brief asks to "debounce only where appropriate", and this is the only
 * place in the dashboard that is: everything else here is a click, and a click
 * is already a deliberate act.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  label,
  delay = 300,
  className = "",
}: {
  /** The COMMITTED value. Changing it from outside (a cleared filter) resets the box. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  delay?: number;
  className?: string;
}) {
  const [typed, setTyped] = useState(value);
  const [lastCommitted, setLastCommitted] = useState(value);

  // Keeps the box in step when the value is changed from ELSEWHERE — "clear all
  // filters", or a URL the admin pasted in.
  //
  // Adjusted during render rather than in an effect. That is React's own
  // documented pattern for "a prop changed and some state has to follow": an
  // effect would render the stale text first and then immediately render again
  // to correct it, which is a visible flash of the previous search term.
  if (lastCommitted !== value) {
    setLastCommitted(value);
    setTyped(value);
  }

  useEffect(() => {
    if (typed === value) return;

    const timer = window.setTimeout(() => onChange(typed), delay);
    return () => window.clearTimeout(timer);
    // `onChange` is an inline closure that is new on every render; `typed` is
    // what decides when this should run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, delay]);

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <input
        type="search"
        value={typed}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => setTyped(event.target.value)}
        className="h-10 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-sm text-ink transition duration-200 ease-brand placeholder:text-ink-muted hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
      />
    </div>
  );
}

/**
 * The bar that holds a search box and its filters.
 *
 * On a phone it stacks and the filters scroll horizontally as a row rather than
 * becoming four full-width dropdowns that push the table off the screen.
 */
export function FilterBar({
  search,
  filters,
  actions,
  className = "",
}: {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-5 lg:flex-row lg:items-center ${className}`}
    >
      {search && <div className="lg:max-w-xs lg:flex-1">{search}</div>}

      {filters && (
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:flex-1 lg:overflow-visible lg:px-0 lg:pb-0">
          {filters}
        </div>
      )}

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * "3 filters applied · Clear" — shown only when something is actually narrowing
 * the list.
 *
 * This exists because of the most common confusing moment in an admin tool:
 * an empty screen that is empty because of a filter set three visits ago. The
 * empty state says so, and this gives it a one-click undo.
 */
export function ActiveFilters({
  count,
  onClear,
}: {
  count: number;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
    >
      {count} {count === 1 ? "filter" : "filters"}
      <span aria-hidden="true">·</span>
      Clear
    </button>
  );
}
