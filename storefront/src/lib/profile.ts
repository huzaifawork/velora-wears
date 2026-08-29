import type { Profile } from "@shared/types";

/**
 * The signed-in customer's own profile (`public.profiles`).
 *
 * Their account record — created by a database trigger the moment they sign up
 * (see `supabase/migrations/20260830000002_customer_profiles.sql`), so the
 * storefront never has to create one and cannot fail to.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT IN `lib/queries.ts`
 * ---------------------------------------------------------------------------
 * That module is the CATALOG read layer, and its whole design is that it can be
 * served by either `demoSource` or `supabaseSource` — which is what keeps the
 * shop reviewable without a database. A profile has no demo equivalent: it
 * belongs to a real signed-in person or it does not exist. `AuthProvider` makes
 * the same distinction for the same reason — identity has no demo mode.
 *
 * So this talks to Supabase directly, and every function here assumes a
 * session. Row level security is what makes that safe rather than trusting:
 * `"customers read their own profile"` restricts the read to `id = auth.uid()`,
 * so this cannot fetch somebody else's even if asked to.
 */

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, email, full_name, phone, created_at, updated_at";

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email ?? undefined,
    fullName: row.full_name ?? undefined,
    phone: row.phone ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

/**
 * The signed-in customer's profile, or `null`.
 *
 * `null` is a legitimate answer, not an error: an account created before this
 * table existed, or one whose trigger warned rather than raised (it is written
 * to never block sign-up — see the migration). The account still works; the
 * screens that read this fall back to what the session already knows.
 *
 * No user id is passed in. There is no version of this function that reads
 * somebody else's profile, which is the point.
 */
export async function getMyProfile(): Promise<Profile | null> {
  const { getSupabase } = await import("@/lib/supabase");

  const { data, error } = await getSupabase()
    .from("profiles")
    .select(COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toProfile(data as ProfileRow) : null;
}

export interface ProfileInput {
  fullName: string;
  phone: string;
}

/**
 * Update the two fields a customer owns.
 *
 * EMAIL IS NOT ONE OF THEM, and that is enforced by the database rather than by
 * this function omitting it: `profiles.email` mirrors `auth.users`, and the
 * migration grants `update (full_name, phone)` only. Changing an email address
 * is an auth operation with a confirmation step, not a text field on a form.
 *
 * The name is also written back to the auth session's metadata, so the header
 * greeting changes immediately instead of staying stale until the next sign-in.
 * The profile row is the record; the metadata is a convenience copy, and this
 * is the one place that keeps them in step.
 */
export async function updateMyProfile(input: ProfileInput): Promise<Profile> {
  const { getSupabase } = await import("@/lib/supabase");
  const supabase = getSupabase();

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();

  // Read from the LOCAL session rather than `auth.getUser()`, which makes a
  // network round trip to re-validate the token. This id is not a security
  // boundary — row level security already restricts the update to
  // `id = auth.uid()`, which Postgres evaluates from the JWT and not from
  // anything sent here. It is a guard against a missing session updating
  // nothing at all rather than matching whatever the policy would allow.
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("You are not signed in.");

  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName || null, phone: phone || null })
    .eq("id", userId)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);

  await supabase.auth.updateUser({ data: { full_name: fullName || null } });

  return toProfile(data as ProfileRow);
}
