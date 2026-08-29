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
}

export type AuthStatus = "loading" | "signed-out" | "signed-in";

/** What every auth call resolves to: nothing on success, a message on failure. */
export interface AuthResult {
  error?: string;
}

export interface AuthApi {
  status: AuthStatus;
  user: AuthUser | null;
  /**
   * The signed-in customer's access token, for linking a placed order to
   * their account (`placeOrder(input, accessToken)` already accepts one —
   * see `lib/placeOrder.ts`). `undefined` for a guest, which is the normal
   * case, not a fallback (requirements section 7).
   */
  accessToken: string | undefined;

  signUp: (email: string, password: string, fullName?: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
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
