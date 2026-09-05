/**
 * The reviews THIS BROWSER has written, and the tokens that prove it.
 *
 * Reviews were opened to everybody on 2026-09-05 (the client's instruction,
 * quoted in `shared/reviews.ts`). That created a person the shop has never had
 * to recognise before: a reviewer with no account and no order — nothing the
 * server can identify them by at all.
 *
 * Section 16 still asks that a review be editable and removable for a while,
 * so recognising them is not optional. The answer is the smallest one that
 * works: when a review is written, the browser mints a random token, sends it
 * with the review, and keeps it here. `submit-review` stores only its SHA-256,
 * and an edit or a delete means presenting the token again.
 *
 * ---------------------------------------------------------------------------
 * `localStorage`, DELIBERATELY — unlike `lib/orderReceipt.ts`
 * ---------------------------------------------------------------------------
 * The receipt uses `sessionStorage` because a receipt is for one visit. This is
 * the opposite case: the whole point is to still be recognised in a fortnight,
 * on the visit where the customer decides they were too harsh. `sessionStorage`
 * would mean the edit window closed when the tab did.
 *
 * WHAT IS KEPT IS NOT PERSONAL DATA (section 17): a product id, a review id
 * and a random token. No name, no email, nothing that says who the person is —
 * the display name they typed is on the public review anyway, and is not
 * needed here.
 *
 * ---------------------------------------------------------------------------
 * LOSING IT IS AN ACCEPTED COST
 * ---------------------------------------------------------------------------
 * A cleared browser, a different device, private browsing: the review stays up
 * and its author can no longer edit it. That is the honest price of not asking
 * anyone to sign in, and it is the client's trade to have made. The admin can
 * still remove anything from the dashboard, which is the case that actually
 * matters.
 *
 * Every read and write is guarded, because storage throws outright in some
 * privacy modes rather than merely being empty — a review form must not fail
 * to render because a browser refuses to remember things.
 */

const KEY = "velora.myReviews.v1";

export interface OwnReviewRef {
  reviewId: string;
  /** Presented to `submit-review` to edit or delete. Never displayed. */
  authorToken: string;
}

type Store = Record<string, OwnReviewRef>;

function read(): Store {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Full, or refused. The review itself is already saved on the server; all
    // that is lost is the ability to edit it from this browser, which is not
    // worth an error message on a form that just succeeded.
  }
}

/** What this browser wrote about `productId`, if anything. */
export function ownReviewFor(productId: string): OwnReviewRef | undefined {
  return read()[productId];
}

/**
 * A fresh token for a review about to be written.
 *
 * `crypto.randomUUID` is available in every browser this storefront targets and
 * over HTTPS everywhere it is deployed. The fallback exists for the one case
 * that is not — a plain-HTTP origin, where `crypto` is not a secure context —
 * so a review can still be written there; it is weaker, and it only ever
 * guards the author's own edit link.
 */
export function newAuthorToken(): string {
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function rememberOwnReview(productId: string, ref: OwnReviewRef): void {
  write({ ...read(), [productId]: ref });
}

export function forgetOwnReview(productId: string): void {
  const store = read();
  if (!(productId in store)) return;
  delete store[productId];
  write(store);
}
