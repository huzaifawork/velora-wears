/**
 * VELORA WEARS - the brand logo (Requirements section 1).
 *
 * Defined ONCE here and reused everywhere it appears - header, footer, favicon,
 * loading states, the order confirmation page (requirements section 18: shared
 * UI elements must exist in a single component).
 *
 * The mark is a tapered `V` monogram split down its axis: the left arm inherits
 * `currentColor` so the logo works on light and dark surfaces alike, while the
 * right arm is fixed to the antique-gold accent. The ring gives it a stamped,
 * couture-label feel and keeps it legible at favicon size.
 */

type LogoVariant = "full" | "mark" | "stacked";

interface LogoProps {
  /** `full` = mark + wordmark (default). `mark` = monogram only, for tight spaces. */
  variant?: LogoVariant;
  className?: string;
  /** Accessible name, exposed to screen readers via a visually hidden label. */
  title?: string;
}

const markSizes: Record<LogoVariant, string> = {
  full: "h-9 w-9",
  mark: "h-9 w-9",
  stacked: "h-12 w-12",
};

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Stamped ring - inherits text colour at low opacity so it never fights the mark. */}
      <circle
        cx="20"
        cy="20"
        r="18.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.3"
      />
      {/* The full V, drawn as one shape so the two arms share a seamless edge. */}
      <path d="M10.6 11.4 L14.9 11.4 L20 24.6 L25.1 11.4 L29.4 11.4 L20 29.2 Z" fill="currentColor" />
      {/* The right arm, overlaid in gold. */}
      <path d="M25.1 11.4 L29.4 11.4 L20 29.2 L20 24.6 Z" fill="var(--color-accent)" />
    </svg>
  );
}

export function Logo({ variant = "full", className = "", title = "Velora Wears" }: LogoProps) {
  if (variant === "mark") {
    return (
      <span className={`inline-flex ${className}`} title={title}>
        <LogoMark className={markSizes.mark} />
        <span className="sr-only">{title}</span>
      </span>
    );
  }

  const stacked = variant === "stacked";

  return (
    <span
      className={`inline-flex ${stacked ? "flex-col items-center gap-3" : "flex-row items-center gap-3"} ${className}`}
    >
      <LogoMark className={markSizes[variant]} />
      <span className={`flex flex-col leading-none ${stacked ? "items-center" : "items-start"}`}>
        {/* Both words are the same size and weight — client feedback, 2026-08-29:
            "Wears" read as an afterthought caption under a big "Velora". They are
            one wordmark now, split only by colour (ink vs. the antique-gold
            accent), the way a two-line fashion lockup usually earns its second
            line. The trailing letter-space each word inherits from its tracking
            is trimmed off, so the glyphs - not the invisible gap - stay aligned. */}
        <span className="-mr-[0.24em] font-display text-lg tracking-wordmark">VELORA</span>
        <span className="-mr-[0.24em] font-display text-lg tracking-wordmark text-accent">
          WEARS
        </span>
      </span>
      <span className="sr-only">{title}</span>
    </span>
  );
}
