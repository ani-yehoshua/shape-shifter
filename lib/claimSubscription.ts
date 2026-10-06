// Moves a subscription bought at Checkout without an account (anonymous
// branch of /api/checkout; stored by the Stripe webhook in
// pending_subscriptions) onto the user who signs in with the checkout email.
// Callers must pass a user id + email that Supabase has verified (OTP /
// magic-link sign-in) -- that is what proves they own the address the
// purchase was made with. Safe to call on every sign-in.
import { createClient } from '@supabase/supabase-js';

const ACTIVE = new Set(['active', 'trialing', 'past_due']);

export function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Supabase admin envs not set');
    return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function claimPendingSubscription(
    userId: string,
    email: string,
): Promise<boolean> {
    const admin = getSupabaseAdmin();

    // Emails are stored lowercased and matched with equality (never ILIKE,
    // so "_" / "%" in an address can't widen the match).
    const { data: pending, error: pendingErr } = await admin
        .from('pending_subscriptions')
        .select('*')
        .eq('email', email.toLowerCase())
        .order('created_at', { ascending: false });
    if (pendingErr) throw pendingErr;
    if (!pending?.length) return false;

    // One subscriptions row per user: take a live pending sub if there is
    // one, otherwise the newest.
    const chosen = pending.find(p => ACTIVE.has(p.status ?? '')) ?? pending[0];

    // Don't clobber a subscription the account already has in good
    // standing (e.g. they paid twice); leave the pending rows alone.
    const { data: existing } = await admin
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', userId)
        .maybeSingle();
    const existingLive =
        !!existing &&
        ACTIVE.has(existing.status ?? '') &&
        new Date(existing.current_period_end ?? '') > new Date();
    if (existingLive) return false;

    const { error: upsertErr } = await admin.from('subscriptions').upsert(
        {
            user_id: userId,
            stripe_cust_id: chosen.stripe_cust_id,
            stripe_sub_id: chosen.stripe_sub_id,
            tier: chosen.tier,
            status: chosen.status,
            current_period_end: chosen.current_period_end,
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
    );
    if (upsertErr) throw upsertErr;

    await admin
        .from('pending_subscriptions')
        .delete()
        .in(
            'id',
            pending.map(p => p.id),
        );

    return true;
}
