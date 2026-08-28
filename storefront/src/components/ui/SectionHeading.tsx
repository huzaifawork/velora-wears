import type { ReactNode } from "react";

/**
 * The heading block every landing-page section shares: a gold eyebrow, a serif
 * title, an optional line of copy, and an optional action on the right
 * (requirements section 18 — one component, reused with props).
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = "left",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Usually a "View all" link, shown beside the title on wide screens. */
  action?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";

  return (
    <div
      className={`flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between ${
        centered ? "sm:flex-col sm:items-center" : ""
      } ${className}`}
    >
      <div className={`max-w-2xl ${centered ? "text-center" : ""}`}>
        {eyebrow && (
          <p className="text-[0.625rem] tracking-eyebrow text-accent uppercase">{eyebrow}</p>
        )}
        <h2 className="mt-3 text-3xl leading-tight text-balance sm:text-4xl">{title}</h2>
        {description && (
          <p className="mt-4 leading-relaxed text-pretty text-ink-soft">{description}</p>
        )}
      </div>
      {action && <div className={`shrink-0 ${centered ? "mt-2" : ""}`}>{action}</div>}
    </div>
  );
}
