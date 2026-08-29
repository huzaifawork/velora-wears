import { useEffect, useId, useRef, useState } from "react";

/**
 * The only themed dropdown in the app — a native `<select>`'s OWN popup
 * cannot be styled (client feedback, 2026-08-29: the sort control's open
 * list was plain browser chrome — a white box with the OS's blue highlight —
 * next to a site that otherwise never shows an unstyled surface). This is a
 * small hand-built listbox instead: a styled trigger button plus an
 * absolutely positioned `role="listbox"` panel, following the WAI-ARIA
 * "listbox with button" pattern.
 *
 * `ProductFilters`' notes used to argue FOR the native control specifically
 * because it hands over full keyboard support and, on a phone, the
 * platform's own picker sheet instead of something that has to be scrolled
 * inside an already-scrolling page (section 15). Both of those are rebuilt
 * here rather than given up: every key the pattern calls for is handled
 * below, and the panel is a normal in-page popover on every screen size
 * rather than trying to imitate — or worse, half-imitate — a native sheet.
 */

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name for the control — there is no visible `<label for>` here. */
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value) ?? options[0];

  // Closing on an outside click is the one thing a button + popover does not
  // get for free the way a native <select> does.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  // Moves keyboard focus into the panel once, when it opens — not a ref
  // callback, which would refire (and re-steal focus) on every re-render the
  // open panel causes, e.g. an arrow key moving `activeIndex`.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const commit = (index: number) => {
    setOpen(false);
    const next = options[index];
    if (next && next.value !== value) onChange(next.value);
  };

  const openAt = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAt(Math.max(0, options.findIndex((o) => o.value === value)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(options.length - 1);
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openAt(Math.max(0, activeIndex)))}
        onKeyDown={onTriggerKeyDown}
        className="flex h-9 items-center gap-2 rounded-full border border-line-strong bg-canvas px-4 text-xs text-ink transition hover:border-ink focus:border-ink focus:outline-none"
      >
        {selected?.label}
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-3.5 w-3.5 text-ink-muted transition duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          ref={listRef}
          className="absolute top-full right-0 z-20 mt-2 min-w-full overflow-hidden rounded-lg border border-line bg-canvas py-1.5 shadow-lift outline-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={`cursor-pointer px-4 py-2 text-xs whitespace-nowrap transition ${
                  isActive ? "bg-canvas-alt" : ""
                } ${isSelected ? "font-medium text-accent" : "text-ink"}`}
              >
                {option.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
