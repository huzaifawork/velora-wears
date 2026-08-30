import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import {
  AuthContext,
  type AuthApi,
  type AuthResult,
  type AuthStatus,
  type AuthUser,
} from "@/features/account/AuthContext";
import { hasSupabaseConfig } from "@/lib/env";

/**
 * Holds the signed-in customer for the whole app — optional accounts, the
 * note added to requirements section 12 on 2026-08-29. Guest checkout
 * (section 7) remains mandatory and untouched; this only ever adds an
 * alternative.
 *
 * **Identity has no "demo mode".** `lib/queries.ts` keeps the Supabase SDK
 * out of the bundle entirely while `VITE_DATA_SOURCE=demo`, because there is
 * a real alternative catalog to read instead. There is no alternative
 * identity provider — accounts are either backed by the live Supabase
 * project or they do not exist — so this provider always attempts the
 * dynamic import, on every page, regardless of the data source. The `supabase`
 * chunk is no longer empty once this feature is live. That is a real,
 * deliberate cost of building this section; see `context.md`.
 *
 * The import is still dynamic rather than static, so it does not block the
 * first paint and the SDK is not in the main bundle — only requested once
 * this component mounts, which is every page, but after the shell renders.
 *
 * ---------------------------------------------------------------------------
 * IT ALSO ANSWERS "IS THIS PERSON AN ADMINISTRATOR?" (section 8)
 * ---------------------------------------------------------------------------
 * Added 2026-08-30, when the admin dashboard was merged into this application
 * so that both halves could share ONE sign-in. An administrator is not a second
 * kind of account — they are a customer whose user id is in the `admins` table
 * — so the same provider that holds the session holds the answer.
 *
 * The check is `is_admin()`, the same function the database's own policies
 * call, and it runs ONCE per session rather than per page: it is skipped
 * entirely for the guests who are most of the traffic, and it is not repeated
 * on a token refresh, which happens hourly and cannot change the answer.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(hasSupabaseConfig() ? "loading" : "signed-out");
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);

  /**
   * Ask the database, not the token.
   *
   * A JWT can carry claims, and this project puts none in it — deliberately. A
   * claim minted at sign-in is a second copy of the truth that goes stale the
   * moment somebody is added to or removed from `admins`, and it would have to
   * be kept in step with a table that the database is already reading directly.
   *
   * A failure resolves to `false` rather than throwing: the honest reading of
   * "we could not establish that you are an administrator" is that the
   * dashboard should not open, and the database would refuse it anyway.
   */
  const checkAdmin = useCallback(async (): Promise<boolean> => {
    try {
      const { getSupabase } = await import("@/lib/supabase");
      const { data, error } = await getSupabase().rpc("is_admin");
      return !error && data === true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const { getSupabase } = await import("@/lib/supabase");
      const supabase = getSupabase();

      const apply = async (next: Session | null) => {
        if (cancelled) return;
        setSession(next);
        setStatus(next ? "signed-in" : "signed-out");

        if (!next) {
          setIsAdmin(undefined);
          return;
        }

        const admin = await checkAdmin();
        if (!cancelled) setIsAdmin(admin);
      };

      const { data } = await supabase.auth.getSession();
      await apply(data.session);

      const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
        // A token refresh is not a sign-in. Re-running the admin check on every
        // one would put a request on the wire each hour for an answer that
        // cannot have changed as a result of the refresh itself.
        if (event === "TOKEN_REFRESHED") {
          setSession(next);
          return;
        }
        void apply(next);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      if (cancelled) unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [checkAdmin]);

  const api = useMemo<AuthApi>(
    () => ({
      status,
      user: toUser(session),
      isAdmin,
      accessToken: session?.access_token,

      async signUp(email, password, fullName) {
        const { getSupabase } = await import("@/lib/supabase");
        const { error } = await getSupabase().auth.signUp({
          email,
          password,
          options: fullName ? { data: { full_name: fullName } } : undefined,
        });
        return toResult(error);
      },

      async signIn(email, password) {
        const { getSupabase } = await import("@/lib/supabase");
        const { error } = await getSupabase().auth.signInWithPassword({ email, password });
        if (error) return toResult(error);

        /*
         * The admin check is awaited HERE, inside sign-in, rather than left to
         * the auth-state listener above.
         *
         * Both will run it, and the listener's result is what the rest of the
         * app reads. But the form that just submitted has to decide, right now,
         * whether to send this person to the shop or to `/admin` — and reading
         * `isAdmin` off the provider a millisecond after `signIn` resolves is a
         * race it would usually lose, sending an administrator to the account
         * page instead. So the answer is returned with the result.
         */
        const admin = await checkAdmin();
        setIsAdmin(admin);
        return { isAdmin: admin };
      },

      async signOut() {
        const { getSupabase } = await import("@/lib/supabase");
        await getSupabase().auth.signOut();
        setIsAdmin(undefined);
      },

      async updatePassword(password) {
        const { getSupabase } = await import("@/lib/supabase");
        const { error } = await getSupabase().auth.updateUser({ password });
        return toResult(error);
      },

      async recheckAdmin() {
        if (!session) return;
        setIsAdmin(await checkAdmin());
      },
    }),
    [status, session, isAdmin, checkAdmin],
  );

  return <AuthContext value={api}>{children}</AuthContext>;
}

function toUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  const { user } = session;

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: (user.user_metadata?.full_name as string | undefined) || undefined,
    createdAt: user.created_at ? new Date(user.created_at).getTime() : undefined,
    lastSignInAt: user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : undefined,
  };
}

function toResult(error: { message: string } | null): AuthResult {
  return error ? { error: error.message } : {};
}
