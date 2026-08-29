/**
 * Whether Supabase is configured at all — with NO dependency on the Supabase
 * SDK itself.
 *
 * `lib/supabase.ts` imports `@supabase/supabase-js` at module scope, so
 * anything that statically imports THAT file pulls the SDK into its chunk
 * even if `getSupabase()` is never called. `useCatalogRealtime` and
 * `AuthProvider` both need to know whether Supabase is configured BEFORE
 * deciding whether to dynamically import it — this is the SDK-free check
 * that makes that possible. `lib/supabase.ts` re-exports it so existing
 * callers keep importing it from there.
 */
export function hasSupabaseConfig(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
