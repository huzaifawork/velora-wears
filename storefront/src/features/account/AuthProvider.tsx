import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { AuthContext, type AuthApi, type AuthResult, type AuthStatus, type AuthUser } from "@/features/account/AuthContext";
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
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(hasSupabaseConfig() ? "loading" : "signed-out");

  useEffect(() => {
    if (!hasSupabaseConfig()) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const { getSupabase } = await import("@/lib/supabase");
      const supabase = getSupabase();

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setStatus(data.session ? "signed-in" : "signed-out");

      const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
        setSession(next);
        setStatus(next ? "signed-in" : "signed-out");
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      if (cancelled) unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const api = useMemo<AuthApi>(
    () => ({
      status,
      user: toUser(session),
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
        return toResult(error);
      },

      async signOut() {
        const { getSupabase } = await import("@/lib/supabase");
        await getSupabase().auth.signOut();
      },
    }),
    [status, session],
  );

  return <AuthContext value={api}>{children}</AuthContext>;
}

function toUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    fullName: (session.user.user_metadata?.full_name as string | undefined) || undefined,
  };
}

function toResult(error: { message: string } | null): AuthResult {
  return error ? { error: error.message } : {};
}
