import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthLayout, FormError } from "@/features/account/AuthLayout";
import { useAuth } from "@/features/account/AuthContext";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ACCOUNT, SIGN_UP } from "@/lib/routes";

/**
 * Sign in — the note added to requirements section 12: optional accounts, on
 * top of guest checkout (section 7), which is unaffected and unchanged.
 *
 * `?next=` sends the customer back to wherever they came from — chiefly the
 * "Sign in to use your saved details" line above `CheckoutForm` — rather than
 * always landing on `/account`.
 */
export function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || ACCOUNT;

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
    navigate(next, { replace: true });
  }

  return (
    <AuthLayout title="Sign in" description="See your past orders and check out a little faster.">
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
