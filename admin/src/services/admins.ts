import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { epoch } from "@admin/services/rows";

/**
 * Who can manage this shop.
 *
 * Being an administrator is `profiles.role = 'admin'` — one column on the
 * record that already describes the person, rather than a row in a second table
 * that held nothing but a uuid. `is_admin()` asks this same column, so what
 * this screen lists and what the database enforces are the same fact.
 *
 * ---------------------------------------------------------------------------
 * READ ONLY, AND NOT BY OMISSION
 * ---------------------------------------------------------------------------
 * There is no promote and no demote here, and there cannot be. A role change
 * from a signed-in session is refused by the database itself: `profiles.role`
 * is outside the column grant that lets a customer edit their own name and
 * phone, and `guard_profile_role` raises on any change made where `auth.uid()`
 * is set — which is every request either application can make.
 *
 * So roles are changed in the Supabase SQL or table editor, by whoever owns the
 * project. That is the point rather than a limitation: gaining control of an
 * administrator's browser must not be the same as gaining the ability to create
 * administrators.
 */

export interface AdminRecord {
  userId: string;
  email: string;
  fullName?: string;
  createdAt: number;
}

export async function listAdmins(): Promise<AdminRecord[]> {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("id, email, full_name, created_at")
    .eq("role", "admin")
    .order("created_at", { ascending: true });

  if (error) throw new Error(describeError(error));

  return (data ?? []).map((row) => {
    const admin = row as {
      id: string;
      email: string | null;
      full_name: string | null;
      created_at: string;
    };
    return {
      userId: admin.id,
      email: admin.email ?? "",
      fullName: admin.full_name ?? undefined,
      createdAt: epoch(admin.created_at),
    };
  });
}
