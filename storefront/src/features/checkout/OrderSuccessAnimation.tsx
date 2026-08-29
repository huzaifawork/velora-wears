/**
 * The order success animation (requirements section 12). Replaces the static
 * checkmark on `/order/confirmed` with a one-shot sequence: a package is
 * packed, a delivery truck arrives, the package is loaded in, then the
 * confirmation mark draws itself. Pure CSS keyframes on an inline SVG - no
 * animation library - the same approach `--animate-rise` and
 * `--animate-marquee` already use in `index.css`, so there is nothing new to
 * hydrate or download.
 *
 * It runs once and holds its final frame (`both` fill mode on every
 * keyframe), and `prefers-reduced-motion` collapses both the duration AND
 * the delay to ~0 globally (see `index.css`), so a reduced-motion visitor
 * sees the finished checkmark immediately rather than a silent multi-second
 * wait followed by a snap.
 */
export function OrderSuccessAnimation() {
  return (
    <svg
      viewBox="0 0 300 150"
      role="img"
      aria-label="Order packed, on its way, and confirmed"
      className="mx-auto h-auto w-full max-w-xs text-brand sm:max-w-sm"
    >
      <line
        x1="20"
        y1="126"
        x2="280"
        y2="126"
        stroke="var(--color-line-strong)"
        strokeWidth="1.5"
        strokeDasharray="4 6"
      />

      {/* The package: packed in, then lifted and faded as the truck loads it. */}
      <g className="animate-order-package" style={{ transformOrigin: "86px 93px" }}>
        <rect
          x="64"
          y="76"
          width="44"
          height="34"
          rx="3"
          fill="var(--color-canvas)"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <line x1="86" y1="76" x2="86" y2="110" stroke="var(--color-accent)" strokeWidth="3" />
        <line x1="64" y1="90" x2="108" y2="90" stroke="var(--color-accent)" strokeWidth="3" />
        <path
          d="M78 76 L86 84 L94 76"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* The truck: drives in from the left, parks, then drives off right once
          the package above has been "loaded". */}
      <g className="animate-order-truck" style={{ transformOrigin: "150px 110px" }}>
        <path
          d="M20 112 H150 V78 H172 L192 96 V112 H198"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="60" cy="112" r="9" fill="var(--color-canvas)" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="170" cy="112" r="9" fill="var(--color-canvas)" stroke="currentColor" strokeWidth="2.5" />
      </g>

      {/* The confirmation mark: pops in and draws itself once the truck has
          the package - the same ring-and-tick shape the static mark used. */}
      <g className="animate-order-check-pop" style={{ transformOrigin: "150px 75px" }}>
        <g transform="translate(124 49) scale(0.8)">
          <circle
            cx="32"
            cy="32"
            r="29"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.45"
            strokeDasharray="183"
            className="animate-order-check-ring"
          />
          <path
            d="M20 33.5 L28.5 42 L45 24"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="37"
            className="animate-order-check-tick"
          />
        </g>
      </g>
    </svg>
  );
}
