import { Container } from "@/components/layout/Container";
import { LogoMark } from "@/components/brand/Logo";
import { SectionHeading } from "@/components/ui/SectionHeading";

/**
 * The brand introduction (requirements section 2 — "a brief introduction
 * explaining what Velora Wears is and what the brand offers").
 *
 * The logo mark is imported from the brand component, never redrawn.
 */

const pillars = [
  {
    title: "Fabric first",
    body: "Mid-weight cottons, real linen, and 400 GSM fleece — chosen by hand, washed before they reach you, and never thinned out to hit a price.",
  },
  {
    title: "A fit that is ours",
    body: "Every block is cut and fitted here rather than copied off a supplier's catalogue, then graded across small, medium and large.",
  },
  {
    title: "Sold the honest way",
    body: "Cash on delivery, clear stock counts, and no invented discounts. What you see on the page is what arrives at your door.",
  },
];

export function BrandIntro() {
  return (
    <section className="bg-brand py-20 text-canvas sm:py-24">
      <Container>
        {/* A left/right editorial split rather than a centered stack — the
            brand statement earns the left column, the pillar list is its
            own column rather than a row of three centered underneath it. */}
        <div className="grid gap-14 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
          <div>
            <LogoMark className="h-12 w-12 text-canvas" />
            <SectionHeading
              className="mt-6"
              eyebrow="Who we are"
              title={<span className="text-canvas">A Pakistani label for everyday clothes</span>}
              description={
                <span className="text-canvas/70">
                  Velora Wears started with a simple frustration: buying a plain shirt or a decent
                  hoodie online here usually means guessing at the fabric and hoping about the
                  fit. We make a small, tightly edited collection instead — shirts, winter layers
                  and essentials we actually wear ourselves, shipped nationwide and paid for in
                  cash at your door.
                </span>
              }
            />
          </div>

          <div className="flex flex-col gap-8 border-t border-canvas/15 pt-10 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-14">
            {pillars.map((pillar, i) => (
              <div key={pillar.title}>
                <p className="font-display text-sm text-accent">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-xl text-canvas">{pillar.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-canvas/70">{pillar.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
