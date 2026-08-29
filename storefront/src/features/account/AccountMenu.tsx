import { Link } from "react-router-dom";

import { useAuth } from "@/features/account/AuthContext";
import { ACCOUNT, SIGN_IN } from "@/lib/routes";

/**
 * The account entry in the header — "add login/signup in the header", the
 * note added to requirements section 12. An icon button rather than a
 * dropdown, matching the search and bag buttons beside it (requirements
 * section 18): one tap to `/account`, which itself shows the sign-in form
 * when signed out or the order history when signed in, so there is nowhere
 * else the state needs to be duplicated.
 *
 * Nothing renders while the session is still resolving, avoiding a flash of
 * "Sign in" that would immediately swap to the signed-in icon on most visits
 * once a session exists.
 */
export function AccountMenu() {
  const { status, user } = useAuth();

  if (status === "loading") return <div className="h-11 w-11" aria-hidden="true" />;

  const signedIn = status === "signed-in";

  return (
    <Link
      to={signedIn ? ACCOUNT : SIGN_IN}
      className="relative -mr-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-canvas-alt"
      aria-label={signedIn ? `Your account${user?.email ? `, ${user.email}` : ""}` : "Sign in or create an account"}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20c1.4-4 5-5.5 7.5-5.5s6.1 1.5 7.5 5.5" />
      </svg>

      {signedIn && (
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent ring-2 ring-canvas"
        />
      )}
    </Link>
  );
}

/**
 * The same state, as a row in the mobile menu — the header's icon has no
 * label there, and a phone menu already lists everything else as text
 * (requirements section 15).
 */
export function AccountMobileLink({ onNavigate }: { onNavigate: () => void }) {
  const { status, user, signOut } = useAuth();

  if (status === "loading") return null;

  if (status === "signed-in") {
    return (
      <div className="flex items-center justify-between border-b border-line py-4 last:border-0">
        <Link
          to={ACCOUNT}
          onClick={onNavigate}
          className="text-xs font-medium tracking-eyebrow text-ink uppercase"
        >
          {user?.fullName || "Your account"}
        </Link>
        <button
          type="button"
          onClick={() => {
            onNavigate();
            void signOut();
          }}
          className="text-xs text-ink-soft underline underline-offset-4 transition hover:text-accent"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <Link
      to={SIGN_IN}
      onClick={onNavigate}
      className="border-b border-line py-4 text-xs font-medium tracking-eyebrow text-ink uppercase last:border-0"
    >
      Sign in
    </Link>
  );
}
