import { useState } from "react";

import { Button } from "@admin/components/ui/Button";
import { Card, CardHeader, Detail, PageHeader } from "@admin/components/ui/Card";
import { Field } from "@admin/components/ui/Field";
import { useToast } from "@admin/components/ui/Toast";
import { useAuth } from "@/features/account/AuthContext";
import { useQuery } from "@admin/hooks/useQuery";
import { listAdmins } from "@admin/services/admins";
import { formatDateTime } from "@admin/lib/format";
import { Skeleton } from "@admin/components/ui/Skeleton";

/**
 * The administrator's own account.
 *
 * Three things, and the third is the one that stops a support conversation
 * before it starts:
 *
 *  1. Who is signed in.
 *  2. A password change — the only self-service credential operation this
 *     project can offer, since a reset-by-email flow needs an email provider
 *     the project does not have configured (the storefront has the same gap,
 *     for the same reason).
 *  3. WHO ELSE can manage the shop, read from `profiles` where `role =
 *     'admin'`. The list is readable by an admin and writable by nobody
 *     through this application: granting access is a database edit,
 *     deliberately, so that the ability to create administrators is not
 *     itself something a compromised admin session can do.
 */
export function AccountPage() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const admins = useQuery("admins:all", ["admins"], listAdmins);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your account"
        description="The account you are signed in with, and who else can manage this shop."
        action={
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Signed in as" />

          <dl className="mt-5 space-y-4">
            <Detail label="Email">{user?.email}</Detail>
            {user?.fullName && <Detail label="Name">{user.fullName}</Detail>}
            {user?.lastSignInAt && (
              <Detail label="This session started">
                {formatDateTime(user.lastSignInAt)}
              </Detail>
            )}
            <Detail label="User id">
              <code className="text-xs break-all text-ink-soft">{user?.id}</code>
            </Detail>
          </dl>

          <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
            Everything you can do here is decided by the database, not by this
            page: your <code>profiles</code> row has <code>role = &apos;admin&apos;</code>,
            and every policy in the schema checks that before allowing a read
            or a write.
          </p>
        </Card>

        <PasswordCard onSaved={() => toast.success("Password changed")} />

        <Card className="lg:col-span-2">
          <CardHeader
            title="Administrators"
            description="Everyone who can manage this shop."
          />

          {admins.loading ? (
            <div className="mt-5 space-y-2">
              {Array.from({ length: 2 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : admins.error ? (
            <p className="mt-5 text-sm text-ink-soft">
              The administrator list could not be read: {admins.error.message}
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-line">
              {(admins.data ?? []).map((admin) => (
                <li
                  key={admin.userId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {admin.email || admin.userId}
                      {admin.userId === user?.id && (
                        <span className="ml-2 text-xs text-ink-muted">(you)</span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-ink-muted">
                      {admin.userId}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-muted">
                    Added {formatDateTime(admin.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function PasswordCard({ onSaved }: { onSaved: () => void }) {
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    setError(undefined);

    if (password.length < 8) {
      setError("Use at least eight characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setSaving(true);
    const result = await updatePassword(password);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setPassword("");
    setConfirm("");
    onSaved();
  };

  return (
    <Card>
      <CardHeader
        title="Change your password"
        description="Applies immediately. Your current session stays signed in."
      />

      <div className="mt-5 space-y-4">
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="At least eight characters."
        />

        <Field
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />

        {error && (
          <p role="alert" className="text-sm leading-relaxed text-danger">
            {error}
          </p>
        )}

        <Button onClick={() => void onSubmit()} loading={saving}>
          Change password
        </Button>
      </div>

      <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
        There is no reset-by-email yet: this project has no email provider
        configured, and a link that goes nowhere would be worse than none. If
        you lose access, another administrator has to reset it for you.
      </p>
    </Card>
  );
}
