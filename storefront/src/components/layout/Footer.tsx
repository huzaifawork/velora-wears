import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";

/**
 * Site footer. Closes every page with the brand mark (requirements section 1).
 *
 * The full footer - link columns, contact details, and social links - is built
 * with the landing page in requirements section 2.
 */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-canvas-alt py-14">
      <Container className="flex flex-col items-center gap-5 text-center">
        <Logo variant="stacked" className="text-ink" />
        <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
          Premium everyday fashion, made to be worn. Delivered across Pakistan.
        </p>
        <p className="text-xs tracking-eyebrow text-ink-muted uppercase">
          &copy; {new Date().getFullYear()} Velora Wears
        </p>
      </Container>
    </footer>
  );
}
