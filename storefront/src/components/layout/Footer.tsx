import { Link } from "react-router-dom";

import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { useAsync } from "@/hooks/useAsync";
import { getCategories } from "@/lib/queries";
import { CATEGORIES, PRODUCTS, categoryPath } from "@/lib/routes";

/**
 * Site footer (requirements section 2 — "a modern footer containing relevant
 * information and useful links"). Shared by every page.
 *
 * Social links, the WhatsApp number, the location and the support email are
 * all the brand's real details, supplied by the client on 2026-08-29 (see
 * context.md) — nothing here is a placeholder any more.
 */

/**
 * How many categories the footer column lists before it gets long. "Browse
 * categories" below it always reaches the rest (requirements section 5).
 */
const FOOTER_CATEGORIES = 4;

const care = [
  "Cash on delivery, nationwide",
  "Delivered in 2-4 working days",
  "Size exchange within 7 days",
  "Every order checked before dispatch",
];

/** The brand's real WhatsApp number, in `wa.me` format (no `+`, no spaces). */
const WHATSAPP_NUMBER = "923379370312";

const socials = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/velora_wear_closet?utm_source=qr",
    path: "M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zM16.9 7.1h.01M4.5 8A3.5 3.5 0 0 1 8 4.5h8A3.5 3.5 0 0 1 19.5 8v8a3.5 3.5 0 0 1-3.5 3.5H8A3.5 3.5 0 0 1 4.5 16z",
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@velora_wear_closet?_r=1&_t=ZN-99AYK21h9d8",
    path: "M14 4v10.3a3.2 3.2 0 1 1-2.6-3.14M14 4c.35 2.2 1.9 3.9 4.2 4.2v2.9c-1.5 0-3-.45-4.2-1.3",
  },
  {
    label: "WhatsApp",
    href: `https://wa.me/${WHATSAPP_NUMBER}`,
    path: "M4.5 19.5l1.1-3.7A7.5 7.5 0 1 1 8.4 18.4zM9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.2-1.8-1-.8.8a4.6 4.6 0 0 1-2.5-2.5l.8-.8-1-1.8z",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/share/1EXCx1UfEs/?mibextid=wwXIfr",
    path: "M13.5 21v-8h2.6l.4-3h-3V8.2c0-.9.3-1.5 1.6-1.5H16.6V4.1A22 22 0 0 0 14.3 4c-2.3 0-3.8 1.4-3.8 3.9V10H8v3h2.5v8z",
  },
];

export function Footer() {
  // Built from the data for the same reason the header is: a category the admin
  // adds must appear here, and one they retire must stop being linked
  // (requirements sections 5 and 20). Cached by the query layer, so the footer
  // shares the read with whatever page is above it.
  const { data: categories } = useAsync(() => getCategories(), "categories");

  const shopLinks = [
    { to: PRODUCTS, label: "All products" },
    ...(categories ?? [])
      .slice(0, FOOTER_CATEGORIES)
      .map((category) => ({ to: categoryPath(category.slug), label: category.name })),
    { to: CATEGORIES, label: "Browse categories" },
  ];

  return (
    <footer className="border-t border-line bg-canvas-alt">
      <Container className="grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo variant="stacked" className="items-start! text-ink" />
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-ink-soft">
            Premium everyday fashion, made in Pakistan and delivered to your door. Shirts,
            winter layers, trousers, shoes and the essentials in between.
          </p>
          <ul className="mt-6 flex gap-3">
            {socials.map((social) => (
              <li key={social.label}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-soft transition hover:border-accent hover:text-accent"
                >
                  <span className="sr-only">{social.label}</span>
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4.5 w-4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={social.path} />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label="Shop">
          <h2 className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">Shop</h2>
          <ul className="mt-5 flex flex-col gap-3">
            {shopLinks.map((link) => (
              <li key={link.label}>
                <Link to={link.to} className="text-sm text-ink-soft transition hover:text-accent">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
            Customer care
          </h2>
          <ul className="mt-5 flex flex-col gap-3">
            {care.map((item) => (
              <li key={item} className="text-sm leading-relaxed text-ink-soft">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">Contact</h2>
          <ul className="mt-5 flex flex-col gap-3 text-sm text-ink-soft">
            <li>
              <a href="mailto:wearvelora84@gmail.com" className="transition hover:text-accent">
                wearvelora84@gmail.com
              </a>
            </li>
            <li>
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noreferrer noopener"
                className="transition hover:text-accent"
              >
                WhatsApp: +92 337 9370312
              </a>
            </li>
            <li className="leading-relaxed">Wah Cantt, Pakistan</li>
            <li className="leading-relaxed">Support: 11am - 8pm, Mon to Sat</li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-line">
        <Container className="flex flex-col items-center justify-between gap-3 py-6 sm:flex-row">
          <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
            &copy; {new Date().getFullYear()} Velora Wears
          </p>
          <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
            Cash on delivery &middot; Nationwide shipping
          </p>
        </Container>
      </div>
    </footer>
  );
}
