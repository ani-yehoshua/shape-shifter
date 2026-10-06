-- Subscriptions bought at Stripe Checkout without an account (mobile app,
-- anonymous paywall). public.subscriptions.user_id is NOT NULL, so these are
-- held here keyed by the checkout email until someone signs in with that
-- email and /api/claim-subscription moves the row into public.subscriptions.
-- Same idea as The Hair Insider's pending_entitlements.
create table if not exists public.pending_subscriptions (
    id uuid primary key default gen_random_uuid(),
    -- stored lowercased; the claim matches with equality, not ILIKE, so
    -- "_" / "%" in an address can never widen the match
    email text not null,
    stripe_cust_id text,
    stripe_sub_id text not null unique,
    tier text,
    status text,
    current_period_end timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists pending_subscriptions_email_idx
    on public.pending_subscriptions (email);

-- Service role only (webhook + claim route): RLS on, no policies.
alter table public.pending_subscriptions enable row level security;
