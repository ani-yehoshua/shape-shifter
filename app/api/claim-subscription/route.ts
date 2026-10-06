// Moves a subscription bought at Checkout without an account (see the
// anonymous branch of /api/checkout and the webhook) onto the signed-in
// user, matched by the checkout email. Safe to call on every sign-in: the
// caller's Supabase user email is verified (OTP sign-in), which is what
// proves they own the address the purchase was made with.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE = new Set(['active', 'trialing', 'past_due']);

function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Supabase admin envs not set');
    return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization') || '';
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : null;
        if (!token) {
            return NextResponse.json(
                { error: 'Not authenticated' },
                { status: 401 },
            );
        }

        const admin = getSupabaseAdmin();
        const { data, error } = await admin.auth.getUser(token);
        const user = data?.user;
        if (error || !user?.email) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 },
            );
        }

        const { data: pending, error: pendingErr } = await admin
            .from('pending_subscriptions')
            .select('*')
            .eq('email', user.email.toLowerCase())
            .order('created_at', { ascending: false });
        if (pendingErr) throw pendingErr;
        if (!pending?.length) return NextResponse.json({ claimed: false });

        // One subscriptions row per user: take a live pending sub if there
        // is one, otherwise the newest.
        const chosen =
            pending.find(p => ACTIVE.has(p.status ?? '')) ?? pending[0];

        // Don't clobber a subscription the account already has in good
        // standing (e.g. they paid twice); leave the pending rows alone.
        const { data: existing } = await admin
            .from('subscriptions')
            .select('status, current_period_end')
            .eq('user_id', user.id)
            .maybeSingle();
        const existingLive =
            !!existing &&
            ACTIVE.has(existing.status ?? '') &&
            new Date(existing.current_period_end ?? '') > new Date();
        if (existingLive) return NextResponse.json({ claimed: false });

        const { error: upsertErr } = await admin.from('subscriptions').upsert(
            {
                user_id: user.id,
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

        return NextResponse.json({ claimed: true });
    } catch (err: any) {
        console.error('Claim subscription error:', err);
        return NextResponse.json(
            { error: 'Failed to claim subscription', details: err.message },
            { status: 500 },
        );
    }
}
