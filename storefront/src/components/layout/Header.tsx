import { Link } from "react-router-dom";

import { Container } from "@/components/layout/Container";

export function Header() {
  return (
    <header className="border-b border-line">
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Velora Wears
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link to="/products" className="hover:opacity-70">
            Shop
          </Link>
        </nav>
      </Container>
    </header>
  );
}
