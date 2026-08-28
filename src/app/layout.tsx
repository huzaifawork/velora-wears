import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Velora Wears",
  description: "Velora Wears storefront.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
