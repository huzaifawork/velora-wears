import { useId, type ReactNode } from "react";

/**
 * The labelled form control — the only one in the dashboard (§18).
 *
 * Modelled on the storefront's `Field`, with the same two things that are easy
 * to leave out of a hand-rolled input and impossible to leave out of this one:
 *
 *  - **The error is WIRED to the control**, via `aria-invalid` plus
 *    `aria-describedby`, not just printed underneath it in red. Red text alone
 *    is invisible to a screen reader and to anyone who cannot distinguish the
 *    colour.
 *  - **`maxLength` is real**, so nobody types four hundred characters of
 *    description and is then told to delete some.
 *
 * Additions the dashboard needs that the shop's form did not: a `number` type
 * (prices and stock), and a `prefix`/`suffix` slot, so a price field can say
 * "Rs" inside the box instead of in a label the admin has to remember applies.
 */

export interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  /** Standing guidance. Hidden while there is an error — never both at once. */
  hint?: ReactNode;
  optional?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: "text" | "email" | "tel" | "password" | "number" | "url" | "date";
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal" | "url";
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Rendered inside the control, before the text — e.g. `Rs`. */
  prefix?: ReactNode;
  suffix?: ReactNode;
  className?: string;
}

export function Field({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  optional = false,
  multiline = false,
  rows = 4,
  type = "text",
  autoComplete,
  inputMode,
  maxLength,
  min,
  max,
  step,
  placeholder,
  disabled = false,
  autoFocus = false,
  prefix,
  suffix,
  className = "",
}: FieldProps) {
  // Generated rather than passed in: the label and the control have to share an
  // id, and a caller that forgets to pass a unique one breaks the association
  // silently on the second field.
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const invalid = Boolean(error);
  const describedBy = invalid ? errorId : hint ? hintId : undefined;

  const shell =
    "flex items-center gap-2 rounded-lg border bg-surface px-3 transition duration-200 ease-brand " +
    "focus-within:ring-2 focus-within:ring-accent/25 " +
    (invalid
      ? "border-danger focus-within:border-danger"
      : "border-line-strong hover:border-ink-muted focus-within:border-accent") +
    (disabled ? " bg-surface-sunken" : "");

  const control =
    "w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted " +
    "disabled:cursor-not-allowed disabled:text-ink-muted";

  const shared = {
    id,
    value,
    disabled,
    maxLength,
    placeholder,
    autoComplete,
    inputMode,
    autoFocus,
    "aria-invalid": invalid || undefined,
    "aria-describedby": describedBy,
    onBlur,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  };

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-3 text-xs font-medium text-ink-soft"
      >
        <span>{label}</span>
        {optional && <span className="font-normal text-ink-muted">Optional</span>}
      </label>

      {multiline ? (
        <div className={`${shell} mt-1.5 py-2.5`}>
          <textarea {...shared} rows={rows} className={`${control} resize-y leading-relaxed`} />
        </div>
      ) : (
        <div className={`${shell} mt-1.5 h-10`}>
          {prefix && <span className="text-sm text-ink-muted select-none">{prefix}</span>}
          <input {...shared} type={type} min={min} max={max} step={step} className={control} />
          {suffix && <span className="text-sm text-ink-muted select-none">{suffix}</span>}
        </div>
      )}

      {invalid ? (
        <p id={errorId} className="mt-1.5 text-xs leading-relaxed text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A boolean, as a switch rather than a checkbox.
 *
 * Every toggle in this dashboard means "live on the shop right now" — a product
 * being active, a banner being shown, a category appearing in the navigation.
 * A switch reads as a state; a checkbox reads as a form field waiting to be
 * submitted, and these apply immediately.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 ${disabled ? "cursor-not-allowed opacity-60" : ""} ${className}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition duration-200 ease-brand ${
          checked ? "bg-success" : "bg-line-strong"
        } disabled:cursor-not-allowed`}
      >
        <span
          aria-hidden="true"
          className={`h-4 w-4 rounded-full bg-white shadow-sm transition duration-200 ease-brand ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
