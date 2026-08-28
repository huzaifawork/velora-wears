import type { Settings } from "@shared/types";
import { Container } from "@/components/layout/Container";
import { formatPrice } from "@/lib/format";

/**
 * The reassurance strip: cash on delivery, delivery, exchanges, quality.
 *
 * It sits under the hero on the landing page (requirements section 2) and again
 * under a product, where the same four questions decide whether someone orders.
 * It lives in `layout/` rather than `features/home/` for exactly that reason —
 * it is a page-level band, not a landing-page section, and the copy must be
 * written once (section 18).
 *
 * The delivery promise is read from the admin-configurable settings rather than
 * hardcoded, so it stays true when the admin changes the threshold in the
 * dashboard (requirements section 10).
 */

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  truck: "M3 7h11v10H3zM14 10h4l3 3v4h-7zM7 20a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 7 20zM17.5 20a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z",
  cash: "M2.5 6.5h19v11h-19zM12 14.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM6 9.5h.01M18 14.5h.01",
  swap: "M4 8h13l-3-3M20 16H7l3 3",
  shield: "M12 3l7 3v5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z",
} as const;

export function ValueProps({ settings }: { settings: Settings | null | undefined }) {
  const threshold = settings?.freeDeliveryThreshold;

  const items = [
    {
      icon: ICONS.cash,
      title: "Cash on delivery",
      body: "Pay in cash when the parcel reaches you. No card, no advance payment.",
    },
    {
      icon: ICONS.truck,
      title: threshold ? `Free delivery over ${formatPrice(threshold)}` : "Nationwide delivery",
      body: "Delivered across Pakistan in two to four working days.",
    },
    {
      icon: ICONS.swap,
      title: "Easy size exchange",
      body: "Wrong size? Exchange it within seven days of delivery.",
    },
    {
      icon: ICONS.shield,
      title: "Checked before dispatch",
      body: "Every piece is inspected and pressed before it leaves us.",
    },
  ];

  return (
    <section className="border-y border-line bg-canvas">
      <Container className="grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.title} className="flex gap-3">
            <Icon path={item.icon} />
            <div>
              <p className="text-xs font-medium tracking-eyebrow text-ink uppercase">
                {item.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.body}</p>
            </div>
          </div>
        ))}
      </Container>
    </section>
  );
}
