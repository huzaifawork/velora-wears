/**
 * The dashboard's database client — which is the STOREFRONT's client.
 *
 * ---------------------------------------------------------------------------
 * ONE CLIENT, BECAUSE ONE SESSION
 * ---------------------------------------------------------------------------
 * This file used to build its own `createClient` with its own `storageKey`, so
 * that signing into the dashboard and signing into the shop were separate acts.
 * That was correct while the dashboard was a second application on a second
 * origin, and it is exactly wrong now that there is one sign-in for both.
 *
 * A Supabase session lives in the browser's storage under a key. Two clients
 * with two keys are two sessions: an admin who signed in on the shop's form
 * would arrive at `/admin` as a stranger. So the dashboard reaches for the same
 * client the storefront's `AuthProvider` signs in with, and the session it
 * finds is the session the person just created.
 *
 * THE SERVICE ROLE KEY IS STILL NOWHERE NEAR THIS APPLICATION. Authority comes
 * from the signed-in user's `profiles.role` being `'admin'`, which is what
 * `is_admin()` checks inside every admin policy in the schema — not from which
 * client object made the request.
 */

export { getSupabase, hasSupabaseConfig } from "@/lib/supabase";
