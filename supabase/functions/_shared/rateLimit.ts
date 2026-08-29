// deno-lint-ignore-file no-explicit-any

/**
 * Rate limiting (requirements section 17), shared by every Edge Function that
 * writes something a bot could spam — `place-order` and `submit-review`.
 *
 * The actual counter is `check_rate_limit()` in Postgres (see the migration);
 * this is just the two lines of glue every function needs: read the caller's
 * IP, and turn "the counter is over" into the same `{ error }` shape every
 * function already returns for every other kind of failure.
 *
 * Both functions are deployed under `supabase/`, which is what the Supabase
 * CLI bundles (unlike `shared/` at the repo root, which is Node-side and this
 * folder cannot reach) — a relative import here is the one place code is
 * shared on the Deno side rather than duplicated per function.
 */

/**
 * Supabase's edge network sets this on every request; the leftmost address is
 * the original client (the standard `X-Forwarded-For` convention). A request
 * that somehow arrives without one falls back to a single shared bucket for
 * that function rather than skipping the check entirely — worse than a real
 * per-caller limit, but still a limit, and this should not happen in practice
 * on Supabase's own network.
 */
function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || "unknown";
}

/**
 * Returns a `Response` to send back immediately when the caller is over the
 * limit, or `null` when the request may proceed. `bucket` namespaces the
 * counter per function (`place-order`, `submit-review`) so the two never
 * share a budget.
 */
export async function rateLimited(
  supabase: any,
  request: Request,
  bucket: string,
  maxCount: number,
  windowSeconds: number,
  cors: Record<string, string>,
): Promise<Response | null> {
  const key = `${bucket}:${clientKey(request)}`;

  const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  });

  // A rate limiter that fails open on its own error is still better than one
  // that takes the whole endpoint down over a transient database hiccup —
  // logged so a real, persistent failure is diagnosable.
  if (error) {
    console.error(`${bucket}: rate limit check failed:`, error);
    return null;
  }

  if (allowed) return null;

  return new Response(
    JSON.stringify({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests from this connection. Please wait a few minutes and try again.",
      },
    }),
    { status: 429, headers: { ...cors, "Content-Type": "application/json" } },
  );
}
