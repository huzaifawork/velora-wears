import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "accent" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-canvas hover:bg-brand-soft",
  secondary: "bg-canvas text-ink border border-line-strong hover:bg-canvas-alt",
  accent: "bg-accent text-ink hover:bg-accent-soft",
  ghost: "text-ink hover:bg-canvas-alt",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-xs",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-9 text-sm",
};

const base =
  "inline-flex items-center justify-center rounded-full font-medium tracking-eyebrow uppercase transition duration-200 ease-brand disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The button's styling, exposed on its own so an anchor or a react-router `Link`
 * can look identical without the styles being written twice (requirements
 * section 18 - no duplicated UI code).
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

/**
 * The only button in the app. Add a variant here rather than styling a
 * one-off button somewhere else (requirements section 18).
 */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={buttonClasses({ variant, size, className })} {...rest}>
      {children}
    </button>
  );
}
