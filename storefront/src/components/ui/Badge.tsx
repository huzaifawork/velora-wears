import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "ink";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-canvas/90 text-ink-soft ring-line",
  accent: "bg-accent text-ink ring-accent",
  success: "bg-canvas/90 text-success ring-success/30",
  warning: "bg-canvas/90 text-warning ring-warning/30",
  danger: "bg-canvas/90 text-danger ring-danger/30",
  ink: "bg-brand text-canvas ring-brand",
};

/**
 * One badge for the whole site — stock status (section 11), promotional
 * flags, and anything else that needs a small pill. Add a tone here rather
 * than styling a one-off span somewhere (requirements section 18).
 */
export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[0.625rem] font-medium tracking-eyebrow uppercase ring-1 backdrop-blur-sm ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
