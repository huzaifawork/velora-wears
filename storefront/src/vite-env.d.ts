/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where the catalog is read from (see `lib/queries.ts`).
   *
   *   demo      the throwaway catalog in src/lib/demoData.ts
   *   supabase  the live Postgres database
   *
   * Vite inlines this at BUILD time, so changing it needs a redeploy.
   */
  readonly VITE_DATA_SOURCE?: "demo" | "supabase";

  /**
   * Supabase project URL and ANON key. Compiled into the browser bundle and
   * PUBLIC by design — security comes from row level security, not secrecy.
   * The service role key must NEVER appear here.
   */
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
