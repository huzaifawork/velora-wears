/**
 * Every icon in the dashboard, in one file, drawn as inline SVG.
 *
 * No icon library: this needs about eighteen glyphs, and a package would ship
 * a thousand plus a runtime to pick between them. They share one stroke weight
 * and one 24px grid, which is most of what makes an icon set look like a set,
 * and they inherit `currentColor` so a button's colour is the icon's colour
 * with nothing passed down.
 */

type IconProps = { className?: string };

function Glyph({ className = "h-5 w-5", d }: IconProps & { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export const DashboardIcon = (p: IconProps) => (
  <Glyph {...p} d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6v-9h-6v9zm0-16v5h6V4h-6z" />
);

export const ProductsIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M8 4 4.5 7v13h15V7L16 4M8 4h8M8 4v3a4 4 0 0 0 8 0V4"
  />
);

export const CategoriesIcon = (p: IconProps) => (
  <Glyph {...p} d="M4 5h7v6H4V5zm9 0h7v6h-7V5zM4 13h7v6H4v-6zm9 0h7v6h-7v-6z" />
);

export const OrdersIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M6 3h9l4 4v14H6V3zm9 0v4h4M9.5 12h6M9.5 16h4"
  />
);

export const FeaturedIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4z"
  />
);

export const ImagesIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M3 5h18v14H3V5zm0 10 4.5-4.5a2 2 0 0 1 2.8 0L15 15m-1.5-1.5 1.8-1.8a2 2 0 0 1 2.8 0L21 14M8 9.5h.01"
  />
);

export const InventoryIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9zm0 0 9 4.5m0 0 9-4.5m-9 4.5V21"
  />
);

export const ReviewsIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10zM8.5 9h7M8.5 12.5h4"
  />
);

export const DeliveryIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M3 7h11v9H3V7zm11 3h4l3 3v3h-7v-6zM7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
  />
);

export const AccountIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0"
  />
);

export const SignOutIcon = (p: IconProps) => (
  <Glyph {...p} d="M15 4h4v16h-4M11 8l-4 4 4 4M7 12h10" />
);

export const PlusIcon = (p: IconProps) => <Glyph {...p} d="M12 5v14M5 12h14" />;

export const EditIcon = (p: IconProps) => (
  <Glyph {...p} d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 6.5l3 3" />
);

export const TrashIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M4 7h16M9 7V4.5h6V7m-8 0 1 13h8l1-13M10.5 11v5.5M13.5 11v5.5"
  />
);

export const ExternalIcon = (p: IconProps) => (
  <Glyph {...p} d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
);

export const EyeIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zm9.5 2.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z"
  />
);

export const EyeOffIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M4 4l16 16M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4M6.3 8.2A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.2-.2 3.2-.6M10 10.1a2.8 2.8 0 0 0 3.9 3.9"
  />
);

export const SearchIcon = (p: IconProps) => (
  <Glyph {...p} d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm5-2 4 4" />
);

export const AlertIcon = (p: IconProps) => (
  <Glyph
    {...p}
    d="M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
  />
);

export const CheckIcon = (p: IconProps) => <Glyph {...p} d="M20 6 9 17l-5-5" />;

export const MenuIcon = (p: IconProps) => (
  <Glyph {...p} d="M4 7h16M4 12h16M4 17h16" />
);

export const CloseIcon = (p: IconProps) => <Glyph {...p} d="M6 6l12 12M18 6 6 18" />;

export const RevenueIcon = (p: IconProps) => (
  <Glyph {...p} d="M4 18V9m5 9V5m5 13v-6m5 6V7" />
);

export const CopyIcon = (p: IconProps) => (
  <Glyph {...p} d="M9 9h10v11H9V9zM5 15V4h10v1" />
);
