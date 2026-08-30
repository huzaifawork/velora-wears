import { Link, Navigate } from "react-router-dom";

import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/account/AuthContext";
import { OrderHistory } from "@/features/account/OrderHistory";
import { ProfileDetails } from "@/features/account/ProfileDetails";
import { ADMIN, SIGN_IN } from "@/lib/routes";

/**
 * The signed-in customer's account — order history, and a sign-out control.
 * Optional accounts, the note added to requirements section 12.
 *
 * A signed-out visitor is redirected to `/account/sign-in` rather than shown
 * a prompt here — there is nothing else on this page for them, and the sign
 * in page already offers the way to create an account too.
 */
export function AccountPage() {
  const { status, user, isAdmin, signOut } = useAuth();

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
        <div className="mt-6 flex flex-wrap gap-3">
          {/*
            The one place in the shop that acknowledges the dashboard exists,
            and it appears only for the accounts that can actually open it.

            There is no separate administrator login — an admin is a customer
            account whose profiles.role is 'admin' — so this is not a second
            front door, it is a link. `isAdmin` is `undefined` until the check
            settles, which is why this is an explicit `=== true`: rendering it
            optimistically would show a link that leads to a refusal.
          */}
          {isAdmin === true && (
            <Link to={ADMIN} className={buttonClasses({ size: "sm" })}>
              Store manager
            </Link>
          )}

          <button
            type="button"
            onClick={() => void signOut()}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            Sign out
          </button>
        </div>
      </PageHeader>

      <Container className="py-14 sm:py-20">
        {/*
          Details first, orders second. The details are short, they are the part
          a customer came here to CHANGE, and the order history below is
          unbounded — putting it first would bury a two-field form under a
          year of purchases.
        */}
        <h2 className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">Your details</h2>
        <div className="mt-6 max-w-2xl">
          <ProfileDetails />
        </div>

        <h2 className="mt-16 text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
          Your orders
        </h2>
        <div className="mt-6">
          <OrderHistory />
        </div>
      </Container>
    </>
  );
}
