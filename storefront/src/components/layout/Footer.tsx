import { Container } from "@/components/layout/Container";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line py-10">
      <Container>
        <p className="text-sm text-ink-soft">
          &copy; {new Date().getFullYear()} Velora Wears
        </p>
      </Container>
    </footer>
  );
}
