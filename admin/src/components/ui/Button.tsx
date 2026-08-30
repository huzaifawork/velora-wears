import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The only button in the dashboard (requirements section 18 — no duplicated UI
 * code). Add a variant here rather than styling a one-off button in a feature.
 *
 * `danger` is deliberately its own variant and not a red `className` passed to
 * `primary`: destructive actions have to look destructive everywhere, and a
 * per-call-site colour is how one delete button ends up looking like a save.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-soft disabled:hover:bg-brand",
  secondary:
    "bg-surface text-ink border border-line-strong hover:border-ink-muted hover:bg-surface-raised",
  ghost: "text-ink-soft hover:bg-surface-sunken hover:text-ink",
  danger: "bg-danger text-white hover:brightness-110",
  accent: "bg-accent text-ink hover:bg-accent-soft",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-sm gap-2",
};

const base =
  "inline-flex items-center justify-center rounded-lg font-medium transition duration-200 " +
  "ease-brand disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";

export function buttonClasses({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Shows a spinner and disables the button. The LABEL STAYS — swapping it for
   * "Saving..." makes the button change width mid-click, and the admin loses
   * the thing they were about to press.
   */
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

/** The one spinner. Sized in `em`, so it matches whatever text it sits beside. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-[1em] w-[1em] shrink-0 animate-spin ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}
