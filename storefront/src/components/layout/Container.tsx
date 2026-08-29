import type { ReactNode } from "react";

/**
 * Single source of page gutters and max width. Never re-implement this inline.
 *
 * `wide` is the one deliberate exception, added for the header (client
 * feedback, 2026-08-29: six nav labels — two of them two words each — were
 * wrapping onto a second line inside the standard 72rem content width). It
 * swaps in a wider cap rather than the header rebuilding its own gutters, so
 * every other page keeps the narrower reading width this was designed for.
 */
export function Container({
  children,
  className = "",
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`mx-auto w-full ${wide ? "max-w-7xl" : "max-w-6xl"} px-4 sm:px-6 lg:px-8 ${className}`}
    >
      {children}
    </div>
  );
}
