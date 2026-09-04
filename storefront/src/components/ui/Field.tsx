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
 *
 * ### `floating`
 *
 * The checkout redesign (client reference, 2026-09-04) asks for the label to
 * sit INSIDE the box — as the placeholder while the field is empty, shrinking
 * to a caption above the value once it is filled. That is a second appearance,
 * not a second component: the label association, the error wiring, the
 * `maxLength` and the hint slot are all the same, and duplicating them into a
 * checkout-only input is exactly what section 18 is about.
 *
 * It is done with `peer-placeholder-shown` rather than focus state, so the
 * label position is decided by CSS from the input's own value — no re-render
 * per keystroke, and it is correct on the first paint after a browser autofill,
 * which a React `focused` flag would miss.
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
  floating = false,
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
  type?: "text" | "email" | "tel" | "password";
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Label inside the box, floating up once there is a value. Checkout's look. */
  floating?: boolean;
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
    // A floating label needs a placeholder to exist for `:placeholder-shown` to
    // have anything to match, and a blank one so nothing shows through under it.
    placeholder: floating ? " " : placeholder,
    autoComplete,
    inputMode,
    "aria-invalid": invalid || undefined,
    "aria-describedby": described,
    onBlur,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  };

  const message = invalid ? (
    <p id={errorId} className="mt-2 text-xs leading-relaxed text-danger">
      {error}
    </p>
  ) : hint ? (
    <p id={hintId} className="mt-2 text-xs leading-relaxed text-ink-muted">
      {hint}
    </p>
  ) : null;

  if (floating) {
    /** "Postal code (optional)", the way the reference design words it — the
     *  label is the placeholder here, so a separate marker beside it would be
     *  a caption floating over an empty box. */
    const text = optional ? `${label} (optional)` : label;

    // Resting (empty) vs floated (filled or focused). `peer-*` reads the
    // input's own state, so the two variants below are the whole animation.
    const floatingLabel =
      "pointer-events-none absolute left-4 text-[0.6875rem] text-ink-muted transition-all duration-200 ease-brand peer-focus:text-[0.6875rem] peer-disabled:text-ink-muted";

    return (
      <div className={className}>
        <div className="relative">
          {/* The control comes FIRST so the label can be its `peer`. The two are
              still associated by `htmlFor`/`id`, which is what a screen reader
              and a click on the label both follow. */}
          {multiline ? (
            <textarea
              {...shared}
              rows={rows}
              className={`peer ${control} resize-y pt-6 pb-2.5 leading-relaxed`}
            />
          ) : (
            <input {...shared} type={type} className={`peer ${control} h-14 pt-5 pb-1`} />
          )}

          <label
            htmlFor={id}
            className={
              multiline
                ? `${floatingLabel} top-2 peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-focus:top-2`
                : `${floatingLabel} top-2.5 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-focus:top-2.5 peer-focus:translate-y-0`
            }
          >
            {text}
          </label>
        </div>

        {message}
      </div>
    );
  }

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

      {message}
    </div>
  );
}
