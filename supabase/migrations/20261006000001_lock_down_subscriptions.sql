-- Clients must not be able to write their own subscription row. The old
-- "users can upsert own sub" (INSERT) and "users can update own sub"
-- (UPDATE) policies let any signed-in user set status='active' and a far-
-- future current_period_end on their own row straight through the API --
-- which is exactly what the app reads to decide who is Pro.
--
-- Subscriptions are now written only by the service role (Stripe webhook,
-- /api/checkout, /api/claim-subscription, /api/delete-account), which
-- bypasses RLS. Clients keep read access to their own row (used by
-- useSubscription on web and mobile).
drop policy if exists "users can upsert own sub" on public.subscriptions;
drop policy if exists "users can update own sub" on public.subscriptions;

-- Belt and braces: even if a permissive write policy is added back by
-- mistake, the API roles have no write privileges on this table.
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;
