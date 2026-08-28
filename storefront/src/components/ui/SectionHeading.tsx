import type { ReactNode } from "react";

/**
 * The heading block every landing-page section shares: a gold eyebrow, a serif
 * title, an optional line of copy, and an optional action on the right
 * (requirements section 18 — one component, reused with props).
 *
 * The two alignments are separate class strings on purpose. Appending
 * `sm:items-center` to a string that already contains `sm:items-end` does not
 * override it — which of the two wins is decided by their order in the
 * generated stylesheet, not by their order in the attribute — so a centred
 * heading silently rendered left-aligned.
 *
 * `as` exists because a PAGE needs its title to be the `h1` while a section
 * inside a page must not be — the styling is identical, only the level differs,
 * so this takes a prop rather than becoming a second component (section 18).
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = "left",
  as: Heading = "h2",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Usually a "View all" link, shown beside the title on wide screens. */
  action?: ReactNode;
  align?: "left" | "center";
  /** Heading level. `h1` for a page title, `h2` (the default) for a section. */
  as?: "h1" | "h2";
  className?: string;
}) {
  const centered = align === "center";

  const wrapper = centered
    ? "flex flex-col items-center gap-6 text-center"
    : "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between";

  return (
    <div className={`${wrapper} ${className}`}>
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-[0.625rem] tracking-eyebrow text-accent uppercase">{eyebrow}</p>
        )}
        <Heading className="mt-3 text-3xl leading-tight text-balance sm:text-4xl">
          {title}
        </Heading>
        {description && (
          <p className="mt-4 leading-relaxed text-pretty text-ink-soft">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
