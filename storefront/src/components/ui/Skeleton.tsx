/**
 * Loading placeholder (requirements section 19 — skeletons, never blank
 * screens). The pulse is disabled automatically for visitors who ask for
 * reduced motion, via the global rule in index.css.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-canvas-deep ${className}`} aria-hidden="true" />;
}
