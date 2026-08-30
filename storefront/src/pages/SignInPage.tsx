import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthLayout, FormError } from "@/features/account/AuthLayout";
import { useAuth } from "@/features/account/AuthContext";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ACCOUNT, ADMIN, SIGN_UP } from "@/lib/routes";

/**
 * Sign in — the ONLY sign-in form in this project (requirements section 12's
 * optional accounts, on top of guest checkout in section 7, which is unaffected
 * and unchanged).
 *
 * ---------------------------------------------------------------------------
 * ONE FORM, TWO DESTINATIONS
 * ---------------------------------------------------------------------------
 * There is no separate administrator login, because there is no separate
 * administrator account: an admin is a customer account whose user id appears
 * in the `admins` table. The same email and password that buy a hoodie open the
 * dashboard, if that row exists.
 *
 * So this form asks nobody to choose. It signs in, asks the database
 * `is_admin()`, and routes on the answer — the dashboard for an administrator,
 * and wherever they were going for everyone else. An admin who was already
 * heading somewhere specific (`?next=`) keeps that destination; the redirect to
 * `/admin` is the DEFAULT, not an override, so "sign in to check out" still
 * returns an administrator to checkout rather than hijacking them.
 *
 * `?next=` otherwise sends the customer back to wherever they came from —
 * chiefly the "Sign in to use your saved details" line above `CheckoutForm` —
 * rather than always landing on `/account`.
 */
export function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  /** Where they were going before they were asked to sign in, if anywhere. */
  const next = params.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);

    const result = await signIn(email.trim(), password);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    // An explicit destination always wins — including for an administrator, who
    // may well have been sent here by the checkout rather than by the
    // dashboard. Only when nothing was asked for does being an admin decide it.
    navigate(next ?? (result.isAdmin ? ADMIN : ACCOUNT), { replace: true });
  }

  return (
    <AuthLayout
      title="Sign in"
      description="See your past orders and check out a little faster. If your account manages the shop, this is the way in to the dashboard too."
    >
      {error && <FormError message={error} />}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Field
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          disabled={submitting}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          disabled={submitting}
        />

        <Button type="submit" size="lg" disabled={submitting} className="w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-ink-soft">
        New here?{" "}
        <Link to={SIGN_UP} className="text-ink underline underline-offset-4 transition hover:text-accent">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
