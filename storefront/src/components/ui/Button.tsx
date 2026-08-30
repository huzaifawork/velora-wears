import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "accent" | "ghost" | "onDark";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  // A soft shadow that lifts slightly further on hover — against the new,
  // truly white canvas a flat fill alone reads a bit inert; a shadow gives it
  // the same physical presence it had by contrast on the old darker ground.
  primary: "bg-brand text-canvas shadow-card hover:bg-brand-soft hover:shadow-lift",
  secondary: "bg-canvas text-ink border border-line-strong hover:bg-canvas-alt",
  accent: "bg-accent text-ink shadow-card hover:bg-accent-soft hover:shadow-lift",
  ghost: "text-ink hover:bg-canvas-alt",
  // For the dark sections — the hero. `secondary` is a solid white pill, which
  // next to the gold fill on a photograph reads as a second PRIMARY rather than
  // a quieter alternative. A hairline pill in the canvas colour keeps the
  // hierarchy the accent fill is there to establish.
  onDark: "border border-canvas/35 text-canvas hover:border-canvas/70 hover:bg-canvas/10",
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
