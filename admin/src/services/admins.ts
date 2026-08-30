import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { epoch } from "@admin/services/rows";

/**
 * Who can manage this shop.
 *
 * READ ONLY, and that is the design rather than an omission. `profiles.role`
 * has no UPDATE grant for `authenticated` (see
 * `20260830000003_profile_roles.sql`) — granting access is a database write,
 * made directly against the project. It stays that way so that holding an
 * admin session is not the same as being able to create more admin sessions:
 * an account that is somehow taken over can change the shop, and cannot
 * quietly add a second door into it.
 */

export interface AdminRecord {
  userId: string;
  email: string;
  createdAt: number;
}

export async function listAdmins(): Promise<AdminRecord[]> {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("id, email, created_at")
    .eq("role", "admin")
    .order("created_at", { ascending: true });

  if (error) throw new Error(describeError(error));

  return (data ?? []).map((row) => {
    const admin = row as { id: string; email: string | null; created_at: string };
    return {
      userId: admin.id,
      email: admin.email ?? "",
      createdAt: epoch(admin.created_at),
    };
  });
}
