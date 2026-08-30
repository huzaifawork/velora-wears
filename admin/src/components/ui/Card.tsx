import type { ReactNode } from "react";

/**
 * The surface everything in this dashboard sits on, plus the page-level
 * furniture that surrounds it. One file, because a card, its header and the
 * section heading above it are the same visual idea at three scales and
 * splitting them would mean three places to keep in step (§18).
 */

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  /** Off for cards whose content is a table — a table brings its own gutters. */
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface shadow-card ${padded ? "p-5 sm:p-6" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        <h2 className="text-lg text-ink">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * The heading at the top of every screen.
 *
 * `as="h1"` always — there is exactly one page title per screen, and the cards
 * below it use `h2`. Getting that ordering right is most of what a screen
 * reader has to navigate a dense admin page with.
 */
export function PageHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}
    >
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight text-ink sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </header>
  );
}

/**
 * A labelled value — the shape every detail panel in this dashboard is built
 * from (an order's customer, a product's meta, the account screen).
 */
export function Detail({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium tracking-wide text-ink-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words text-ink">{children}</dd>
    </div>
  );
}
