import { useId } from "react";

import { formatRating } from "@/lib/format";

/**
 * Star rating, used on product cards, in testimonials, and on the product
 * detail page (requirements sections 2 and 16). Defined once — never draw
 * stars inline anywhere else.
 *
 * Partial stars are rendered by clipping a gold star over a track star, so a
 * 4.6 average reads honestly instead of being rounded up to 5.
 */

const sizes = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
} as const;

function Star({ fill, clipId, className }: { fill: number; clipId: string; className: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className}>
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={20 * fill} height="20" />
        </clipPath>
      </defs>
      <path
        d="M10 1.6 12.472 6.9 18.2 7.68 14.05 11.62 15.07 17.4 10 14.64 4.93 17.4 5.95 11.62 1.8 7.68 7.528 6.9Z"
        fill="currentColor"
        className="text-line-strong"
      />
      {fill > 0 && (
        <path
          d="M10 1.6 12.472 6.9 18.2 7.68 14.05 11.62 15.07 17.4 10 14.64 4.93 17.4 5.95 11.62 1.8 7.68 7.528 6.9Z"
          fill="var(--color-accent)"
          clipPath={`url(#${clipId})`}
        />
      )}
    </svg>
  );
}

export function Rating({
  rating,
  count,
  size = "sm",
  className = "",
}: {
  rating: number;
  /** Number of reviews. Omitted where the count is not meaningful. */
  count?: number;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const clipBase = useId();
  const label =
    count === undefined
      ? `Rated ${formatRating(rating)} out of 5`
      : `Rated ${formatRating(rating)} out of 5 from ${count} reviews`;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={label}>
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star
            key={i}
            fill={Math.min(1, Math.max(0, rating - i))}
            clipId={`${clipBase}-star-${i}`}
            className={sizes[size]}
          />
        ))}
      </span>
      {count !== undefined && (
        <span className="text-xs text-ink-muted">
          {formatRating(rating)} <span aria-hidden="true">&middot;</span> {count}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
