import type { UserRole } from "@shared/types";
import { getSupabase } from "@admin/lib/supabase";
import { describeError } from "@admin/lib/errors";
import { invalidate } from "@admin/lib/cache";
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
 * PROMOTING AND DEMOTING GOES THROUGH ONE DATABASE FUNCTION
 * ---------------------------------------------------------------------------
 * Not through an update. `profiles.role` is deliberately outside the column
 * grant that lets a customer edit their own name and phone, so no client can
 * write it through the table endpoints — that has not been loosened and must
 * not be. The dashboard instead calls `set_user_role()` (migration
 * 20260901000001), a SECURITY DEFINER function that does its own authorization
 * and refuses:
 *
 *   * a caller who is not an administrator;
 *   * a caller acting on their OWN row, in either direction — self-promotion is
 *     the escalation the guard exists to stop, and self-demotion is an admin
 *     locking themselves out of the screen they are standing on;
 *   * demoting the last remaining administrator.
 *
 * Those rules are enforced in Postgres, not here. The buttons on the Customers
 * and Account screens hide what the database would refuse so nobody is invited
 * to press something that cannot work — but hiding a button is a courtesy, and
 * the function is the rule.
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

/**
 * Promote an account to administrator, or demote one back to a customer.
 *
 * Resolves with the role the account actually ends up with — the function's own
 * return value, read back from the row it wrote — so a caller renders what the
 * database did rather than what it asked for. Setting a role somebody already
 * has is a no-op rather than an error, which is what two administrators
 * pressing the same button a second apart should get.
 *
 * Both tags are invalidated: the Customers list shows the badge and the Account
 * screen lists the administrators, and a promotion changes both.
 */
export async function setUserRole(userId: string, role: UserRole): Promise<UserRole> {
  const { data, error } = await getSupabase().rpc("set_user_role", {
    target_user: userId,
    new_role: role,
  });

  if (error) throw new Error(describeError(error));

  invalidate("customers", "admins");
  return (data as UserRole | null) ?? role;
}
