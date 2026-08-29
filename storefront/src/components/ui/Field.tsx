import { useId, type ReactNode } from "react";

/**
 * A labelled form control — the only one in the app (requirements section 18).
 *
 * Checkout is the first screen with a form on it, and it has seven fields that
 * are identical apart from their label, their keyboard and whether they are a
 * line or a paragraph. Written per field, that is seven copies of the label,
 * the error slot, the `aria-describedby` wiring and the invalid styling, and
 * the review form in section 16 would have made an eighth. So it takes props:
 * `multiline` switches the element, and everything else is a string.
 *
 * Two things it does that are easy to leave out of a hand-rolled input:
 *
 *  - **The error is wired to the control, not just printed under it.**
 *    `aria-invalid` plus `aria-describedby` is what makes a screen reader read
 *    the problem out when the field is focused; red text alone is invisible to
 *    it, and to anyone who cannot distinguish the colour (section 17 asks for
 *    a clear, helpful message, which has to mean for everyone).
 *  - **`maxLength` is real.** The server rejects oversized input (section 17);
 *    stopping the field at the same bound means a customer never types 400
 *    characters of address and is then told to delete some.
 *
 * The optional fields are marked, not the required ones. Most of the form is
 * required, so marking those would put an asterisk almost everywhere and say
 * nothing; "Optional" on the two that are genuinely optional is the smaller
 * and more useful mark.
 */
export function Field({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  optional = false,
  multiline = false,
  rows = 3,
  type = "text",
  autoComplete,
  inputMode,
  maxLength,
  placeholder,
  disabled = false,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** The message to show, or undefined when the field is fine. */
  error?: string;
  /** Standing guidance — the shape of a phone number, say. Hidden while there is an error. */
  hint?: ReactNode;
  optional?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: "text" | "email" | "tel";
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  // Generated rather than passed in: the label and the control have to share an
  // id, and a caller that forgets to pass a unique one breaks the association
  // silently on the second field.
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const invalid = Boolean(error);
  const described = invalid ? errorId : hint ? hintId : undefined;

  const control =
    "w-full rounded-sm border bg-canvas px-4 text-sm text-ink transition duration-200 ease-brand placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-canvas-alt disabled:text-ink-muted " +
    (invalid ? "border-danger" : "border-line-strong hover:border-ink-muted");

  const shared = {
    id,
    value,
    disabled,
    maxLength,
    placeholder,
    autoComplete,
    inputMode,
    "aria-invalid": invalid || undefined,
    "aria-describedby": described,
    onBlur,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  };

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-3 text-[0.625rem] tracking-eyebrow text-ink-muted uppercase"
      >
        <span className="text-ink-soft">{label}</span>
        {optional && <span>Optional</span>}
      </label>

      {multiline ? (
        <textarea {...shared} rows={rows} className={`${control} mt-2 resize-y py-3 leading-relaxed`} />
      ) : (
        <input {...shared} type={type} className={`${control} mt-2 h-12`} />
      )}

      {invalid ? (
        <p id={errorId} className="mt-2 text-xs leading-relaxed text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-2 text-xs leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
