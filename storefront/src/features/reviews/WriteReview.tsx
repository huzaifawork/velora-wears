import { useState } from "react";

import { REVIEW_VERIFIED_AFTER_DELIVERY_MESSAGE } from "@shared/reviews";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/account/AuthContext";
import { ReviewComposer } from "@/features/reviews/ReviewComposer";
import { ReviewLookupRateLimitedError, findOrderForReview } from "@/lib/reviewLookup";

/**
 * The entry point to writing a review from the product page.
 *
 * ---------------------------------------------------------------------------
 * THIS USED TO BE THE GATE. IT IS NOW THE OPPOSITE.
 * ---------------------------------------------------------------------------
 * Until 2026-09-05 this component's whole job was deciding whether a visitor
 * was ALLOWED to write a review: it looked their orders up, or made a guest
 * type an order number and email, and showed a sentence instead of a form when
 * neither produced a delivered order. The client asked for that to go —
 * account or no account, purchase or no purchase, everyone can review (the
 * instruction is quoted in `shared/reviews.ts`).
 *
 * So the composer is simply rendered. No lookup runs before it, nothing is
 * fetched to decide whether it may appear, and there is no branch in which a
 * visitor is told to come back later.
 *
 * What is left of the old machinery is `VerifyOrder`, folded INSIDE the open
 * form as an optional extra: a customer who did buy the piece can prove it and
 * have the review carry a **Verified** badge. It is deliberately the last thing
 * in the form and deliberately collapsed — an optional step that looks like a
 * required one is worse than not offering it.
 *
 * A signed-in customer needs no such step. Their session goes to
 * `submit-review`, which finds a delivered order on the account by itself; the
 * badge appears on the saved review without anybody being asked anything. That
 * is why nothing here reads `listMyOrders()` any more — the server already
 * knows, and asking the browser to find out first was a round trip that only
 * ever produced a worse answer.
 */
export function WriteReview({ productId, productName }: { productId: string; productName: string }) {
  const { status, accessToken } = useAuth();

  /** Set once the optional verification succeeds — the order and its token,
   *  exactly as a fresh checkout would have handed them over. */
  const [verified, setVerified] = useState<{ orderId: string; reviewToken: string }>();

  // Only as long as it takes to know whether there is a session to pass along.
  // A form that appeared and then changed what it could prove would be worse
  // than a moment of skeleton.
  if (status === "loading") return <Skeleton className="h-11 w-40" />;

  return (
    <ReviewComposer
      // Remounts when the visitor moves to another product. The composer reads
      // "the review this browser already wrote about this piece" once, on
      // mount, so a shared instance carried between two product pages would
      // offer to edit the wrong one.
      key={productId}
      productId={productId}
      productName={productName}
      accessToken={accessToken}
      order={verified}
      verifySlot={
        // A signed-in customer is checked automatically, so offering them a
        // form to type their own order number into would be asking for
        // something already known.
        status === "signed-in" ? undefined : (
          <VerifyOrder productId={productId} verified={Boolean(verified)} onVerified={setVerified} />
        )
      }
    />
  );
}

/**
 * The optional "I actually bought this" step (requirements section 16's guest
 * path), reduced to what it now is: a way to EARN the Verified badge, not a
 * way through the door.
 *
 * It reuses `findOrderForReview` unchanged — the `SECURITY DEFINER` lookup that
 * takes an order number and the email the order was placed under and returns
 * the same `orderId` + `reviewToken` pair a fresh checkout would have. Only
 * delivered orders come back at all (the rule is applied in SQL), so "no match"
 * still covers a wrong guess and an order still in transit alike, which is why
 * the message names both possibilities and neither is treated as a failure of
 * the review.
 */
function VerifyOrder({
  productId,
  verified,
  onVerified,
}: {
  productId: string;
  verified: boolean;
  onVerified: (order: { orderId: string; reviewToken: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (verified) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-line bg-canvas p-3">
        <Badge tone="success">Verified</Badge>
        <span className="text-xs text-ink-soft">
          Your order was found. This review will show as a verified purchase.
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs tracking-eyebrow text-ink-muted uppercase underline underline-offset-4 transition hover:text-accent"
      >
        Bought this from us? Add a verified badge — optional
      </button>
    );
  }

  const verify = async () => {
    setChecking(true);
    setError(undefined);
    try {
      const lines = await findOrderForReview(orderNumber.trim(), email.trim());
      const match = lines.find((line) => line.productId === productId);
      if (!match) {
        setError(
          "We could not match that order number and email to a delivered order of this piece. " +
            REVIEW_VERIFIED_AFTER_DELIVERY_MESSAGE,
        );
        return;
      }
      onVerified({ orderId: match.orderId, reviewToken: match.reviewToken });
    } catch (err) {
      setError(
        err instanceof ReviewLookupRateLimitedError
          ? err.message
          : "We could not check your order just now. You can still post your review without the badge.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-line bg-canvas p-4">
      <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
        Verified badge <span className="normal-case">— optional</span>
      </p>
      <p className="text-xs leading-relaxed text-ink-soft">
        {REVIEW_VERIFIED_AFTER_DELIVERY_MESSAGE}
      </p>

      <Field label="Order number" value={orderNumber} onChange={setOrderNumber} placeholder="VW-…" />
      <Field
        label="Email used on the order"
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="email"
      />

      {error && <p className="text-xs leading-relaxed text-danger">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {/*
          `type="button"` on both, and it matters more than usual: this sits
          inside the review form, so a submit-typed button here would post the
          review instead of checking the order.
        */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void verify()}
          disabled={checking || !orderNumber.trim() || !email.trim()}
        >
          {checking ? "Checking…" : "Check my order"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={checking}>
          Skip
        </Button>
      </div>
    </div>
  );
}
