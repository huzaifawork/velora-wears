import { Navigate } from "react-router-dom";

import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/account/AuthContext";
import { OrderHistory } from "@/features/account/OrderHistory";
import { SIGN_IN } from "@/lib/routes";

/**
 * The signed-in customer's account — order history, and a sign-out control.
 * Optional accounts, the note added to requirements section 12.
 *
 * A signed-out visitor is redirected to `/account/sign-in` rather than shown
 * a prompt here — there is nothing else on this page for them, and the sign
 * in page already offers the way to create an account too.
 */
export function AccountPage() {
  const { status, user, signOut } = useAuth();

  if (status === "loading") {
    return (
      <Container className="flex flex-col gap-6 py-20">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
      </Container>
    );
  }

  if (status === "signed-out") {
    return <Navigate to={SIGN_IN} replace />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title={user?.fullName ? `Hi, ${user.fullName}` : "Your account"}
        description={user?.email}
      >
        <button
          type="button"
          onClick={() => void signOut()}
          className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-6" })}
        >
          Sign out
        </button>
      </PageHeader>

      <Container className="py-14 sm:py-20">
        <h2 className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">Your orders</h2>
        <div className="mt-6">
          <OrderHistory />
        </div>
      </Container>
    </>
  );
}
