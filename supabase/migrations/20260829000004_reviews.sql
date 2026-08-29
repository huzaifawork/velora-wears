-- ---------------------------------------------------------------------------
-- Reviews and ratings — requirements section 16.
--
-- The `reviews` table, its RLS, and the `product_summaries` view's rating
-- columns are already live (0001). What was missing was the WRITE path:
--
--   - editing a review needs a way to tell "was this touched recently" from
--     "created_at", which doubled as both until now — a customer's review
--     that reads as brand new could actually be a five-month-old edit;
--   - a guest has no `auth.uid()`, so they cannot be scoped by the RLS
--     pattern `orders` already uses for signed-in customers. Section 16 is
--     explicit about how they should be able to prove ownership instead:
--     "the guest should be able to verify with their order number together
--     with the email address used on the order."
--
-- The actual WRITE — insert, update, delete — still goes through the
-- `submit-review` Edge Function with the service role key, exactly like
-- `place-order`: a review is tied to a specific order, and only trusted
-- server code should be deciding whether an order really contains the
-- product being reviewed (requirements section 17 — never trust a
-- client-asserted fact that money or provenance depends on).
-- ---------------------------------------------------------------------------

alter table public.reviews add column updated_at timestamptz not null default now();

create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- find_order_for_review — the guest "verify with order number + email" path.
--
-- A guest arriving at a product page days after their order has no session
-- and no reviewToken lying around (that only lives in sessionStorage for the
-- tab that placed the order — see `lib/orderReceipt.ts`). `orders` has no
-- select policy for anon at all, by design, so this is what section 16 asks
-- for instead: prove ownership with the order number and the email the order
-- was placed under, and get back exactly enough to open the review form —
-- nothing that touches the customer's name, phone or address.
--
-- SECURITY DEFINER is what lets an anon caller run this despite RLS closing
-- `orders` to them; the returned columns are the boundary that keeps it from
-- becoming a way to read PII through the back door.
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
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.review_token, oi.product_id, oi.name, oi.slug, oi.size, oi.qty
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.status <> 'cancelled'
    and o.order_number = btrim(p_order_number)
    and lower(o.email) = lower(btrim(p_email))
$$;

-- Callable directly over PostgREST with the anon key — this is a read with no
-- side effects, so it does not need the Edge Function's service role the way
-- a write does.
grant execute on function public.find_order_for_review(text, text) to anon, authenticated;
