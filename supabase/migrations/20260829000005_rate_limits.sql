-- ---------------------------------------------------------------------------
-- Rate limiting — requirements section 17: "Apply rate limiting to order
-- placement, review submission, and search to prevent abuse and spam."
--
-- This closes the gap flagged since section 7 and repeated in section 16:
-- `place-order` and `submit-review` have accepted unlimited requests from
-- anyone. "A client-side limit is not a limit" (section 17's own words), so
-- this has to be enforced where the write actually happens — inside the two
-- Edge Functions, backed by a durable, shared counter. Not in-memory state in
-- the function itself: a serverless function has no single running instance
-- to hold a counter in, so two concurrent invocations on two different
-- instances would each see zero and both let a request through.
--
-- Postgres is the counter, because it is already the one thing both Edge
-- Functions can reach that is centralised, durable, and free — no queue, no
-- external rate-limiting service, no new infrastructure (this project
-- deliberately runs with no Docker and no service beyond Supabase itself).
--
-- SEARCH IS NOT RATE LIMITED HERE, and cannot be with this mechanism — see
-- context.md for why: it reads `product_summaries` straight over PostgREST
-- with the anon key, the same read every product listing already makes, so
-- there is no server-side code between the request and the database for a
-- check like this to run inside.
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  -- "<bucket>:<identity>", e.g. "place-order:203.0.113.5". One row per
  -- identity per bucket, upserted in place — the table's size is bounded by
  -- how many distinct callers have ever been seen, not by how many requests
  -- they made.
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table public.rate_limits enable row level security;
-- No policies at all: this table is never read or written directly by a
-- client, only through `check_rate_limit()` below (SECURITY DEFINER) called
-- by the Edge Functions' service-role client. RLS being enabled with no
-- policy is what makes it closed by default, the same as every other table.

-- ---------------------------------------------------------------------------
-- check_rate_limit — a fixed-window counter, atomic under concurrency.
--
-- Two requests from the same caller arriving at the same instant must not
-- both read "0" and both be allowed through, which is why this is one
-- statement rather than a select-then-update: `insert ... on conflict ...
-- returning` takes a row lock on the upsert, so a concurrent second call
-- waits for the first to finish rather than racing it.
--
-- Returns true = allowed, false = rate limited. The window resets itself:
-- once `window_start` is older than the window, the next call for that key
-- starts a fresh window rather than needing a cleanup job to run first.
-- ---------------------------------------------------------------------------

create or replace function public.check_rate_limit(
  p_key text,
  p_max_count integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now constant timestamptz := now();
  v_row public.rate_limits;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case
          when public.rate_limits.window_start <= v_now - make_interval(secs => p_window_seconds)
            then 1
          else public.rate_limits.count + 1
        end,
        window_start = case
          when public.rate_limits.window_start <= v_now - make_interval(secs => p_window_seconds)
            then v_now
          else public.rate_limits.window_start
        end
  returning * into v_row;

  return v_row.count <= p_max_count;
end;
$$;

-- Only the Edge Functions' service-role client ever calls this — there is no
-- legitimate reason for a browser to call it directly, so it is not granted
-- to anon or authenticated. `find_order_for_review` below also calls it, but
-- as a SECURITY DEFINER function it runs with its OWNER's privileges when it
-- does, not the anon caller's — so no separate grant is needed for that path.
--
-- POSTGRES GRANTS EXECUTE ON A NEW FUNCTION TO PUBLIC BY DEFAULT, unlike a
-- table. Left alone, that would let anyone call this directly with someone
-- else's bucket key — `check_rate_limit('place-order:1.2.3.4', 1, 999999)`
-- would trip a real customer's rate limit for them. The revoke below is not
-- defensive boilerplate; it is the fix for a real hole this function would
-- otherwise have on the day it is created.
revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- find_order_for_review, RATE LIMITED.
--
-- SUPERSEDED. The live definition is now
-- 20260831000002_pending_orders_delivered_reviews.sql, which kept everything
-- below — the rate limit included — and narrowed the status test to
-- 'delivered'. Edit THAT one.
--
-- This is the one read in the whole schema an anonymous caller can invoke
-- directly with no server-side code in front of it at all (section 16) — and
-- unlike a plain table read, guessing wrong here is exactly what it would
-- take to brute-force a stranger's order number and email. It had no
-- protection until now. Restated (not a new function — same name, same
-- signature, same columns) with a check at the top; `volatile` replaces the
-- original `stable` because it now writes to `rate_limits` via
-- `check_rate_limit`, so it is no longer side-effect-free.
--
-- The caller's IP comes from `current_setting('request.headers', true)`,
-- which PostgREST populates from the request for every function call —
-- the same mechanism RLS policies on this project could use to see a
-- header, just reached from a function body instead.
-- ---------------------------------------------------------------------------

create or replace function public.find_order_for_review(p_order_number text, p_email text)
returns table (
  order_id uuid,
  review_token uuid,
  product_id uuid,
  product_name text,
  product_slug text,
  size public.product_size,
  qty integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text;
  v_allowed boolean;
begin
  v_ip := coalesce(
    nullif(split_part(coalesce(current_setting('request.headers', true), '{}')::json->>'x-forwarded-for', ',', 1), ''),
    'unknown'
  );

  v_allowed := public.check_rate_limit('find-order-for-review:' || v_ip, 20, 900);
  if not v_allowed then
    raise exception 'Too many attempts. Please wait a few minutes and try again.' using errcode = '55000';
  end if;

  return query
  select o.id, o.review_token, oi.product_id, oi.name, oi.slug, oi.size, oi.qty
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.status <> 'cancelled'
    and o.order_number = btrim(p_order_number)
    and lower(o.email) = lower(btrim(p_email));
end;
$$;

grant execute on function public.find_order_for_review(text, text) to anon, authenticated;
