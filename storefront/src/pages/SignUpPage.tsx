import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AuthLayout, FormError } from "@/features/account/AuthLayout";
import { useAuth } from "@/features/account/AuthContext";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { ACCOUNT, SIGN_IN } from "@/lib/routes";

/** Matches Supabase's own `password_min_length` (project auth settings). */
const MIN_PASSWORD = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Create an account — optional, per the note added to requirements section
 * 12. Guest checkout (section 7) is not touched by this page at all.
 *
 * **No email confirmation step.** Sign-up auto-confirms (a deliberate
 * decision recorded in `context.md`): there is no mail service on this
 * project to depend on for it, so `signUp` returns a session directly and
 * this page can go straight to `/account`.
 *
 * Only email and password are validated here — the SAME bar Supabase's own
 * API enforces (`password_min_length` in the project's auth settings), so a
 * rejection is never a surprise the form did not already show. Everything
 * else about whether an email is real is Supabase's problem, not this form's.
 */
export function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);

  const emailError =
    submitted && !EMAIL_RE.test(email.trim()) ? "Please enter a valid email address." : undefined;
  const passwordError =
    submitted && password.length < MIN_PASSWORD
      ? `Use at least ${MIN_PASSWORD} characters.`
      : undefined;
  const confirmError =
    submitted && confirm !== password ? "Passwords do not match." : undefined;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError(undefined);

    if (!EMAIL_RE.test(email.trim()) || password.length < MIN_PASSWORD || confirm !== password) {
      return;
    }

    setSubmitting(true);
    const result = await signUp(email.trim(), password, fullName.trim() || undefined);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    navigate(ACCOUNT, { replace: true });
  }

  return (
    <AuthLayout
      title="Create an account"
      description="Optional — guest checkout still works exactly as it always has."
    >
      {error && <FormError message={error} />}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Field
          label="Full name"
          optional
          autoComplete="name"
          value={fullName}
          onChange={setFullName}
          disabled={submitting}
        />
        <Field
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          error={emailError}
          onChange={setEmail}
          disabled={submitting}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD} characters.`}
          value={password}
          error={passwordError}
          onChange={setPassword}
          disabled={submitting}
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          error={confirmError}
          onChange={setConfirm}
          disabled={submitting}
        />

        <Button type="submit" size="lg" disabled={submitting} className="mt-2 w-full">
          {submitting ? "Creating your account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link to={SIGN_IN} className="text-ink underline underline-offset-4 transition hover:text-accent">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
