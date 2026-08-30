import type { ReactNode } from "react";

import { Button } from "@admin/components/ui/Button";
import { Card } from "@admin/components/ui/Card";

/**
 * The three things a screen can be showing instead of data: loading, empty, or
 * broken. All three live here so no screen has to invent its own, and so none
 * of them is ever a blank rectangle (requirements section 19).
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-line/70 ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * A table's loading state, shaped like the table that is coming.
 *
 * Rows and columns are passed in so the placeholder occupies the same space the
 * real content will — the point of a skeleton is that nothing moves when the
 * data lands.
 */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-line" aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
          {Array.from({ length: columns - 1 }, (_, column) => (
            <Skeleton
              key={column}
              className={`h-4 ${column === 0 ? "flex-1" : "w-20"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-8 w-20" />
          <Skeleton className="mt-3 h-3 w-32" />
        </Card>
      ))}
    </div>
  );
}

/**
 * Nothing to show — and, importantly, a way out of it.
 *
 * An empty state with no action is a dead end. Every one of these takes an
 * `action`, because "no products yet" and "no products MATCH THIS FILTER" need
 * different escapes and the screen knows which it is.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
          {icon}
        </div>
      )}
      <h3 className="text-base text-ink">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * A failed read. Shows the actual message — `describeError` has already turned
 * it into something readable — and a retry, because the most common cause is a
 * dropped connection and the most common fix is asking again.
 */
export function ErrorState({
  error,
  onRetry,
  className = "",
}: {
  error: Error;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}
      role="alert"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      </div>
      <h3 className="text-base text-ink">That did not load</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
        {error.message}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
