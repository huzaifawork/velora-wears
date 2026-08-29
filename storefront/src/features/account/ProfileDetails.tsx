import { useState } from "react";

import type { Profile } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsync } from "@/hooks/useAsync";
import { getMyProfile, updateMyProfile } from "@/lib/profile";

/**
 * The customer's own details, on their account page.
 *
 * This is the visible half of `public.profiles`: the record the database
 * creates for every account at sign-up now has somewhere the customer can
 * actually see and correct it.
 *
 * Two fields, and the absences are deliberate:
 *
 *  - **Email is shown, not editable.** It is mirrored from `auth.users` and the
 *    database grants update on `full_name` and `phone` only. Changing an email
 *    address is an auth operation with a confirmation step behind it, not a
 *    text input — and this project has no mail service to send that
 *    confirmation with (the same reason there is no password reset).
 *  - **No delivery address.** An address belongs to an ORDER, which keeps its
 *    own copy of where it was sent. Storing "the" address here would invite the
 *    idea that editing it changes something about an order already dispatched.
 *    Checkout already prefills from the customer's most recent order, which is
 *    a better answer than a second address that can quietly disagree with it.
 */
export function ProfileDetails() {
  const profile = useAsync(() => getMyProfile(), "profile:me");

  if (profile.loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  /*
   * A failed read is reported and nothing more. These details are a convenience
   * on a page whose real content is the order history below — taking the whole
   * page down because a name could not be loaded would be the wrong trade.
   */
  if (profile.error) {
    return (
      <p className="text-sm leading-relaxed text-ink-soft">
        Your details could not be loaded just now. Your orders are unaffected.
      </p>
    );
  }

  return <ProfileForm key={profile.data?.updatedAt ?? 0} profile={profile.data} />;
}

/**
 * Mounted only once the profile has loaded, and keyed on it, so its fields
 * start correct rather than being filled in by an effect a frame later.
 *
 * `profile` may be `null` — an account created before the table existed. The
 * form still works: the row is created by the backfill in the migration, and if
 * it somehow is not there the save simply reports that nothing matched.
 */
function ProfileForm({ profile }: { profile: Profile | null | undefined }) {
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();

  const dirty =
    fullName.trim() !== (profile?.fullName ?? "") || phone.trim() !== (profile?.phone ?? "");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving) return;

    setSaving(true);
    setError(undefined);
    setSaved(false);

    try {
      await updateMyProfile({ fullName, phone });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Full name"
          autoComplete="name"
          maxLength={80}
          value={fullName}
          onChange={(value) => {
            setSaved(false);
            setFullName(value);
          }}
          disabled={saving}
        />

        <Field
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          optional
          value={phone}
          onChange={(value) => {
            setSaved(false);
            setPhone(value);
          }}
          disabled={saving}
          hint="Used to reach you about a delivery."
        />
      </div>

      {profile?.email && (
        <div>
          <p className="text-[0.625rem] tracking-eyebrow text-ink-muted uppercase">
            Email address
          </p>
          <p className="mt-2 text-sm text-ink">{profile.email}</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            This is what you sign in with, so it cannot be changed here.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm leading-relaxed text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="secondary" size="sm" disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save details"}
        </Button>

        {/* `role="status"` so the confirmation is announced rather than only
            seen — the button's label does not change, so there is otherwise
            nothing for a screen reader to notice. */}
        {saved && !dirty && (
          <span role="status" className="text-sm text-success">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
