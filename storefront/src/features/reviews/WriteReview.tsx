import { useState } from "react";

import { REVIEW_AFTER_DELIVERY_MESSAGE, canReviewOrder } from "@shared/reviews";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/account/AuthContext";
import { ReviewComposer } from "@/features/reviews/ReviewComposer";
import { useAsync } from "@/hooks/useAsync";
import { listMyOrders } from "@/lib/myOrders";
import { ReviewLookupRateLimitedError, findOrderForReview } from "@/lib/reviewLookup";

/**
 * The entry point to writing a review from the product page — the two paths
 * requirements section 16 asks for, both landing on the same `ReviewComposer`
 * once ownership is established:
 *
 *  - **signed in**: `listMyOrders()` already exists for order history (the
 *    accounts work), so finding a qualifying order is a reuse, not a new
 *    endpoint (requirements section 18).
 *  - **guest**: verifies with the order number and the email the order was
 *    placed under, exactly as section 16 describes, via
 *    `findOrderForReview`.
 *
 * "Qualifying" means DELIVERED in both cases — see `shared/reviews.ts`. The
 * signed-in path checks the status it already has in hand; the guest path
 * gets it for free, because `find_order_for_review` returns nothing for an
 * order that has not arrived.
 *
 * A signed-in customer whose order has arrived can also review from order
 * history, which has the order id in hand already. The confirmation page has
 * a `reviewToken` but no delivered order to use it on, so it only links here.
 * This component is for a visitor on the product page — which, now that a
 * review waits for delivery, is where most reviews will be written.
 */
export function WriteReview({ productId, productName }: { productId: string; productName: string }) {
  const { status, accessToken } = useAuth();

  if (status === "loading") return <Skeleton className="h-11 w-40" />;

  if (status === "signed-in" && accessToken) {
    return <SignedInReview productId={productId} productName={productName} accessToken={accessToken} />;
  }

  return <GuestVerify productId={productId} productName={productName} />;
}

function SignedInReview({
  productId,
  productName,
  accessToken,
}: {
  productId: string;
  productName: string;
  accessToken: string;
}) {
  // Shared with `OrderHistory` — the same read, not a second query for the
  // same data (requirements section 18).
  const { data: orders, loading } = useAsync(() => listMyOrders(), "my-orders");

  if (loading) return <Skeleton className="h-11 w-40" />;

  // Orders come back newest first, so this is the most recent qualifying one:
  // delivered, and containing this piece.
  const matching = orders?.filter((o) => o.items.some((item) => item.productId === productId));
  const order = matching?.find((o) => canReviewOrder(o.status));

  if (!order) {
    return (
      <p className="text-sm text-ink-soft">
        {matching && matching.length > 0
          ? REVIEW_AFTER_DELIVERY_MESSAGE
          : "You can write a review once you have bought and received this piece."}
      </p>
    );
  }

  return (
    <ReviewComposer
      productId={productId}
      productName={productName}
      orderId={order.id}
      identity={{ mode: "session", accessToken }}
    />
  );
}

function GuestVerify({ productId, productName }: { productId: string; productName: string }) {
  const [open, setOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [verified, setVerified] = useState<{ orderId: string; reviewToken: string } | undefined>();

  if (verified) {
    return (
      <ReviewComposer
        productId={productId}
        productName={productName}
        orderId={verified.orderId}
        identity={{ mode: "token", reviewToken: verified.reviewToken }}
      />
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs tracking-eyebrow text-accent uppercase underline underline-offset-4 transition hover:text-ink"
      >
        Already bought this? Verify your order to write a review
      </button>
    );
  }

  const verify = async () => {
    setVerifying(true);
    setError(undefined);
    try {
      // Only delivered orders come back at all (the lookup applies the rule
      // in SQL), so "no match" covers a wrong guess and an order still on its
      // way alike — hence the message names both.
      const lines = await findOrderForReview(orderNumber.trim(), email.trim());
      const match = lines.find((line) => line.productId === productId);
      if (!match) {
        setError(
          "We could not find a delivered order for this product with that order number and email. " +
            REVIEW_AFTER_DELIVERY_MESSAGE,
        );
        return;
      }
      setVerified({ orderId: match.orderId, reviewToken: match.reviewToken });
    } catch (err) {
      setError(
        err instanceof ReviewLookupRateLimitedError
          ? err.message
          : "We could not verify your order just now. Please try again.",
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void verify();
      }}
      className="flex flex-col gap-4 rounded-sm border border-line bg-canvas-alt p-5"
    >
      <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
        Verify your order to review this piece
      </p>

      <Field label="Order number" value={orderNumber} onChange={setOrderNumber} placeholder="VW-…" />
      <Field
        label="Email used on the order"
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="email"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" disabled={verifying || !orderNumber.trim() || !email.trim()}>
          {verifying ? "Checking…" : "Verify"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={verifying}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
