import { useId } from "react";

/**
 * A dropdown, built on the NATIVE `<select>`.
 *
 * The storefront hand-builds a listbox because its one dropdown sits in a
 * carefully art-directed page and a browser's own popup looked like a seam in
 * it. The trade-off it accepted — rebuilding keyboard support, focus
 * management, and the platform picker sheet on a phone — is the right one for a
 * shop window and the wrong one here.
 *
 * This dashboard has a dropdown on nearly every screen, several of them beside
 * each other in a filter bar, and one of them is an order's status, which is
 * the single most consequential control in the application. What matters for
 * those is that they behave EXACTLY as the platform does: type-ahead, arrow
 * keys, the phone's native wheel picker, a screen reader announcing the
 * options. So the trigger is styled and the popup is the browser's.
 */

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  hideLabel = false,
  hint,
  disabled = false,
  className = "",
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Always required — a control with no accessible name is unusable. */
  label: string;
  /** Visually hide the label. It is still announced. For filter bars. */
  hideLabel?: boolean;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={
          hideLabel ? "sr-only" : "block text-xs font-medium text-ink-soft"
        }
      >
        {label}
      </label>

      <div
        className={`relative ${hideLabel ? "" : "mt-1.5"} ${disabled ? "opacity-60" : ""}`}
      >
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as T)}
          className="h-10 w-full appearance-none rounded-lg border border-line-strong bg-surface pr-9 pl-3 text-sm text-ink transition duration-200 ease-brand hover:border-ink-muted focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none disabled:cursor-not-allowed"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {hint && <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}
