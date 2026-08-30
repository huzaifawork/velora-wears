import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@admin/components/ui/Button";
import { Wordmark } from "@admin/components/layout/Sidebar";
import { useAuth } from "@/features/account/AuthContext";
import { HOME } from "@/lib/routes";

/**
 * Signed in successfully, and not an administrator.
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE PRICE OF ONE LOGIN, AND IT IS WORTH PAYING
 * ---------------------------------------------------------------------------
 * There is a single sign-in form for the whole project, so every customer who
 * has ever created an account can reach `/admin` with a perfectly valid
 * session. That is not a hole — row level security refuses every read and every
 * write to them regardless — but it does mean this screen is reached by
 * ordinary customers who followed a link, as well as by administrators-to-be
 * whose role is still `user`.
 *
 * So it says two things at once, and neither is an error message: the shop is
 * that way, and if you are supposed to be here, this is the statement that
 * grants it — pre-filled with their own email, because that is what the
 * statement needs and retyping it is where a typo would come from.
 *
 * A 404 would have been easier and would have been wrong: it would tell an
 * administrator whose access has not been granted yet that the dashboard does
 * not exist.
 */
export function NotAnAdminPage() {
  const { user, signOut, recheckAdmin } = useAuth();
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);

  const identifier = user?.id ?? "";

  const onRecheck = async () => {
    setChecking(true);
    await recheckAdmin();
    setChecking(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="flex justify-center">
          <Wordmark />
        </div>

        <div className="mt-8 rounded-xl border border-line bg-surface p-6 shadow-raised">
          <h1 className="text-xl text-ink">This account cannot manage the shop</h1>

          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            You are signed in as{" "}
            <span className="text-ink">{user?.email || "this account"}</span>, and
            that account has not been granted administrator access. If you were
            looking for the shop, it is through the button below — there is
            nothing wrong with your account.
          </p>

          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            If you are supposed to be here: every screen in the dashboard reads
            and writes through row level security, and those policies check that
            your account&rsquo;s{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">role</code>{" "}
            is <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">admin</code>.
            Every account starts as a{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">user</code>.
            Until yours is changed, nothing here will load — that is the database
            protecting the shop, not a fault in the dashboard.
          </p>

          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            {/*
              The SQL editor, not this dashboard, and not by an admin through
              the API — `guard_profile_role` refuses a role change from any
              signed-in session. Whoever owns the Supabase project runs:
            */}
            Whoever owns the Supabase project can grant it from the SQL editor:
          </p>

          <pre className="mt-3 overflow-x-auto rounded-lg bg-brand-deep p-4 text-xs leading-relaxed text-white/85">
            {`update public.profiles
   set role = 'admin'
 where email = '${user?.email ?? "<your-email>"}';`}
          </pre>

          {identifier && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(identifier);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-3 w-full rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-left text-xs break-all text-ink-soft transition hover:border-ink-muted"
            >
              <span className="block text-ink-muted">
                {copied ? "Copied" : "Your user id — click to copy"}
              </span>
              <code>{identifier}</code>
            </button>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to={HOME}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand-soft"
            >
              Back to the shop
            </Link>
            <Button variant="secondary" onClick={() => void onRecheck()} loading={checking}>
              I have been added — check again
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
