import { createContext, use } from "react";

/**
 * The signed-in customer's context and its hook, kept apart from
 * `AuthProvider` because a module that exports both components and plain
 * values loses fast refresh — the same split `CartContext`/`CartProvider`
 * uses.
 */

export interface AuthUser {
  id: string;
  email: string;
  /** From `user_metadata.full_name`, set at sign-up. Optional — nothing requires it. */
  fullName?: string;
  /**
   * When the account was created, and when this session began. Read from the
   * Supabase user record, so they cost nothing — no request, no extra state.
   *
   * The shop shows neither. The dashboard's account screen shows both, because
   * "when did this session start" is the sort of thing somebody managing a shop
   * on a shared machine has a reason to check.
   */
  createdAt?: number;
  lastSignInAt?: number;
}

export type AuthStatus = "loading" | "signed-out" | "signed-in";

/** What every auth call resolves to: nothing on success, a message on failure. */
export interface AuthResult {
  error?: string;
}

/**
 * Sign-in additionally reports whether this account manages the shop, so the
 * form can send an administrator to `/admin` and a customer to wherever they
 * were going — from ONE submit handler, with no second form and no guessing.
 */
export interface SignInResult extends AuthResult {
  isAdmin?: boolean;
}

export interface AuthApi {
  status: AuthStatus;
  user: AuthUser | null;
  /**
   * Whether the signed-in person may manage the shop (requirements section 8).
   *
   * ---------------------------------------------------------------------------
   * THERE IS ONE KIND OF ACCOUNT, NOT TWO
   * ---------------------------------------------------------------------------
   * An administrator is not a separate login. They are an ordinary customer
   * account whose `profiles.role` happens to be `'admin'` — so the same
   * form signs in both, and this flag is the only thing that differs
   * afterwards. That is why there is one sign-in page in this project and not
   * two: two forms would mean two ways to be wrong about which one to use, and
   * on separate deployments it would also mean two sessions.
   *
   * `undefined` means NOT YET KNOWN — either nobody is signed in, or the check
   * is still in flight. Callers must treat it as "wait", never as "no": showing
   * an administrator the "you are not an administrator" screen for a moment on
   * every visit is worse than a spinner.
   *
   * The answer comes from `is_admin()`, the SECURITY DEFINER function every
   * row-level-security policy in the schema calls. So what the interface shows
   * and what the database permits come from one place and cannot disagree — and
   * this flag decides only what to RENDER. It is not a permission (see
   * `admin/src/AdminApp.tsx`).
   */
  isAdmin: boolean | undefined;
  /**
   * The signed-in customer's access token, for linking a placed order to
   * their account (`placeOrder(input, accessToken)` already accepts one —
   * see `lib/placeOrder.ts`). `undefined` for a guest, which is the normal
   * case, not a fallback (requirements section 7).
   */
  accessToken: string | undefined;

  signUp: (email: string, password: string, fullName?: string) => Promise<AuthResult>;
  /**
   * Sign in. Resolves once the session AND the admin check have settled, so the
   * caller can read `isAdmin` from the result and route accordingly without
   * racing the provider.
   */
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  /**
   * Change the signed-in person's own password. Used by the account screens on
   * both sides — a customer's and an administrator's password are the same
   * thing, because the account is the same thing.
   */
  updatePassword: (password: string) => Promise<AuthResult>;
  /**
   * Re-ask the database whether this account is an administrator.
   *
   * For exactly one situation: somebody's `profiles.role` was just set to
   * `'admin'` in another window and they want in without signing out and back
   * in.
   */
  recheckAdmin: () => Promise<void>;
  /**
   * No password reset yet — deliberately. That flow needs a real email
   * provider, which this project does not have configured; build it when
   * the client provides one (see `context.md`). Until then, a customer who
   * forgets their password has no self-serve recovery.
   */
}

export const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const api = use(AuthContext);
  if (!api) throw new Error("useAuth must be used inside <AuthProvider>");
  return api;
}
