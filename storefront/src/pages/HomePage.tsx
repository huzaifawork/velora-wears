import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";

export function HomePage() {
  return (
    <Container className="py-24">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Velora Wears</h1>
      <p className="mt-4 max-w-prose text-ink-soft">
        Scaffold is in place — React + Vite, wired to Firebase Realtime Database.
        Feature work begins with the product catalog.
      </p>
      <div className="mt-8">
        <Button>Shop the collection</Button>
      </div>
    </Container>
  );
}
