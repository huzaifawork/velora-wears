import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase browser client.
 *
 * `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are compiled into the bundle
 * and are PUBLIC by design — that is what the anon key is for. Security comes
 * from row level security in the database, not from hiding this config, exactly
 * as it did from the rules file under Firebase.
 *
 * THE SERVICE ROLE KEY MUST NEVER APPEAR IN THIS APP. It bypasses RLS entirely.
 * Anything privileged — placing an order, writing a review — goes through an
 * Edge Function, which holds that key server-side. ESLint enforces this: the
 * name is banned in `storefront/`.
 *
 * The client is created lazily so that in demo mode it is never constructed and
 * the Supabase SDK is never even downloaded (see `lib/queries.ts`).
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!url || !anonKey) {
      throw new Error(
        "Supabase config missing. Copy .env.example to .env.local in storefront/ and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      );
    }

    client = createClient(url, anonKey, {
      auth: {
        // The storefront is a guest-first shop: checkout must work without an
        // account (requirements section 7). Nothing here depends on a session,
        // so there is no reason to keep one alive or to parse one out of a URL.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}

/** True when the storefront is configured to talk to Supabase at all. */
export function hasSupabaseConfig(): boolean {
  return Boolean(url && anonKey);
}
