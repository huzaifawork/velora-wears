import type { ReactNode } from "react";

import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

/**
 * The narrow centred card every account page shares — sign in, sign up,
 * forgot password, reset password. Built once rather than four times
 * (requirements section 18): the four pages differ only in title, copy and
 * the form inside.
 */
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto w-full max-w-md">
        <SectionHeading as="h1" eyebrow="Account" title={title} description={description} align="center" />
        <div className="mt-10">{children}</div>
      </div>
    </Container>
  );
}

/** The one error banner shape across all four account forms. */
export function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-6 rounded-sm border border-danger/30 bg-danger/5 p-4 text-sm leading-relaxed text-danger"
    >
      {message}
    </div>
  );
}
